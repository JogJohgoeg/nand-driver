# Mini-compatible architectural state: Hazard3 adapter contract

**Primary information:** the mini-compatible architectural and RAM units now feed a bounded hardware witness controller: 1,982 CPU48/RAM-root/state-hash cases pass. The explicit call-phase wrapper passes separately; stock Hazard3 integration and full MMIO remain open.

**Required context:** [measured Hazard3 differences](csr_deltas.json), [pinned mini source](../../onchain_inference/rv32/mini-rv32ima.h), [golden vectors and call-boundary counterexample](csr_compat_vectors.json), [current hardware scope](REPORT.md), and [bank transition contract](../../riscv_machine/stateless/BankTransition.sol).

**Next judgement:** integrate the passing architectural unit with actual Hazard3 state, precise exceptions and committed memory, preserving its explicit call-entry control. Do not use the existing mini-supplied CSR projection as hardware evidence or add this block to the frozen first TT tile.

Expression: sectioned contract with field/rule comparison tables and ordered acceptance gates. The reader is the referee RTL implementer; the decision is which semantics must be implemented before state commitments are credible.

## State and reset boundary / 状态边界

The serialization is exactly 192 bytes: 48 unsigned 32-bit words, each little-endian. RAM is 16 MiB starting at guest address `0x80000000`, represented by 16,384 indexed 1,024-byte leaves. All arithmetic below wraps at 32 bits unless a 64-bit pair is specified. A hardware snapshot must capture actual adapter registers and committed stores coherently; younger pipeline writes must not reach the root.

| CPU word indices | Fields | Required interpretation |
|---|---|---|
| 0–31 | x0–x31 | Suppress writeback to x0; the interpreter preserves its stored word, so authorized initialization must set x0 to zero |
| 32–35 | pc, mstatus, cyclel, cycleh | Raw PC/status bits, logical instruction-attempt counter; never physical clock cycles |
| 36–39 | timerl, timerh, timermatchl, timermatchh | 64-bit logical timer and comparison pair |
| 40–43 | mscratch, mtvec, mie, mip | Raw 32-bit architectural storage; mip bit 7 also changes at call entry |
| 44–47 | mepc, mtval, mcause, extraflags | Raw exception state; extraflags bits 1:0 privilege, bit 2 WFI, bits 31:3 reservation |

Pilot initialization is all-zero CPU words except PC `0x80000000` and extraflags `3`; initial RAM and program are externally authorized. A snapshot-load interface must also accept non-reset states without normalizing raw CSR bits. Clearing internal pipeline state and observing a quiescent RAM boundary is mandatory before acknowledging a load. These are adapter requirements, not existing Hazard3 features.

## CSR decode and update / CSR 精确规则

CSR instruction forms are funct3 1/2/3/5/6/7. Forms 1/2/3 use the stored rs1 value; 5/6/7 use the five-bit rs1 field as an immediate. The old CSR value is written to rd unless rd is zero. The new value is respectively operand, old OR operand, or old AND NOT operand. There are no privilege checks, read-only CSR faults, WARL masks or special zero-operand suppression in this mini profile.

| CSR addresses | Reads | Writes |
|---|---|---|
| 0x300 / 0x305 / 0x304 / 0x344 | mstatus / mtvec / mie / mip | Preserve all 32 bits |
| 0x340 / 0x341 / 0x342 / 0x343 | mscratch / mepc / mcause / mtval | Preserve all 32 bits |
| 0xc00 | Local cycle counter **after this instruction's increment** | Ignore |
| 0x301 | `0x40401101` | Ignore |
| 0xf11 | `0xff0ff0ff` | Ignore |
| Every other address, including 0xc80, 0xb00, PMP and hardware-specific CSRs | Zero | Ignore |

The golden generator checks all 4,096 addresses, six forms, and privilege 0/3 against independent Python rules, including cycle-low rollover and full CPU48 comparison. [Generator](csr_compat_vectors.py), [compressed fixed-record vectors](csr_compat_vectors.bin.gz), [results, hashes and field names](csr_compat_vectors.json). Each 392-byte decompressed record is instruction LE32, pre CPU48, post CPU48, signed status LE32. These are reference vectors, not RTL or deployed-EVM test results.

