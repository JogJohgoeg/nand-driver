# MiniCPM milestone 2: full integer model and local dispute loop

**Primary information:** the complete 42-layer integer reference matches llama.cpp Q4_K_M's next-token argmax on six fixed prompts. A real two-token layer has a committed RV32 trace and a passing local one-step dispute. The Tiny Tapeout MAC also passes a projection slice from this arithmetic format.

**Required context:** [the model roadmap](../../riscv_machine/ROADMAP_MINICPM.md), [one-tile silicon candidate](../tt/REPORT.md), pinned weights and the exact deployed-EVM twin. These are distinct numerical, ISA, protocol and physical checks; their evidence scopes are stated below.

**Next judgement:** extend the [passing bank input verifier](../../riscv_machine/stateless/BANK_TRANSITIONS.md) to authorized full-job composition, while expanding quantization tests. Native full-model chain execution remains a cost experiment. Silicon submission is the user's separate decision.

Expression: sectioned milestone detail, with field-by-field comparisons and an ordered replay procedure. Updated 2026-09-13. No network transactions or burns.

## What passed / 已通过

All projections, RMSNorm, RoPE, causal attention, SiLU, residuals, final norm, vocabulary head and argmax execute as compiled RV32IMA guests. The host supplies immutable model banks and initial embedding rows, and orchestrates separate layer/head invocations. Each layer and head is checked against an independent NumPy integer implementation. This is an executable full-model integer reference; it is not one uninterrupted execution of the existing 16 MB Linux machine.

| Raw prompt, no BOS/chat template | Prefix tokens | Integer / GGUF argmax ID | Executed RV32 instructions | Integer layer/head checks |
|---|---:|---:|---:|---|
| Hello | 1 | 5 / 5 | 20,104,182,858 | PASS |
| Paris | 1 | 5 / 5 | 20,104,178,571 | PASS |
| 2 | 1 | 5 / 5 | 20,104,190,023 | PASS |
| The capital of France is | 5 | 8181 / 8181 | 91,622,879,930 | PASS |
| 1 + 1 = | 5 | 242 / 242 | 91,622,424,138 | PASS |
| 中国的首都是 | 3 | 14697 / 14697 | 55,954,793,049 | PASS |

The first three are one-token prefixes and all choose the same special token; they are weak fidelity tests. The other results are ` Paris`, a space, and `哪里`. Their instruction counts include complete causal **prefill**, so do not divide them into a cached decode cost. Six argmax matches establish this small acceptance set, not identical logits, long-context quality, multi-token generation parity or BF16/GGUF bit equivalence. The compiled attention workspace allows at most 16 positions; tested contexts are 1, 3 and 5. Longer contexts and cycle-counter rollover need separate validation.

Evidence: [one-token results](linear32_results.json), [multi-token results](linear32_sequence_results.json), [GGUF reference](sequence_golden.json), [independent FP32/BF16-weight reference](float_reference_results.json). The floating reference also matches all six argmax IDs. [A finite-value check](float_finite_check.json) verifies all Hello logits and hidden states despite NumPy/Accelerate floating exception warnings.

Current local game evidence: the complete11-round MLP dispute costs1,892,451gas. Synthetic35-level Merkle proofs measure365,941gas for open plus unchallenged timeout and172,930–177,849gas per two-party round. Setup plus35such rounds and a100–350k final-resolution budget models6.620–7.042Mgas; this is not an executed full-model dispute. Deployment, bonds, job authorization and DA remain excluded. See [game evidence](../../riscv_machine/stateless/REPORT.md).

## Exact integer contract / 整数规则

Official model revision `12a3808a956f869c767195e9266b59c4d21d92e2`: hidden 2048, FFN 6144, 42 layers, GQA 16/2, head 128, vocabulary 130560, untied embeddings. BF16 source hashes and generated tensor hashes are in [linear32_cache_manifest.json](linear32_cache_manifest.json).

