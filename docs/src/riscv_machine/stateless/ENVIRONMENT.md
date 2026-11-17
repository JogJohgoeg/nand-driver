# Deployed environment refinement: RAM and fixed-input MMIO

**Primary information:** `env-ram-state-v1` is a separate local transition prototype that binds deployed-wrapper history, counters and call phase around the existing RAM interpreter. It passes 32 saved deployed-runtime endpoints across 5,147 microsteps; the separate `env-mmio-state-v1` profile additionally passes 255 saved endpoints and four fresh queue/console boundaries. Neither profile authorizes jobs or models live input append.

**Required context:** [transition source](EnvironmentTransition.sol), [existing call interpreter](CallMini.sol), [deployed-wrapper observations](../../tapeout_asic/referee/CSR_COMPAT.md#deployed-wrapper-observations--已测外层行为), and [counter-boundary probes](../../tapeout_asic/referee/wrapper_counter_probe.json). Existing `state-v1`, `tick-state-v1` and bank traces retain their formats.

**Next judgement:** compare the fixed-input MMIO RTL against the passing software witnesses, then address live input authentication and job authorization separately. A state hash alone does not authorize a job or authenticate a disputed pre-state.

Expression: sectioned transition contract with a field comparison table. Reader: referee implementer deciding which state must survive instruction refinement.

## Committed state and call boundary

Keccak preimage: literal `env-ram-state-v1`, context32, CPU192, RAMroot32, then the fixed-width fields below in table order. CPU words are little-endian uint32; numeric tail fields use Solidity packed big-endian encoding. No ABI offsets or lengths enter this preimage. Context must identify the authorized runtime/program/environment policy.

| Tail field | Width | Meaning |
|---|---:|---|
| remaining | 2 bytes | Zero means call boundary; otherwise 1–1,023 remaining attempts |
| carry | 1 byte | Cycle-high increment deferred until call return |
| history | 8 bytes | Slot 9 low 64-bit cycle history |
| halt | 8 bytes | Slot 9 persistent status; nonzero states reject execution |
| accumulated | 16 bytes | Slot 9 upper 128-bit cycle accumulator |
| flips | 32 bytes | Slot 10 full 256-bit counter |
| callCycle | 8 bytes | CPU logical cycle at entry, retained until return; zero at boundaries |

At entry, compute elapsed as `(cyclel - low32(history)) mod 2^32`, add it to history modulo 2^64, and save CPU cycle64. `CallMini` samples the timer/IRQ once and executes one bounded RAM step. Continuations preserve its call phase and deferred cycle-high carry. A trap, IRQ, WFI, sleep return or exhausted 1,024-attempt budget ends the call.

At return, apply deferred cycle-high carry; core status 1 additionally advances logical cycles by 1,024. Add the modulo-2^64 difference from `callCycle` to the 128-bit accumulator, increment the full 256-bit flip counter, and reset phase/carry/callCycle. Counter arithmetic wraps at its declared width. The observed history overflow does not spill into halt status.

## Validation and acceptance limits

[The local checker](check_environment.py) compares all CPU48 fields, unchanged RAM root and packed slots 9/10 at endpoints against saved exact-runtime records. It independently reconstructs every transition hash, checks each state field changes the commitment, and tests malformed call state and page witnesses. The 32 saved endpoint guests do not write RAM. A separate [fresh exact-runtime RAM check](check_environment_ram.py) additionally passes byte, cross-page halfword/word and top-tree-split AMO writes followed by WFI: four endpoints, eight microsteps, exact CPU48/counters and independently rebuilt post-RAM roots. [Records](environment_ram_results.json). This includes dirty pages 8191/8192 across the highest RAM-tree split.

[Results](environment_results.json) and [run log](environment_check.log): 25 original wrapper cases plus seven counter-overflow cases pass CPU48, RAM root, packed counters and every microstep hash. Seven malformed-state/page witnesses reject; all nine state fields independently change the commitment. The deployed probes include five complete 1,024-attempt calls, WFI/sleep, IRQ, illegal traps and arithmetic rollover. These are endpoint comparisons, not independent deployed-runtime observations at every intermediate microstep. Compilation uses solc 0.8.24 optimizer/via-IR/Shanghai; tests use the existing PyEVM environment and cached deployed runtime, without RPC or network transactions.

This profile rejects MMIO through `CallMini`. It neither models nor changes UART queues, console sequence, external input calls or syscon stores. Halt is committed and rejects subsequent execution, but no transition here produces a new halt status. The separate local game adapter below does not supply requester authorization, bonds, output/payment coupling, data availability or a multiple-challenger policy. No hardware integration or PPA claim follows from these software checks.

## Hardware witness controller

The separate [bounded environment RTL](../../tapeout_asic/referee/bounded_environment_commit.v) now passes **5,197 witnesses** (5,187 accepted, 10 rejected), including exact CPU48/root/pages, phase/history/counters and env-ram-state-v1 hashes. Maximum tested latency is 2,953 clocks; no frequency or physical-area result is implied. [Hardware evidence](../../tapeout_asic/referee/environment_rtl_results.json), [scope and reproduction](../../tapeout_asic/referee/REPORT.md#authenticated-ram-environment--调用环境硬件). Inputs stay stable through completion; external writes are permitted only on done and accepted. MMIO/input/syscon and actual Hazard3/SRAM integration remain open.

## Local dispute

[EnvironmentTraceGame.sol](EnvironmentTraceGame.sol) reuses the existing bisection manager and authenticates every environment pre-state field before calling this transition. Legacy CPU-only resolution rejects. A real two-transition cross-page store/WFI trace disputes omission of the wrapper’s 1,024 idle cycles: one round resolves for the correct challenger. Eight negative actions reject, including forged history/accumulator/flips/call-cycle, missing page, premature/late resolution and legacy entry. [Runnable check](check_environment_game.py), [results](environment_game_results.json). The local flow costs 602,139 protocol gas; this is a two-transition fixture, not a full tick or model-dispute estimate. The game checker pins its verifier runtime hash to the standalone build tested at the deployed endpoints. The combined game build emits a different optimized verifier (11,157 bytes versus 11,716 bytes standalone); its earlier 602,154-gas fixture is superseded by the pinned-runtime result. As with the original manager, verifier/job authorization and economic policy remain external.

## Separate fixed-input MMIO profile

[MMIOTransition.sol](MMIOTransition.sol) uses a new `env-mmio-state-v1` domain and a **448-byte** preimage. After the same RAM environment fields it appends inputData32, inputLength1, inputCursor1, consoleSequence32, outputHash32 and consoleBytes2. Numeric fields are packed big-endian. A fixed queue contains at most 31 bytes, stored from the first byte of inputData; unused trailing bytes must be zero. Cursor cannot exceed length. The input bytes and their initial policy must be authenticated by the job context; this profile supplies no `typeInput`/append transition or live queue storage proof.

| Observed callback | Profile behavior |
|---|---|
| UART data load, `0x10000000` | Consume one unsigned byte, including NUL; return zero when empty; all eight width encodings behave alike |
| UART LSR, `0x10000005` | `0x61` while data remains, otherwise `0x60` |
| Timer reads, `0x1100bff8/bffc` | Return low/high timer sampled once at call entry |
| Timer compare stores, `0x11004000/4004` | Replace the full 32-bit compare word for every width encoding |
| UART data store | Append the low byte to an auxiliary transcript hash; flush one console event per completed call with output |
| Syscon store, `0x11100000` | Zero continues; nonzero stops and becomes persistent halt; status 1 also applies the observed 1,024 idle cycles |
| Other addresses in the MMIO window | Loads return zero; stores have no effect; AMOs keep their access-fault behavior |

The console chain hashes literal `console-byte-v1`, previous outputHash32, current consoleSequence32 (big-endian), and the emitted byte. All bytes in a call use the same sequence. `consoleBytes` tracks pending bytes, cannot exceed completed attempts, and resets on call return. The sequence advances once modulo 2^256 when a call produced output. This auxiliary byte-chain commitment is derived from the deployed event contents; it is not an existing storage slot or event hash.

[Cached endpoint check](check_mmio.py) passes **255 endpoints / 5,572 microsteps**, with 11 malformed witnesses rejected and all 15 fields bound by the independent hash reconstruction. [Results](mmio_results.json). Five cached endpoints are halted-call rejections, not accepted execution. [Fresh boundary checks](check_mmio_boundaries.py) pass four more endpoints / 57 microsteps: empty input, NUL, a full 31-byte queue, two console writes in one event, console sequence wrap and cycle-low wrap. [Boundary records](mmio_boundary_results.json). These extra checks caught and corrected an initial per-byte sequence increment: deployed output batches bytes per call. Intermediate microsteps are compared to Solidity; deployed-runtime equality is checked at call endpoints.

[MMIOTraceGame.sol](MMIOTraceGame.sol) disputes the signed-byte UART quirk in a real two-transition load/WFI trace. The correct unsigned-byte challenger wins after one bisection round; ten invalid actions reject. [Game check](check_mmio_game.py), [results](mmio_game_results.json): **587,428 total protocol gas / 151,685 resolve gas**, with the standalone tested verifier runtime pinned. This is a local fixed-input fixture, not a full Linux or model settlement estimate. The separate [MMIO RTL controller](../../tapeout_asic/referee/bounded_mmio_environment.v) passes **5,747 witnesses (5,733 accepted / 14 rejected)**, including CPU48, RAM roots/pages, all environment/IO fields and hashes. Maximum tested latency is 2,979 clocks. [Hardware records](../../tapeout_asic/referee/mmio_rtl_results.json), [exporter](../../tapeout_asic/referee/export_mmio_vectors.py). One Keccak engine handles console-byte and full-state hashing sequentially. The prototype has no mapped area, clock-frequency or power result; it requires stable inputs and gates page effects until acceptance.

中文：RAM与固定输入MMIO使用独立域，保留既有格式。新MMIO版本覆盖UART、定时器、syscon及按调用批量输出的序号规则；255个缓存端点与4个新边界端点通过。实时追加输入、任务授权及实际Hazard3/SRAM集成仍未实现。

Section-5 review: the current status and next acceptance decision lead; widths, encoding and arithmetic are adjacent. One H1 and three opening answers. Static document controls are not applicable; local link, 390/1440-width and keyboard acceptance must be recorded before publication.