The eight stock-core deltas remain open in the integrated Hazard3 core: identity values, reset mstatus, logical cycle counting, writable mtval/mip, unmasked mtvec and unmasked mepc. Source integration points are [Hazard3 CSR RTL](vendor/hazard3_hdl/hazard3_csr.v): mstatus uses selected bit registers; mtvec/mepc enforce masks; counters have inhibit and physical-cycle behavior. Replacing only the CSR read mux would leave trap routing, interrupt entry and write side effects wrong.

## Call entry, instruction attempt and traps / 调用与异常

At **call entry**, add unsigned elapsedUs to timerl, increment timerh on carry. Set MTIP and clear WFI iff the 64-bit timer is strictly greater than timermatch and timermatch is nonzero; otherwise clear only mip bit 7. If WFI remains set, return status 1 without a fetch, PC change or cycle increment. If MTIP, mie bit 7 and mstatus bit 3 are all set, enter interrupt cause `0x80000007` without incrementing cycle. Otherwise attempt instructions.

For each attempted instruction increment the local cycle-low value before fetch/decode, including faults. On return, increment cycleh if final local cycle-low is less than the stored entry cycle-low. Do not increment for a sleeping WFI return or a call-entry interrupt. The one-step Solidity profile calls this sequence once per instruction attempt at elapsedUs 0. A long C call checks the timer once at entry, not again between its instructions.

**Measured counterexample:** write `0xffffffff` to mip, then read mip with timer/match zero. One count=2 call returns x3 and mip `0xffffffff`; two count=1 calls return `0xffffff7f`, because the second call clears MTIP. The [CPU48 records](csr_compat_vectors.json) differ in x3 and mip. Thus retirement count alone cannot identify the exact chain state around these operations. This is measured against pinned mini only, not a new deployed-EVM measurement.

A subsequent [exact deployed-runtime guest test](check_call_boundary.py) confirms the same distinction across two real 1,024-instruction flips in local PyEVM: x3 is `0xffffffff` after flip 1 and `0xffffff7f` after flip 2, with all CPU48 fields and all RAM pages equal to mini using matching call boundaries. Local execution gas is 1,653,102 and 1,618,445. Splitting the first flip into 1,024 count=1 calls instead changes fields 3 and 43. [Measured CPU states and pinned runtime hash](call_boundary_evm.json). No network transaction was performed.

The existing [four-tick EVM continuation](check_chain_window.py) uses count 1,024 and elapsedUs `(cyclel - timerl) mod 2^32` per tick. Its bounded Linux projection passes, but that does not prove arbitrary tick splitting. A chain-compatible adapter must bind the call length/remaining budget, call-entry flag, elapsed-time input and return conditions, or restrict the accepted profile to a separately proven single-step/no-interrupt domain. Those environment fields belong in a versioned commitment outside CPU48. The current `state-v1` hash alone has no call-phase field.

The separate [tick-refinement Solidity prototype](../../riscv_machine/stateless/TICK_REFINEMENT.md) now binds remaining budget and a deferred cycle-high carry in `tick-state-v1`. It passes 3,076 microsteps across the measured two-flip counterexample, rollover, IRQ, WFI and trap cases, plus a 10-round dispute. [Results](../../riscv_machine/stateless/tick_results.json). Only the two CSR/MIP endpoints independently match the deployed wrapper; the other cases validate the native interpreter core. The wrapper observations below require additional state and idle-cycle processing absent from this prototype. This does not change the earlier elapsedUs=0 bank profile. The base RTL unit increments cycleh per handled instruction; the new call wrapper below defers that increment until call return.

| Event | Required architectural effect |
|---|---|
| Synchronous fault | mcause is the cause below; mepc is faulting PC; mtval is effective address for load/store/AMO access faults and PC for other causes |
| Call-entry timer interrupt | mcause `0x80000007`, mtval 0, mepc original PC, no instruction attempt |
| Any trap entry | mstatus becomes `((old & 8) << 4) | ((extraflags & 3) << 11)`; extraflags OR 3; PC becomes raw mtvec, with no mode decoding/alignment mask |
| MRET | Accept any SYSTEM funct3=0 with CSR-number low byte 0x02; mstatus becomes `((old & 0x80) >> 4) | ((oldExtraflags & 3) << 11) | 0x80`; privilege becomes old mstatus bits 12:11; other extraflags preserved; PC becomes raw mepc |
| WFI instruction 0x10500073 | Set mstatus bit 3 and extraflags bit 2; retire PC+4 and cycle; return status 1 |
| ECALL | Cause 8 if privilege bits are zero, otherwise cause 11, including privilege encodings 1/2 |
| EBREAK | Cause 3; it is not inherently a model-job termination event |