For each 32-weight group, choose positive integer `scaleQ24 = max(1, round(max(abs(w))/7 * 2^24))`; quantize weights to signed [-7,7] with nearest ties away from zero. For each 32-activation group in Q12, choose integer `step = max(1, ceil(max(abs(x))/127))`, round `x/step` with the same rule to int8. Compute each 32-term integer dot, accumulate `dot * scaleQ24 * step` in int64, then round once by `2^24` to Q12. RMSNorm uses integer square root, Q14 gamma and epsilon 17 in Q24 squared units. SiLU uses a Q12 lookup sampled at 1/256 over [-16,16], with the positive tail returned as x; RoPE uses Q30 tables and attention exp uses Q24 tables. Frozen table hashes bind deterministic replay. The exact C/reference code is authoritative for operation order and clipping.

The previous row-wide power-of-two quantizer matched only 1/3 one-token prompts. Group32 power-of-two scales matched 0/3 one-token and 1/3 multi-token prompts. Changing to linear group scales and correcting the positive SiLU tail produced the current 6/6 result. This improvement was measured after inspecting activation sparsity and scale error; no representational limit was inferred from the failed quantizers. Preserve all result JSONs to distinguish the experiments.

## Trace and bounded arbitration / 分层轨迹与单步仲裁

[The current layer trace](linear32_layer_commit.json) executes layer 0 on the actual first two tokens of “The capital”: **848,937,978 instructions**, 103,653 checkpoints, 23,218,272 checkpoint bytes, and 14 explicit model-bank input edges. All guest arithmetic matches the integer reference. Checkpoint production took 27.08 seconds locally after inputs were prepared.

1. Commit domain-separated Keccak leaves over index, execution context, 192-byte CPU state and 32-byte memory root. Context binds code, model-bank set, initial RAM/tokens, quantization and the elapsed=0/no-interrupt environment.
2. Bisection over coarse checkpoints isolates one 8192-instruction interval in 17 rounds. Replay produces an instruction-level trace whose two endpoint hashes match the committed coarse edge.
3. Thirteen inner rounds isolate actual multiply `0x03698b33`. A local pinned-mini arbiter reconstructs its authenticated code page, executes one instruction and rejects the claimed incorrect post-state. Missing-page and wrong-root witnesses fail. Total: **30 rounds**. [Refinement evidence](linear32_layer_refinement.json), [witness](linear32_layer_instruction_witness.json).

This selected MAC interval has no stores; a store is not required for a multiply dispute. The earlier [full-layer refinement](full_layer_refinement.json) separately verifies a two-page, one-dirty-page store witness. Bank loads are explicit **external-input transitions**, not RV32 instructions: their authentication and legal placement need a distinct verifier. A valid local multiply does not establish valid model-bank replacement.

The original one-token layer pilot executed 419,004,229 instructions, touched 6321 distinct virtual pages, dirtied 131 pages and used seven bank inputs. Current multi-token linear32 per-layer page/instruction counts are in the result JSONs; do not reuse those older page counts as current measurements. A linear32 layer's logical weights/scales occupy 28,800 pages, exceeding the existing 16,384-page resident address space.

[Exact deployed-runtime checks](linear32_exact_samples.json) cover startup, integer normalization and packed MAC: **12 ticks / 12,288 instructions**, with all 48 CPU fields and compared pages equal to mini. This uses each tick's actual elapsed-time convention. The full 849M layer and full 20.1B token were run in the pinned C interpreter, **not replayed in EVM**. The zero-elapsed committed trace is a proposed stateless execution environment, not an unmodified live Linux/tick transcript.

