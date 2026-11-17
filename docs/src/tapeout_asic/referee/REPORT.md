# Referee prototype: authenticated mini steps and Hazard3 compatibility

**Primary information:** the RAM-only referee now passes 1,982 saved witnesses through a 32-bit host interface and three IHP SRAMs, mapping to 2.113 mm² before physical overhead. Physical checks are running. Separate call-environment and fixed-input MMIO variants pass 5,197 and 5,747 witnesses. These are mini-compatible arbiters; stock Hazard3 retains eight measured CSR differences.

**Required context:** [source pins/configuration](hazard3_provenance.json), [semantics contract](../SEMANTICS.md), [Solidity arbiter](../../riscv_machine/stateless/REPORT.md), and [the one-tile submission](../tt/REPORT.md). This larger referee/hash prototype is separate from the frozen TT tile.

**Next judgement:** complete physical checks for the owned-SRAM arbiter and smaller SRAM/hash block; then integrate the MMIO profile and authenticate live input append. Preserve the frozen TT tile; these tests do not establish full Linux/MMIO or production settlement.

Expression: sectioned prototype detail, with comparison tables for semantic deltas and measured area. Reviewed2026-09-13. No transactions/burns.

## Authenticated bounded hardware step / 认证单步硬件

[bounded_ram_step.v](bounded_ram_step.v) accepts CPU48, a RAM root and at most three sorted, unique 1 KiB pages with 14 siblings each. It validates every supplied page against the old root before execution, gathers the required instruction/data bytes, and rejects missing pages or unsupported MMIO. The compatible I/M/A/CSR/trap unit determines architectural effects. At most two RAM pages can change in a four-byte access. When both change, the controller captures the first updated subtree and substitutes it at the second proof’s divergence level, avoiding reuse of a stale sibling.

[bounded_ram_commit.v](bounded_ram_commit.v) adds the existing `state-v1` hash. Only `done && accepted` releases CPU48, root, updated pages and hash together. CPU/root are registered; the caller holds the complete witness/context stable through completion, so output pages do not need another 24,576 flip-flops. This stable-input interface is a required precondition, not an adversarial-host or device-attestation guarantee. A future SRAM/driver must enforce it and apply memory writes only on acceptance.

| Locally simulated variant | Accepted / rejected witnesses | Largest tested clocks per witness | Evidence |
|---|---:|---:|---|
| Authenticated step, including RAM root updates | 1,972 / 10 | 2,872 | [step results](bounded_ram_results.json) |
| Step plus exact `state-v1` commitment | 1,972 / 10 | 2,927 | [commit results](bounded_commit_results.json) |

All 48 CPU words, RAM root, supplied-page bytes, dirty-page mask, status and rejection outputs compare exactly. The commitment variant additionally checks every accepted state hash. Cases include all 1,712 MLP instructions, 246 shared ISA cases, twelve store/AMO splits from neighboring leaves through the top RAM-tree split, the actual MiniCPM MUL and malformed witnesses. The [exporter](export_bounded_ram_vectors.py) first checks each positive witness against pinned mini and local Solidity; negatives are rejected in Solidity too. [RTL testbench](check_bounded_ram.cpp), [reproduction script](../remote/run_bounded_ram_local.sh). This is differential testing, not formal equivalence or an independent audit.

This is the elapsedUs=0, RAM-only `state-v1` profile. The separately tested call-phase and bank-state formats do not silently become part of this controller. It is not integrated into Hazard3, a running Linux system, a physical SRAM interface or a deployed settlement contract. It currently instantiates separate page-path and state-hash Keccak engines and combinational division; no complete-core area, useful frequency or power claim is made before measurement. The older area table below applies only to its named modules.

## Authenticated RAM environment / 调用环境硬件

[bounded_environment_commit.v](bounded_environment_commit.v) implements the separate [env-ram-state-v1 contract](../../riscv_machine/stateless/ENVIRONMENT.md). It authenticates the page witnesses, preserves call-entry timer sampling and deferred cycle-high carry, applies the wrapper's 1,024 idle cycles, updates history64/accumulator128/flips256, and hashes the accepted post-state. Existing state-v1 and tick-state-v1 formats remain unchanged.

**5,197 RTL witnesses pass: 5,187 accepted and 10 rejected; maximum 2,953 clocks per witness.** CPU48, RAM roots/page bytes, status, call phase, history, counters and state hashes match the Solidity oracle. These include the 32 saved deployed endpoints and four fresh RAM-write endpoints expanded into 5,155 microsteps, plus 32 context-byte mutations and malformed-state/page/MMIO rejections. Updated page bytes remain hidden until acceptance. [Results and source pins](environment_rtl_results.json), [run log](environment_check.log), [testbench](check_bounded_environment.cpp), [exporter](export_environment_vectors.py).