Fetch bounds are checked before PC alignment: outside RAM gives cause 1; in-RAM non-four-byte-aligned PC gives cause 0. Illegal instruction gives cause 2. Ordinary out-of-RAM load gives cause 5; store or AMO gives cause 7. A bad raw mtvec/mepc can therefore be stored successfully and fault on the later fetch. No writeback to rd on a trapped instruction.

## RAM, atomics and environment / 内存与环境

RAM byte/halfword/word loads and stores are little-endian and allow unaligned accesses, including page crossings. The guard is `uint32(address - RAM_BASE) < RAM_SIZE - 3` **for all widths**, so even a byte access to the last three RAM bytes faults. A bounded instruction witness needs at most three pages: fetch plus two data pages. An adapter must gate committed stores; issuing a younger bus write then correcting its hash is insufficient.

For LR.W, store `(oldExtraflags & 7) | (ramOffset << 3)` and read the word. SC.W succeeds iff `(extraflags >> 3) == (ramOffset & 0x1fffffff)`; it returns 0 and writes rs2 on success, otherwise returns 1. There is no separate valid bit and successful SC does not consume the reservation. Ordinary stores and intervening atomics do not clear it. AMOs select the operation from bits 31:27 and ignore aq/rl and width encoding; all unaligned accesses use the same RAM guard. Unknown AMO kinds trap without a write. A fixed AHB exclusive-success input cannot implement these rules. Two consecutive successful unaligned SCs are recorded in the directed vectors.

The pinned header reserves `0x10000000 <= address < 0x12000000` for ordinary load/store MMIO callbacks; AMO accesses there fault. The RAM-only Solidity arbiter deliberately rejects that window. The bare header's default callbacks are no-ops, and the old snapshot experiment returns `0x60` at UART status `0x10000005`; neither defines the complete deployed UART/timer/syscon contract. Therefore the first adapter profile must reject MMIO before side effects. Full Linux support requires separately pinned read/write responses, console transcript, timer/syscon semantics and input cursor, then exact-EVM tests. Do not silently reuse the old snapshot callback as that specification.

Permissive decode also belongs to compatibility: M-extension selection tests instruction bit 25 rather than full funct7; JALR ignores funct3; opcode 0x0f fences are no-ops; SYSTEM return aliases and unknown CSRs follow the rules above. A strict Hazard3 decoder may reject operations mini accepts. Route these through an explicit compatibility path before execution, rather than rewriting their reported retirement afterward.

## Deployed-wrapper observations / 已测外层行为

The exact previously fetched runtime was executed in isolated PyEVM state for **211 MMIO cases and 37 wrapper cases**, plus input submission while sleeping. No network calls or funds were used. [MMIO probe](mmio_evm_probe.py), [MMIO records](mmio_evm_probe.json), [wrapper probe](tick_wrapper_probe.py), [wrapper records and runtime SHA256](tick_wrapper_probe.json). The [executable saved-record check](check_wrapper_observations.py) passes all CPU48/counter/event expectations and independently compares 25 core scenarios to native mini. [Check result](wrapper_observations_checked.json). These are bounded observations; untested addresses, long input queues, counter overflow and full Linux continuation are not established by them.

| Boundary | Observed deployed behavior |
|---|---|
| Call-entry elapsed time | With history H in slot 9 low 64 bits, elapsed is `(cyclel - low32(H)) mod 2^32`; history updates to `(H + elapsed) mod 2^64`, with no spill into halt status. Add elapsed to the CPU timer pair before the core call. CPU cycleh does not supply this history. |
| Core WFI or already sleeping | Core return 1 causes another 1,024 logical cycles, including cycleh carry. An executed WFI thus advances 1,025 cycles; already sleeping advances 1,024. The timer is sampled at entry, before this idle addition. |
| Counters | Slot 9 bits 128–255 accumulate cycle delta modulo 2^128, including idle cycles. Carry from bit 191 reaches bit 192. Slot 10 increments once per tested flip modulo 2^256. These counters are outside CPU48. |
| UART data/status | Loads at `0x10000000` consume the next input byte or return 0 when empty. `0x10000005` returns 0x61 with data or 0x60 empty. A queued 0x80 remains 0x80 for every tested funct3, including LB; the MMIO callback bypasses ordinary RAM sign extension and width validation. |
| UART output | Stores at `0x10000000` emit the low byte for all eight tested funct3 encodings and increment the console sequence. The queue `41 00` is consumed as two bytes; NUL is not an empty-queue sentinel. |
| Timer MMIO | Loads at `0x1100bff8` / `0x1100bffc` return the sampled timer low/high words. Stores at `0x11004000` / `0x11004004` replace full match low/high words. Tested loads from these match addresses return 0; stores to timer addresses are ignored. |
| Syscon | A nonzero store to `0x11100000` stops after the store and persists its value in slot 9 bits 64–127. The next tick reverts. Value 1 also receives the 1,024 idle-cycle addition; 2, 0x5555, 0x7777 and 0xffffffff do not. Value 0 continues into the next instruction. |
| Input while sleeping | `typeInput(bytes)` with `41 00 80` changes the short-byte queue in slot 11 and emits an input event; all CPU48 fields, including WFI, stay unchanged. This does not establish append/long-queue storage semantics. |