A one-token full model averages **20,104,183,818 instructions**, about 8.94 instructions per dense MAC including guest control. Persisting every 224-byte state needs **4.503 TB/token**, plus about 1.287 TB for a full hash tree. 8192-instruction checkpoints need about **549.7 MB/token**, excluding memory snapshots/model inputs. Use token → layer → operator/model bank → bounded instruction interval commitments. Materialize only the disputed interval; preserve and authenticate each interval's replay inputs. A 35-level flat bisection is a budgeting reference, not a proof that all inter-layer/input edges are already implemented.

## Native chain and optimistic cost / 链上费用

[Executable cost model](measured_costs.py), [all terms](measured_costs.json), [dated chain inputs](chain_inputs_20260913.json): block 121618647 at 09:04:35Z, 70M gas/block, 0.452 seconds/block average over 1000 blocks, 0.05 gwei and BNB/USD 717.825. The receipt regression is `578245*tx + 11671*1024-instruction flips + 962.115*I + 5470.592*pageLoads + 239714.657*dirtyPages`. Its fixed term already includes intrinsic transaction gas; do not add it again. Direct local `execute_bytecode` measurements exclude intrinsic gas.

| Scenario | Gas/token, model | Whole-chain blocks / days | BNB / USD |
|---|---:|---:|---:|
| Historical 3072 instructions/call | 2.66084e+13 | 380,120 / 1.989 | 1,330.42 / 955,007 |
| 14 flips, 14336 instructions/call | 2.10854e+13 | 301,221 / 1.576 | 1,054.27 / 756,783 |
| Optimistic happy path, design estimate | 150,000–300,000 | Challenge latency, not throughput-derived finality | 0.0000075–0.000015 / 0.0054–0.0108 |
| One complete dispute, design estimate | 4.45M–9.05M | 35 interactive rounds plus arbiter | 0.0002225–0.0004525 / 0.160–0.325 |

Native extrapolation assumes two dirty pages and three hot page loads per call plus once-only model streaming. Training fit ranges were 62–132 page loads and 7–20 dirty pages, so this sparse/page-banked workload extrapolates outside the measured range. Adaptive gas-bounded batches, bank authentication, data availability, guest orchestration, nontrivial context and contention add unmeasured cost. Whole-chain days assume exclusive block capacity and are not a completion promise. Happy/dispute figures exclude off-chain execution/DA; a local single-game manager now passes the MLP dispute, but production job/bond integration remains open, and the bounded RAM-only Solidity step is measured separately; a challenge period dominates finality.

BSC's [Mendel/BEP-652 rule](https://docs.bnbchain.org/announce/mendel-bsc/) caps a transaction at **16,777,216 gas**. On one original MAC-loop snapshot, 3 flips measured 3,459,332 execution gas; 14 measured **14,203,692**, or 990.77 gas/instruction; 16 measured 16,108,438. The 14-flip improvement is 12.02% fewer execution gas/instruction than 3 flips. With a 21,500 intrinsic allowance it uses 14,225,192 gas. This is a snapshot measurement, not a universal safe bound. Local 32/64-flip results (31,662,373 / 62,147,269 execution gas) exceed the protocol cap and are **counterfactual runtime runs**, excluded from native scenarios. Existing-call batching is not a measured interpreter-cap, warm-cache or SSTORE redesign. [Batch evidence](tick_batching.json), [14-flip evidence](tick_batching14.json).

Dense weights plus group scales read **1,405,747,200 bytes/token** before attention. The actual stored format, including BF16 input embeddings and Q14 norms, is **1,941,217,280 bytes / 1,895,720 1 KB pages**. CREATE/code deposit alone is 4.49286e+11 gas; one-page-per-transaction deployment estimate is 5.68145e+11 gas, 28.41 BNB / USD 20,391. These are hypothetical storage costs, not deployments. Batch upload can amortize intrinsic overhead; a global immutable model root still needs a bounded resident-bank interface.

## Hardware relation / 与芯片的关系