The [call-aware controller](bounded_call_step.v) is generated from the passing RAM controller using [13 asserted substitutions](prepare_bounded_call.py); [provenance](bounded_call_provenance.json). The [environment hash unit](environment_state_commit.v) serializes the exact 347-byte message into three Keccak blocks. [Reproduction](../remote/run_environment_local.sh) uses a separate remote directory under the same 16 GiB/nice10 constraints. This remains a stable-witness RAM prototype: no UART/input/syscon execution, actual Hazard3 pipeline, physical SRAM, device attestation or new PPA claim.

## Fixed-input MMIO environment / 固定输入MMIO硬件

[bounded_mmio_environment.v](bounded_mmio_environment.v) extends the separate controller with a fixed queue of at most 31 bytes, UART consumption/output, timer callbacks and syscon halt. It passes **5,747 witnesses (5,733 accepted / 14 rejected), 3,926,983 total test clocks, maximum 2,979 clocks per witness**. CPU48, root/pages, call phase, counters, input cursor, per-call console sequence, output transcript and full state hash match the software witnesses. [RTL results](mmio_rtl_results.json), [vector manifest](mmio_vectors.json), [exporter](export_mmio_vectors.py). Source and artifact SHA256 pins pass.

The software oracle is checked against 255 cached deployed-runtime endpoints plus four fresh queue/console boundaries. The hardware export also reuses four deployed cross-page RAM-write endpoints, malformed witnesses and context/IO byte checks. Deployed equality is measured at call endpoints; intermediate hardware states are compared to the separately validated Solidity profile. [Full profile contract and limits](../../riscv_machine/stateless/ENVIRONMENT.md#separate-fixed-input-mmio-profile).

[mini_mmio_step.v](mini_mmio_step.v) overlays callbacks on the unchanged RAM unit. The generated [hash scheduler](mmio_state_commit.v) shares one Keccak engine between the optional 80-byte console-byte preimage and the 448-byte `env-mmio-state-v1` preimage. Console sequence increments once per call with output; fresh two-byte output and sequence-wrap checks verify this batching. [Runnable build-host-2 check](../remote/run_mmio_local.sh) uses 16 GiB and nice10. Inputs remain stable through done, and page effects are exposed only on acceptance. No live input append, Hazard3 pipeline/SRAM integration, device attestation, physical area, Fmax or power is established.

## Core bring-up / 开源核启动

[Hazard3](https://github.com/Wren6991/Hazard3) stable revision `8af992930f71a69b0e06c38734c1094f41a05ca0` is an Apache-2.0 RV32 core with optional M/A/C and a retirement interface. The [vendored RTL](vendor/hazard3_hdl/hazard3_cpu_1port.v) is unmodified upstream source; project [wrapper](hazard3_top.v) enables RV32IMA, Zifencei, counters, U-mode and one PMP region, with compressed instructions/debug disabled. `HAZARD3_RVFI_STANDALONE` exposes a trace port; it does not mean we ran a formal proof.

The shared AHB test memory has16MiB RAM and no external interrupts. The MLP test executes **1,712 retired instructions in2,435clocks**, comparing instruction, pre/post PC, read operands and all32 registers reconstructed from retirement writes against pinned mini at every retirement. Final physical RAM matches all16MiB. This is an RV32IM workload; the AHB testbench's fixed exclusive-success input is not an LR/SC/global-exclusives implementation or an atomic conformance claim. [MLP log](mlp_check.log), [retirement trace](mlp_retire.csv), [testbench](check_hazard3.cpp).

The [upstream mini Linux6.1.14 demo image](https://github.com/cnlohr/mini-rv32ima-images/blob/master/images/linux-6.1.14-rv32nommu-cnl-1.zip) is3,476,752bytes. A35-instruction boot stub initializes x1–x31, installs the default DTB pointer and jumps to the unchanged kernel. Its DTB RAM size is patched to16MiB. [Input hashes](linux_inputs.json), [preparation](prepare_linux.py). This is not asserted to be the same kernel/image as the chain's page snapshots.

Initial traps came from disabled Zifencei and absent PMP registers; enabling the standard features gives a stock-core **100,000-retirement** prefix match. A longer run then exposes an actual reset-state difference at retirement112,317, PC0x80032a04, instruction0x30047af3: hardware reads mstatus0x1800, mini reads0. [First divergence](linux_first_divergence.log).

A separate [compatibility experiment](prepare_compat.py) changes only reset/tie-off MPP to0 while leaving actual privilege in M-mode. It then passes **300,000retirements in454,027clocks**, with registers/PC and retirement-projected RAM equal. The longer run reaches its first unimplemented UART MMIO access after334,088matched retirements; this is an environment boundary, not a processor performance limit. [300k log](linux300k_check.log), [MMIO boundary log](linux_compat_check.log). Upstream RTL remains unchanged in the vendor folder; the generated compatibility copy is a separate build.

At the300k checkpoint, RAM reconstructed from retired stores equals mini RAM. This avoids treating younger pipeline writes as committed memory. The saved48-field CPU is explicitly a **mini projection**: its registers/PC are checked against retirement data, while CSR/time fields come from mini. Four subsequent exact-deployed-EVM ticks match all48 projected CPU fields and all16,384RAM pages, costing2,335,681 /2,302,418 /2,292,672 /2,298,621local execution gas. [Window evidence](chain_window.json). This does **not** establish that raw Hazard3 CPU48 equals the chain.

## Measured architectural differences / 已测语义差异

A13-instruction [CSR probe](csr_probe.json) reads stock hardware and mini values in the same straight-line program. This records differences without treating them as equivalent. [Raw trace](csr_retire.csv), [structured results](csr_deltas.json).

| CSR | Hazard3 value | Pinned mini value | Required compatibility work |
|---|---|---|---|
| misa | 0x40901101 | 0x40401101 | Bind the advertised ISA/profile and exact read value |
| mvendorid | 0 | 0xff0ff0ff | Virtualize identity CSR |
| reset mstatus | 0x1800 | 0 | Reset/trap/MRET state semantics, not just one reset bit |
| cycle, fifth instruction | 0 | 5 | Hardware counter starts inhibited; mini counts interpreted instructions. Bind logical time |
| mtval after all-ones write | 0 | 0xffffffff | Mini retains writable trap-value state; hardware ties it to0 |
| mip after all-ones write | 0 | 0xffffff7f | Writable software state versus IRQ-derived/masked bits and timer updates |
| mtvec after all-ones write | 0xfffffffd | 0xffffffff | Mini preserves all bits; hardware WARL-masks vector mode |
| mepc after all-ones write | 0xfffffffc | 0xffffffff | Mini preserves low bits; hardware enforces instruction alignment |

Other gates remain: unknown CSR/opcode permissiveness, privilege checks, misaligned RAM accesses, instruction/access trap values, LR/SC reservation persistence, MMIO/timer behavior, and deterministic initialization/state injection. Enabling an ISA extension does not prove these match mini. A sound design can use a validated arithmetic fast path with a mini-compatible fallback for exceptional operations, or modify the core's architectural layer and prove the resulting profile. It must never silently normalize an observable difference after execution.

The separate [CSR/system unit](mini_arch_step.v) now passes **49,152 CSR combinations and 23 directed interface cases** against pinned mini. Its [call-phase wrapper](mini_arch_call.v) passes **2,054 vectors**, including two complete 1,024-instruction calls and rollover/IRQ/WFI/trap boundaries. These compare all CPU48 fields and phase outputs for supported operations. They are not integrated into Hazard3’s register file, pipeline or precise RAM path; ordinary arithmetic is explicitly unsupported by this unit. [CSR evidence](arch_results.json), [call-phase evidence](arch_call_results.json), [specification](CSR_COMPAT.md).

The new [RAM datapath](mini_ram_step.v) passes **6,967 CPU48/status/RAM-effect vectors**, including all 1,712 MLP instructions, shared ISA cases, random encodings and reservation/MMIO priorities. Its [call wrapper](mini_ram_call.v) passes **4,792 phase/CPU48/RAM-effect vectors**, including the existing mini/EVM boundary cases and two full MLP calls through EBREAK. [Step evidence](ram_results.json), [call evidence](ram_call_results.json). These are separate combinational units supplied with instruction and RAM data; fetch, architectural storage, SRAM and Merkle scheduling remain open. Combinational division has no useful-clock/PPA claim.

## Hardware commitment unit / 硬件承诺单元

[keccak_blocks.v](keccak_blocks.v) implements Keccak-f[1600] at one round/clock, following [the Keccak team's specification summary](https://keccak.team/keccak_specs_summary.html). It accepts pre-padded136-byte blocks in stream byte order. Tests use Ethereum Keccak's0x01suffix, not SHA3's0x06suffix. **146messages /1,047blocks /26,177simulation clocks** match `eth_hash`, including empty/boundary/random messages and actual MiniCPM state/page preimages. Each block takes25clocks including acceptance. [Vectors](hash_vectors.json), [simulation](hash_check.log).

[trace_state_commit.v](trace_state_commit.v) supplies the exact fixed-format message and padding: `state-v1` +32-byte context +192-byte little-endian CPU +32-byte memory root. It hashes the two blocks in **53clocks including start**. All65context/state/root vectors match, including the actual MiniCPM disputed pre-state. [Testbench](check_commit.cpp), [log](commit_check.log). Inputs must remain stable until done; the caller must pause or capture a coherent checkpoint. The module does not capture the CPU, compute a RAM Merkle root, build a trace tree or enforce the memory-input transcript.

At an assumed100MHz (not physically timed here), a checkpoint hash would take0.53µs. A page-v1 preimage takes8blocks/200clocks; fourteen node-v1 hashes take350clocks, so a simple single-page-root update needs roughly550hash-engine clocks before transport/scheduling. Hashing every instruction would dominate this core's ordinary instruction throughput. With8192-instruction checkpoints, the fixed53-clock CPU hash is small; dirty-page authentication, snapshot consistency and data movement still need measurement. A rolling Merkle frontier/checkpoint scheduler is the next integration block.

The separate [profile hash wrapper](profile_state_commit.v) hashes the new bank and tick state formats, including their execution cursors. Both use three Keccak blocks and **79 clocks per hash**; the exactly 272-byte tick message requires a separate padding block. **160 vectors** pass, including actual bank/tick pre/post states and random cases. Inputs remain stable until completion. This adds no coherent CPU snapshot or RAM-root scheduler, and has no new PPA measurement. [Evidence](profile_hash_results.json), [testbench](check_profile_hash.cpp).


[page_tree_commit.v](page_tree_commit.v) now computes a page leaf and its Merkle path with the same Keccak engine. RAM uses `page-v1`, a 14-bit resident index and 14 siblings; model pages use `model-page-v1`, a uint32 index serialized as uint64, and 32 siblings. **414 vectors pass**, covering actual old/new RAM and source pages from all 14 banks, terminal output pages, independent randomized paths and negative cases. Every leaf, root and membership flag matches. RAM paths take **573 clocks**, model paths **1,041 clocks**; out-of-range RAM indices reject in one clock. [Evidence](page_tree_results.json), [exporter](export_page_tree_vectors.py), [testbench](check_page_tree.cpp).

All inputs remain stable until completion. The model-page count bound belongs to the authorized job and is not enforced by this hash unit. The unit does not capture CPU/RAM state, authorize a schedule or atomically apply a replacement; a controller must check the old-root/source proof before committing the new root. No new area, frequency or power measurement is claimed.

## Narrow SRAM witness reader / 窄接口证明读取器

[stream_page_tree_commit.v](stream_page_tree_commit.v) computes the same RAM/model page leaf, Merkle root and captured subtree through a 32-bit read port. Witness word0–255 contains the page; word256 onward contains the siblings. A four-byte cache fetches each word once: 368 requests for RAM and 512 for a model path. Metadata is latched on start; only one read is outstanding, and a request stays stable under backpressure. Reset cancels work; the memory adapter must discard or drain a canceled response before restarting.

**1,242 cases pass**: the same 414 page/path vectors under immediate response, one-cycle response and randomized request/response delay, plus ten reset cancellations. Leaf/root/subtree/proof flags match the existing oracle, busy start pulses are ignored, and changing metadata after start cannot change the result. [Results](stream_page_results.json), [testbench](check_stream_page_tree.cpp), [runner](../remote/run_stream_page_local.sh).

| Reader / bus mode | RAM clocks | Model clocks | IHP mapped cell area, excluding witness SRAM |
|---|---:|---:|---:|
| Existing wide page/path unit | 573 | 1,041 | 820,543.6512 µm²; 83,801 cells |
| Narrow, immediate response | 3,933 | 6,993 | 454,104.2898 µm²; 31,327 cells |
| Narrow, one-cycle response | 4,301 | 7,505 | Same RTL |
| Narrow, randomized stalls | 5,556–5,834 | 9,313–9,609 | Same RTL |

The narrow unit uses **44.7% less mapped cell area**, exchanging page-wide muxes for a byte-filled Keccak rate buffer and more clocks. Both mappings use the same IHP Liberty and ABC `-fast`, 16 GiB/nice10; netlist manifests and independent Liberty area sums pass. [Area evidence](area_stream_page/results.json), [inspector](inspect_stream_area.py), [reproduction](../remote/run_stream_area_local.sh). This comparison applies to the page/path unit alone. It does not reduce the measured whole-controller area by the same percentage, and is not placement/routing, Fmax, power, mapped equivalence or a physical SRAM result. The original full CPU/dirty-page controller uses its wide witness interface; the separate narrow controller below now replaces it for the RAM-only profile.

The [owned-memory wrapper](sram_page_tree_commit.v) adds a 512×32-bit inferred synchronous witness memory. Host writes are excluded during start and busy; byte strobes are respected, and reset cancels computation while retaining the loaded memory. **414 page/path cases pass**, with ten reset cancellations, 340,416 masked writes and 2,173,610 blocked concurrent write attempts. RAM/model paths retain 4,301/7,505 clocks. Yosys preserves one 512×32 memory with one synchronous read and one synchronous write port; ownership makes the accesses mutually exclusive. [Memory/RTL evidence](sram_page_results.json), [testbench](check_sram_page_tree.cpp), [runner](../remote/run_sram_page_local.sh). This establishes owned witness storage for this hash unit; it is not an atomic live-RAM snapshot or the full CPU/dirty-page driver. The explicit macro binding and its separate physical checks are described below.

## Narrow bounded referee with owned SRAM / SRAM版认证单步

[stream_bounded_ram_commit.v](stream_bounded_ram_commit.v) replaces page-wide data/proof ports with a 32-bit command/response interface to three private witness banks. It authenticates every old page first, fetches the instruction and needed data words, executes the existing mini-compatible RAM unit, and applies at most four masked byte writes to private scratch. For two changed pages, the second Merkle path substitutes the first updated subtree at their divergence level. A single Keccak engine is shared between page/path and final `state-v1` hashing. CPU/context/root/index metadata are latched at start.

**3,964 cases pass**, replaying the same 1,982 witnesses with synchronous and stalled memory: 3,944 accepted, exact CPU48/root/hash/pages/flags, maximum 21,578 synchronous or 27,897 stalled execution clocks. Rejected cases leave scratch unchanged; all old proof words are read before private writes. [Results](stream_bounded_results.json), [testbench](check_stream_bounded.cpp), [runner](../remote/run_stream_bounded_local.sh). Private writes precede final acceptance, so the external owner must hide scratch during execution. Reset during private stores requires discarding pending responses and reloading witnesses.

[ihp_stream_bounded_ram.v](ihp_stream_bounded_ram.v) enforces that ownership with **three explicit IHP 512×32 single-port SRAM macros (6 KiB)**. Host reads and writes are blocked during execution. A pending host read response blocks a new start until consumed; response data remain stable under backpressure. The same **1,982 witnesses pass (1,972 accepted)** against the installed PDK FUNCTIONAL models, including complete page/sibling readback, 9,802,648 blocked host commands and 21 start/read-response interlocks. Maximum execution latency remains 21,578 clocks, excluding host witness loading/readback. [IHP SRAM results](ihp_bounded_results.json), [testbench](check_ihp_stream_bounded.cpp), [runner](../remote/run_ihp_bounded_local.sh).

This is the RAM-only `state-v1` arbiter, separate from the newer fixed-input MMIO environment. It does not integrate the Hazard3 pipeline, run a complete Linux environment, provide device attestation or authorize jobs. The PDK FUNCTIONAL model test does not establish physical SRAM timing. Combined controller/SRAM synthesis succeeds under the same 16 GiB/nice10 bound: **158,062 standard cells (8,466 flip-flops) plus three SRAM macros, totaling 1,985,092.137 µm² (1.985092 mm²)**. Standard cells contribute 1,745,932.4442 µm² and SRAM contributes 239,159.6928 µm². The pinned mapped netlist and independent Liberty area sum agree. This is ABC-fast mapped area, excluding placement utilization, clock tree, routing and physical IO. Its 4,243 signal port bits still include wide CPU/context state and are not a chip pin plan. [Area evidence](area_ihp_bounded/results.json), [inspector](inspect_ihp_bounded_area.py).

A separate [reset-recovery test](ihp_bounded_reset_results.json) passes **23 cancellations and 23 complete cross-page-store recoveries** (827,704 clocks), including private-store, Merkle-update and final-hash phases plus an unconsumed host response. Every recovery reloads all witness banks before restarting and verifies CPU/root/hash/pages/siblings. This does not promise rollback of partially written scratch.

### Iterative division candidate / 多周期除法

The separately generated [candidate](prepare_iterative_bounded.py) replaces the four combinational division/remainder expressions with one [32-round divider](iterative_div32.v). It preserves mini's instruction decoding, signed overflow, zero-divisor and remainder rules. **8,466 arithmetic cases and 32 cancellations pass**; all **1,982 complete SRAM witnesses still pass**, with 980 additional clocks across the suite and unchanged maximum 21,578 execution clocks. Existing combinational RTL and its physical run remain separate. [Functional evidence](ihp_div_bounded_results.json).

| RAM-only arbiter mapping | Standard cells | Three-SRAM area | Total mapped area |
|---|---:|---:|---:|
| Combinational division | 158,062 | 239,159.6928 µm² | 1,985,092.137 µm² |
| Iterative division | 146,324 | 239,159.6928 µm² | 1,866,979.2708 µm² |

The iterative candidate saves **5.95% of total mapped area**, using the same ABC-fast flow, 16 GiB limit, nice10 and pinned Liberty files. Netlist counts and independent area sums agree. It retains 4,243 signal port bits. [Candidate area evidence](area_ihp_div_bounded/results.json). A [matched pre-placement comparison](physical_bounded/divider_sta_results.json) improves the worst standard-cell setup slack from −563.280 to −423.652 ns at the slow corner (200 ns clock), but the SRAM-control worst path remains about −966.2 ns. The remaining standard-cell path includes control nets with over 1,500 loads; physical fanout repair is still needed. These results do not establish a useful clock frequency or power.

### 32-bit host register interface / 主机寄存器接口

[ihp_referee_bus.v](ihp_referee_bus.v) replaces the wide state ports with a **32-bit request/response interface (88 signal bits total, including clock/reset/control)** around the iterative candidate. Each request has an 11-bit word address and four byte-write strobes. One response is held until consumed; host requests are blocked during execution. This is a block interface; physical pads, package and board timing remain separate work.

| Word address | Meaning | Access |
|---|---|---|
| `000–02f` | CPU48 input words | Read/write |
| `040–047`, `048–04f` | Context and input RAM root | Read/write |
| `050`, `051–053` | Page count and three sorted page indices | Read/write; reserved high bits reject start |
| `054` | Write bit0 with byte0 enabled to start; read status | Read/write |
| `080–0af`, `0b0–0b7`, `0b8–0bf` | Result CPU48, RAM root, state hash | Read-only |
| `200–7ff` | Three 512-word witness SRAM banks | Read/write while idle |

Status bits are busy0, finished1, accepted2, MMIO-rejected3, execution-status4 and dirty-page mask7:5. Other addresses and writes to result registers return an error. Words follow the existing saved-witness packing: consecutive little-endian 32-bit words; context/root/hash bytes retain their original order. Reset clears configuration and completion flags, cancels pending responses and requires reloading private witnesses before another job. Result registers are meaningful after finished; scratch results require accepted.

**1,982 witnesses pass (1,972 accepted)** entirely through this interface: 4,641,856 transfers, 9,801,601 blocked busy requests, five invalid-register cases, byte strobes and stalled-response stability. All result CPU/root/hash/SRAM/status fields match the saved oracle. [Functional evidence](ihp_bus_results.json), [testbench](check_ihp_referee_bus.cpp). The mapped bus design uses **164,967 standard cells plus three SRAMs, 2,112,595.0146 µm² (2.112595 mm²)**. Register storage and access logic cost 245,615.7438 µm² over the iterative core alone while reducing signal ports from4,243 to88. [Area evidence](area_ihp_bus/results.json). Its separate physical run uses the same 200 ns assumptions and bounded resource policy.

The **actual ABC-fast mapped bus netlist passes ten saved witnesses (nine accepted)**, 23,432 host transfers and five invalid-register cases. The sample covers divide-by-zero, signed overflow, ordinary division/remainder, sleep, cross-page store/AMO, MiniCPM multiplication and a bad proof. [Mapped simulation evidence](bus_gate_results.json). Verilator's zero-delay mode ignores the PDK's `specify` timing checks, leaving its delayed flip-flop inputs undriven; the unadapted attempt failed before the first witness. A separately generated [functional adapter](bus_gate/functional_cells_provenance.json) connects those inputs to their ports while retaining the PDK logic/UDP tables, and passes 1,024 reset/capture/hold cycles. Installed PDK/timing files are unchanged. This sample is neither a full gate-level regression nor timing/formal/placed-netlist equivalence.

The [saved post-CTS databases and timing reports](postcts_comparison.json) pass setup/hold estimates at a **200 ns clock**, using the explicit IO constraints and typical/slow IHP libraries with nominal wire RC. These are placement-parasitic estimates; the slow check independently reloads the same saved databases and constraints.

| Post-CTS variant | Placed instance area, including SRAM | Typical setup / hold slack | Slow setup / hold slack | Slow fanout violations |
|---|---:|---:|---:|---:|
| Original combinational narrow arbiter | 2.364010 mm² | +99.2752 / +0.098754 ns | +43.012238 / +0.216927 ns | 670 |
| Iterative arbiter with 32-bit host interface | 2.428700 mm² | +175.955 / +0.116067 ns | +162.649734 / +0.246994 ns | 956 |
| Same bus design, eight-sink clock clustering | 2.491620 mm² | +176.484222 / +0.135492 ns | +162.681015 / +0.193433 ns | 20 |

The [cached-placement clustering experiment](physical_bus_strict/postcts_results.json) sets eight sinks per clock cluster and an explicit fanout limit of eight, reducing violations from956 to20. Sixteen remaining clock-tree outputs drive16loads against a limit of8; four inserted buffer outputs drive9loads. These constraints still fail. Fast-corner, extracted routed timing and physical signoff are open. The raw unplaced original design had −540.414/−966.197 ns typical/slow setup slack; fanout repair removes that pathological operating point without changing the timing libraries. A disk-quota failure during the original run was preserved, and its stopped data moved to build-host-2's home filesystem. The two older `proot` detailed routes were intentionally stopped with their partial evidence retained, and the improved88-signal variant continues from its saved post-CTS database under `bwrap`, four routing threads,16GiB and nice10. No full-chip frequency or power claim follows from these intermediate stages.

For the smaller **one-SRAM page/path block**, the explicit macro binding passes the same 414 ownership cases and preserves latency. [Macro binding](ihp_sram_page_tree_commit.v), [functional evidence and PDK pins](ihp_sram_page_results.json). The macro is 416.64×191.34 µm, with 79,719.8976 µm² LEF/Liberty area. An isolated 1,200×1,000 µm physical experiment reached global routing with **zero power-grid violations**, 607,981 µm² placed instance area including the SRAM, and positive typical-corner setup/hold slack at a generic 100 ns target. [Intermediate metrics](physical_sram/sram3_metrics.json), [log](physical_sram/sram3.log). These are global-route estimates for this smaller block, not full-controller PPA or signoff. The first physical attempt exposed missing Metal4-to-top-grid SRAM power connections; the [Metal5 macro grid](physical_sram/pdn.tcl) corrected them. A follow-up run uses explicit interface constraints and matching typical/slow libraries through detailed routing and extracted timing; its outcome is pending.

## Mapped area / 映射面积

The original variable-write synthesis was stopped at roughly 52 GB RSS, exit143; it produced no final area. [Preserved log](bounded_area_baseline.log), [source hashes](bounded_area_baseline.sha256). Subsequent runs use `ulimit -v 16777216` (16 GiB process virtual memory) and nice10. Mapping has a 30-minute timeout. The launcher refuses uploads while its own area job is active; that guard was exercised.

| Read/write implementation | Generic cells, including metadata | Generic muxes | Mapping status / evidence |
|---|---:|---:|---|
| Fixed byte writes, original byte reads | 508,749 | 402,039 | ABC timed out, exit124; [saved results](area_fixed_write_baseline/bounded_mapping_results.json), [generic inspection](area_fixed_write_baseline/bounded_generic_results.json) |
| Select whole page before byte read | 688,845 | 582,119 | Rejected regression (+35.4% cells); mapping stopped at about90s, exit143; [inspection](area_page_select_attempt/bounded_generic_results.json), [mapping status](area_page_select_attempt/bounded_map.status) |
| Aligned-word fetch/data reads with unaligned window | 434,051 | 327,819 | 14.7% fewer cells than the fixed-write baseline; both1,982-witness RTL suites pass with unchanged clocks; default IHP ABC timed out at 1,800 seconds (exit124); [mapping evidence](bounded_mapping_results.json), [generic evidence](bounded_generic_results.json) |
| Aligned-word reads, one shared Keccak engine | 421,657 | 326,158 | 2.9% fewer cells than word reads with two engines; same 1,982 commit witnesses and 1,404,503 clocks; IHP ABC -fast mapping PASS: 720,365 standard cells, 6.304418 mm² cell area; [mapping evidence](area_shared_hash/bounded_mapping_results.json), [generic evidence](area_shared_hash/bounded_generic_results.json), [simulation](shared_hash_results.json) |

These are pre-ABC generic counts, not physical area. Whole-page selection duplicated 8,192-bit muxes; its failed candidate is retained. The current word-read candidate performs one aligned fetch read and two aligned data reads, then shifts the combined window. The shared-engine candidate now maps successfully with ABC `-fast`: **720,365 standard cells plus six metadata entries, including 6,271 flip-flops; 6,304,418.379 µm² (6.304418 mm²) cell area**. The mapped netlist cell counts and an independent sum of the pinned IHP Liberty areas agree with Yosys. This is unconstrained synthesis area, not a placed/routed core size; SRAM, physical IO, clock tree, routing/utilization overhead, Fmax and power remain unmeasured. The wide witness interface has 64,062 input/output signal bits and is a block interface, not a practical chip pin plan. [Mapping inspector](inspect_shared_mapping.py), [mapped netlist](area_shared_hash/bounded_synth.v.gz). [Inspection script](inspect_bounded_generic.py), [synthesis/mapping script](../remote/referee_bounded_area.sh).

Yosys0.62 with IHP SG13G2 typical1.20V25°C liberty, flattening, `dfflibmap` and ABC. These are **standalone standard-cell mapping measurements**, not placed/routed area, timing, power or silicon frequency. Fifteen Yosys `$scopeinfo` metadata cells in the Hazard3 statistics have no physical area and are excluded from physical cell interpretation.

| Block | Mapped cell area, µm² | Sequential area, µm² | Evidence |
|---|---:|---:|---|
| Configured Hazard3 + retirement port | 237,143.52 | 116,299.41 | [area log](hazard3_area.log) |
| General Keccak block engine | 230,055.83 | 79,067.92 | [area log](hash_area.log) |
| Fixed state-commit wrapper including its Keccak engine | 242,201.91 | 79,263.88 | [area log](commit_area.log) |

Do not add the last two rows: the wrapper includes the engine. Hazard3 plus the wrapped engine sum to about0.479mm² of mapped cells before integration, SRAM, buffers and routing. That alone is over15times the31,318µm²gross area of the first IHP tile. The first tile therefore retains RLT-mini plus the small streaming MAC; this referee belongs in a later, larger design. No referee GDS/Fmax/power claim is made.

## Integration decision / 集成判断

Proceed with the first tile and the bounded Solidity arbiter independently. For a full referee chip, require a frozen mini-compatible execution profile, a tested logical-time/CSR implementation, authenticated MMIO/model inputs, coherent retirement checkpoints and the RAM/trace Merkle scheduler before committing raw state to BSC.

Hardware MAC/NEE speed does not automatically provide a precommitted RV32 instruction trace. The current full integer model really executes in mini to derive its trace. A later fast executor needs either complete trace generation or a challenge protocol that permits deterministic lazy refinement of committed coarse transitions. Canonical kernel boundaries, bounded execution length/padding, cleared temporary state and authenticated inputs must be designed before deriving checkpoints directly from accelerated layer outputs. GPU GGUF throughput and six matching argmax IDs do not prove that such an integer trace producer runs at GPU speed.

Reproduce using [referee_hazard3.sh](../remote/referee_hazard3.sh), [referee_linux.sh](../remote/referee_linux.sh), [referee_compat.sh](../remote/referee_compat.sh), [referee_hash.sh](../remote/referee_hash.sh), and [referee_commit.sh](../remote/referee_commit.sh) in the existing build-host-2 open EDA environment. The vendor directory and provenance pin supply the core; the mini header comes from `../../onchain_inference/rv32/mini-rv32ima.h`. The Linux image/DTB preparation uses the hash-pinned inputs in the report. No root access or proprietary tools are needed.

中文判断：MLP、有限Linux前缀和Keccak状态承诺已有真实RTL仿真/面积证据，但通用RISC-V核还不是mini/链上机器的完整语义副本。八项CSR差异已测出，需兼容层、逻辑时钟及MMIO/分页认证。首片一tile不加入这套大核；后续大芯片应先通过完整状态一致性门槛，再承诺可在BSC结算的轨迹。

Section-5 review: the prototype's current status and acceptance decision lead; semantic comparison and source/measurement evidence are adjacent. One H1 and three opening answers; fixed rows/units and explicit unknown PPA. Static document controls are not applicable. Local links and narrow/keyboard review are included in the documentation evidence.