The current call wrappers derive elapsed from cyclel minus timerl and omit the deployed idle addition. They therefore match the measured normal CSR/MIP profile and native core call protocol, not arbitrary deployed ticks. A future live profile must bind history, persistent status, input position/content and console effects, define wrapper transitions separately from instruction attempts, and test those commitments against this runtime. Keep `state-v1` elapsedUs=0 and `tick-state-v1` unchanged; silently adding this behavior would change existing trace roots.

## Implementation boundary and acceptance / 实现门槛

A separate [RAM-only authenticated environment prototype](../../riscv_machine/stateless/ENVIRONMENT.md) now passes 32 saved wrapper/counter endpoints and four fresh RAM-write endpoints; it binds history, counters and call state with a new format. It still rejects MMIO; a separate two-transition local dispute and 5,197-witness authenticated hardware environment test pass. Actual Hazard3 pipeline/SRAM integration remains open.

Seven additional [counter-boundary probes](wrapper_counter_probe.py) pass exact CPU48 and packed-storage assertions in the local deployed runtime. [Records and source/runtime hashes](wrapper_counter_probe.json). They cover history overflow at 64 bits, accumulation overflow at 64 and 128 bits, preserved upper accumulator bits, and flip-counter overflow at 64 and 256 bits. These synthetic sleeping states establish the arithmetic boundaries; they do not establish reachability from a real deployment. In particular, a future environment commitment must retain the upper 64 accumulator bits rather than assuming slot 9's top quarter is zero. Existing trace formats remain unchanged.

The separate combinational [mini_arch_step.v](mini_arch_step.v) now implements CSR/system, call-entry timer/WFI/interrupt handling, PC faults and explicit synchronous fault input. It accepts a coherent CPU48 frame, instruction, call-entry flag and elapsedUs; it returns CPU48, status and a supported flag. An ordinary arithmetic instruction returns unsupported with the CPU frame unchanged, so the caller cannot mistake this for a full interpreter. Instruction/fault inputs still require a correct fetch/datapath. The unit stores no state, performs no RAM operation and has no physical timing claim.

[Verilator evidence](arch_check.log) passes all 49,152 exhaustive CSR cases and 23 directed interface checks, including two explicit unsupported arithmetic cases and both sides of the call-boundary counterexample. [Testbench](check_arch.cpp), [directed vector manifest](arch_vectors.json), [vector exporter](export_arch_vectors.py), [build log](arch_build.log), [remote build script](../remote/referee_arch.sh). This is actual RTL simulation with all 48 output words compared; it is not a Hazard3 pipeline run, retirement/RAM proof or full MMIO/atomic adapter. Upstream Hazard3 and first-tile RTL/GDS remain unchanged.

The separate [mini_arch_call.v](mini_arch_call.v) wraps that unit with remaining budget and deferred carry, derives elapsedUs at call entry, ends a call on trap/IRQ/WFI and preserves unsupported frames for the arithmetic engine. **2,054 RTL vectors pass**, covering two complete 1,024-CSR calls (mip preservation and cycle rollover), IRQ/WFI/trap returns, malformed phase and unsupported arithmetic. CPU48, remaining, carry, status, support and invalid outputs all compare exactly. [Run log](arch_call_check.log), [testbench](check_arch_call.cpp), [reference exporter](export_arch_call_vectors.py), [vector manifest](arch_call_vectors.json). Full-call endpoints were independently checked against mini. This is still a combinational interface unit without Hazard3 pipeline, instruction fetch or RAM integration.