build-host-2's real Q4_K_M runs at **325.47 ± 2.84 decode tokens/s** on RTX4080SUPER Vulkan, and **35.10 tokens/s** on four CPU threads; both are three 32-token benchmark repetitions. [GPU benchmark](bench_vulkan.json), [CPU benchmark](bench_cpu.json). Neither is a deterministic integer-trace benchmark or end-to-end proof latency. Integer test wall times include Python golden checking, tensor loading and multiple guest calls; do not report them as optimized executor throughput.

A hypothetical 128-lane int8×int4 array at 100 MHz has 5.69 dense tokens/s compute ceiling. Linear32's weight/scale stream needs about **8.0 GB/s** at that rate. 256 lanes at 200 MHz gives 22.76 compute tokens/s but 16 GB/s memory caps it at 11.38. These are design estimates, exclude nonlinear work/stalls and have no PPA closure. A 256 KiB SRAM cannot hold all KV: this Q12 reference needs 86,016×context bytes across 42 layers and 2048×context bytes for one active layer (4 MiB at context2048), plus activation/scratch memory. Int8 KV would be a different, unvalidated quantization contract.

The **one-tile** IHP submission carries an untrained hard RLT-mini and streaming MAC, with no whole-model SRAM or RV32 referee. [Current-format projection test](../tt/LINEAR32.md) replays “Hello” layer0 Q row0: 64 groups / 2048 products, host scale reduction, final Q12 **−1258**. RTL and routed IHP netlist both pass 36,866 simulation clocks; final GDS is unchanged. At10MHz and18serial clocks/product for the group32 protocol, streaming all dense products would take a modeled67.5minutes/token, before host/nonlinear work. This demonstrates the arithmetic slice and pin protocol, not full-model acceleration. RLT-mini's fast pin mode accepts one token each enabled clock; it makes no language-model quality claim.

## Next gates / 下一步

1. **Model-input verifier:** [all 14 actual banks](../../riscv_machine/stateless/BANK_TRANSITIONS.md) now independently pass 107,534 bounded Solidity transitions with model membership, schedule/cursor, zero tails and ACK checks. Every endpoint and resumed CPU48/RAM match. A [layer admission descriptor](linear32_job_manifest.json) now reproduces its initial state, all bank boundaries and terminal outputs natively; the local game verifies original terminal-leaf/page extraction. Complete layer composition and production authorization/payment policy; quantizer/program/input commitments alone do not validate an arbitrary job.
2. **Stateless arbiter integration:** the [local RAM-only Solidity prototype](../../riscv_machine/stateless/REPORT.md) now passes the MLP/ISA suite and real MiniCPM witness (80,520total gas). Complete canonical 48-field CPU serialization, bounded page witnesses, exact mini instruction/trap/atomic semantics, deterministic timer/MMIO transcript, Merkle updates, and a challenge manager with trace length/model/DA binding. Complete the challenge manager, MMIO/model-input rules and independent review before any BSC-testnet deployment. At least one honest available challenger is required; seven-day pilot challenge periods and funded bonds remain design parameters.
3. **Fidelity extension:** cached decode across generated tokens, longer English/Chinese prompts, adversarial scale/outlier cases and integer overflow bounds. Go when declared argmax/quality gates hold; keep the current six-prompt result as a narrow reproducible milestone.

中文判断：完整42层整数程序已运行，六个固定提示词的下一token与真实GGUF一致；真实层的分层轨迹、二分及本地单步仲裁也已通过。推荐继续做权重分页认证和无状态仲裁器，不推荐把现有解释器逐指令运行整个模型当成产品路径。微型芯片已经有实际权重切片的RTL/门级证据；它不包含完整MiniCPM，也不自动产生可在BSC结算的证明。

Documentation section-5 review: one milestone is the primary object; status and next judgement lead, comparison fields/units and evidence are adjacent, stale variants are explicitly named. Tables compare measurements rather than stages. One H1 and local links are checked; static documents have no form, calendar, modal or drag controls. Browser reflow/keyboard review is recorded separately; this is not a public-site renderer certification.