The separate [mini_ram_step.v](mini_ram_step.v) now adds the RAM-only I/M/A datapath to that architectural unit. It consumes the instruction and a four-byte little-endian RAM window at its effective address, and emits CPU48 plus address/write-data/byte-mask effects. Unaligned windows may span pages. For ordinary datapath operations it uses an architecturally neutral unknown-CSR write with rd=x0 inside the existing control unit, then applies the real datapath result only when no trap/WFI/IRQ stops execution. MMIO is unsupported without effects; a prior sleep, interrupt or fetch fault still takes precedence.

**6,967 RTL vectors pass**, covering the complete 1,712-instruction MLP, 246 shared ISA cases, 5,000 random instruction words, LR/store/repeated-SC persistence, MMIO rejection and the three MMIO-priority cases. All CPU48 words, status, supported flag and RAM-write address/data/mask compare against pinned mini. [Evidence](ram_results.json), [reference exporter](export_ram_vectors.py), [testbench](check_ram.cpp). Division is currently combinational; there is no physical timing/area claim or SRAM/fetch/Merkle engine.

The [mini_ram_call.v](mini_ram_call.v) wrapper adds the same remaining-budget/deferred-carry protocol across the RAM datapath. **4,792 vectors pass**: 3,076 microsteps from the existing mini/EVM tick-boundary checks, 1,713 MLP attempts through the stopping EBREAK across two calls, and three invalid/unsupported phase cases. Both MLP call endpoints independently match native mini CPU48 and all RAM bytes. The RTL compares every microstep's CPU48/phase/status and RAM-write effects. [Evidence](ram_call_results.json), [exporter](export_ram_call_vectors.py), [testbench](check_ram_call.cpp), [bounded remote build](../remote/run_ram_local.sh). These units implement a separate compatible execution path; they do not modify or integrate the stock Hazard3 pipeline.

The [bounded RAM controller](bounded_ram_step.v) now authenticates page witnesses, checks fetched bytes, applies at most two coherent page updates and registers the resulting CPU/root. Its [commit wrapper](bounded_ram_commit.v) passes **1,982 witnesses**, including exact state hashes. [Evidence and scope](bounded_commit_results.json), [controller report](REPORT.md). This elapsedUs=0 state-v1 controller still relies on a stable external witness interface and is separate from the tick-phase wrapper and Hazard3 pipeline.

1. Add adapter-owned CPU48 architectural storage and coherent load/snapshot handshake in a separate fork. Maintain Hazard3 as the arithmetic candidate, with a pre-execution path for CSR/system/traps, unusual encodings and unaligned/atomic accesses. No private CSR value may be silently substituted in a returned snapshot.
2. Expose an explicit call-entry/elapsed/count interface. Emit an architectural step event for faulting attempts, WFI and no-retirement interrupts as well as normal retirement. Quiesce the pipeline at exceptions and snapshot boundaries; commit stores in architectural order.
3. Preserve the passing 49,152 CSR/23 directed unit tests, then run the 19 reference directed cases through the complete core including memory. Carry the now-passing LR/store/SC, RAM-boundary and MMIO-priority cases through the stateful fetch/memory integration. Require all CPU48 fields, return status, committed bytes and dirty-page sets, not just GPR retirement.
4. Rerun the MLP and bounded Linux prefix, then exact deployed-EVM windows using matching call boundaries. Extend beyond UART only after the environment contract is executable. The bounded prototype already connects RAM roots and trace commitment; carry that acceptance handshake into the full system only after these environment checks.

中文：独立CSR/system单元通过49,152个CSR向量及23个接口测试；新增RAM数据通路通过6,967向量，调用阶段封装通过4,792向量，逐项比较CPU48与写内存效果。尚未接入Hazard3流水线、取指、SRAM和Merkle调度。完整兼容目标仍包括全部48个CPU字段、已提交内存和明确调用边界。计时器在每次调用入口采样，拆分会改变mip等可观察结果；必须绑定调用阶段。首片TT保持不变。

Section-5 review: one compatibility contract leads, with explicit evidence/unknowns and next acceptance action; tables compare fields and rules with units and ranges. One H1 and three opening answers. Static document has no forms, scheduling, modal or drag controls; local link and narrow/keyboard checks are recorded in the companion documentation review evidence.
