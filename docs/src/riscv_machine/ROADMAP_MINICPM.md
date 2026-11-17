# MiniCPM5-2B first: executable roadmap / 首个真实模型路线图

**Primary information:** MiniCPM5-2B now has a complete deterministic integer guest reference matching six GGUF argmax tests, and a real-layer local dispute loop. The proposed path is off-chain execution with bounded settlement.

**Required context:** the [milestone evidence](../tapeout_asic/minicpm/MILESTONE_2.md), [one-tile silicon candidate](../tapeout_asic/tt/REPORT.md), exact deployed-runtime twin and immutable model/quantization roots.

**Next judgement:** build the missing authenticated model-input and challenge-manager contracts around the local stateless arbiter; use the native-chain bound to decide against full interpreted execution as the product path. Submission remains a separate user decision.

Expression: document roadmap with ordered build gates and cost comparisons. Existing section order retained; evidence updated 2026-09-13.

**Target changed to OpenBMB MiniCPM5-2B.** DeepSeek remains the long-term appendix in [ROADMAP_DEEPSEEK.md](ROADMAP_DEEPSEEK.md). Build the off-chain deterministic executor and settlement boundary. Native on-chain inference is a cost reference, not the proposed fast path.

The pinned [official config](https://huggingface.co/openbmb/MiniCPM5-2B/blob/12a3808a956f869c767195e9266b59c4d21d92e2/config.json) specifies 42 dense Llama layers, hidden 2048, intermediate 6144, 16 query heads, 2 KV heads, head dimension128, vocabulary130560, untied embeddings, maximum context131072. The [official GGUF](https://huggingface.co/openbmb/MiniCPM5-2B-GGUF/tree/2079a22f3beaa4e306449978533478fe0522f4b3) Q4_K_M artifact is1,561,318,368 bytes. Source metadata, tensor headers and the actual layer0 BF16 tensors are pinned under `../tapeout_asic/minicpm/`.

## Numbers first / 先看数字

Per layer, Q/K/V/O matrices contain4,194,304 /524,288 /524,288 /4,194,304 parameters; gate/up/down each12,582,912. Total47,185,920 MACs/layer;42layers1,981,808,640; output head267,386,880. **Dense decode2,249,195,520 MACs/token**, not2,516,756,480: the input embedding table is an indexed row read. Norm parameters bring the complete model to2,516,756,480. Attention adds172,032×T MACs per token at context T. GQA saves KV storage and K/V projections; it does not reduce the16 query heads' QK/AV arithmetic.

Dense matrix weight reads are1,124,597,760 bytes at raw int4 or2,249,195,520 at int8, before quantization scales/alignment. Q4_K_M uses heterogeneous GGUF blocks and is not uniform signed int4. An int8 KV cache needs21,504×T bytes; BF16 needs43,008×T. At T2048 that is44.0MB /88.1MB; at131072 it is2.819GB /5.637GB.

The actual group32 linear-Q24 W4A8 guest executes **20,104,183,818 instructions** on average for a one-token prefix and vocabulary head, replacing the old 20-instruction/MAC proxy for this tested case. It matches all six tested GGUF argmax outputs, with every layer/head exact against the integer reference. Multi-token tests include prefill and are reported separately; measured cached-decode/context scaling is still pending.

| Native scenario | Gas/token, model | Whole-chain days | BNB/token |
|---|---:|---:|---:|
| 3072 instructions/call | 2.66084e+13 | 1.989 | 1,330.42 |
| 14336 instructions/call, adaptive bounds still needed | 2.10854e+13 | 1.576 | 1,054.27 |

The second scenario is about USD 756,783/token at the dated 09:04:35Z inputs: 70M gas/block, 0.452s/block, 0.05gwei, BNB/USD717.825. Formula: `578245*transactions +11671*1024-instruction flips +962.115*instructions +5470.592*pageLoads +239714.657*dirtyPages`, with three hot reads and two dirty pages/call plus once-only streaming weights/scales. The receipt-fit fixed term already includes intrinsic transaction gas. Sparse pages and large batches extrapolate beyond fit training; model-bank verification, contention and long-context costs are not measured. [Executable costs and limitations](../tapeout_asic/minicpm/measured_costs.json).

[BSC BEP-652](https://docs.bnbchain.org/announce/mendel-bsc/) imposes a **16,777,216 transaction gas cap**. Fourteen existing 1024-instruction flips measured14,203,692 local execution gas on a MAC snapshot; 16 measured16,108,438. The 32/64-flip local runs exceed the protocol cap and are counterfactual, never valid deployment scenarios. This is caller batching, not a measured interpreter-cap redesign or general per-call gas guarantee. Keep the old context-wide proxy only as dated evidence in `minicpm/costs.json`.

Current linear32 weights plus scales read **1,405,747,200bytes/token**. The Q12 KV reference needs86,016×T bytes overall and2048×T bytes per active layer. The earlier int8/BF16 cache sizes are alternative storage formats, not what this executed reference uses.

A complete model cannot fit the existing16MB address space. Even one uniform-int4 layer requires23,0401KB pages (23.59MB), versus16,384 resident pages. A tiled executor must authenticate each program/model page replacement and its relation to the global model root. Read-only weights should remain immutable; batch consecutive operations sharing pages and write accumulators once per tile. This is a required protocol extension, not a free external data oracle.

Current local game evidence: the complete11-round MLP dispute costs1,892,451gas. Synthetic35-level Merkle proofs measure365,941gas for open plus unchallenged timeout and172,930–177,849gas per two-party round. Setup plus35such rounds and a100–350k final-resolution budget models6.620–7.042Mgas; this is not an executed full-model dispute. Deployment, bonds, job authorization and DA remain excluded. See [game evidence](stateless/REPORT.md).

## Optimistic route / 乐观执行

Reuse the MLP pilot's context-bound state hashes, page Merkle proofs and bisection, with a hierarchical trace. The measured one-token instruction count needs35 flat bisection levels. Current design budgets are150–300k gas happy path,120–240k per two-party round and100–350k for the final bounded step: **4.45–9.05M gas** for one fully disputed token. At0.05gwei this is0.0000075–0.000015BNB happy path and0.0002225–0.0004525BNB dispute, excluding off-chain execution, DA, timeouts and concurrent disputes. These earlier budgets are design estimates; the local single-game prototype now supplies separate measured costs; the local RAM-only Solidity step is now measured at80,520total gas for the real multiply and up to248,580for a dense three-page witness. [Arbiter report](stateless/REPORT.md). The existing machine cannot accept arbitrary authenticated state for a stateless step.

State =32regs+16CSR words (192bytes) + memory root32bytes; bind model revision/quantization tables, program hash, input token sequence, context, exact interrupt/timer transcript and trace length. Use a seven-day pilot challenge period with per-player clocks and bonds that fund worst-case verification plus participation incentives. At least one honest, available challenger and full data availability are necessary; a commitment is not a proof of correctness. Existing owner-mutating `tick` is not a public stateless arbiter.

A flat measured one-token trace requires4.503TB of224-byte state records, plus about1.287TB for a full hash tree. Persist8192-instruction checkpoints instead (about550MB/token) and use token/layer/operator/model-bank/chunk commitments to materialize only disputed intervals. The built two-token layer0 pilot commits848,937,978instructions in103,653checkpoints (23.22MB), with14explicit model-bank inputs. Seventeen coarse plus13inner rounds isolate a real multiply and the local authenticated witness arbiter rejects the dishonest post-state. Both coarse endpoints and missing-page/wrong-root negative checks pass. [Trace evidence](../tapeout_asic/minicpm/linear32_layer_refinement.json).

The trace fixes elapsed=0/noIRQ. Separate bounded windows use the existing tick clock convention and match the exact deployed runtime for12ticks/12,288instructions. Do not call the whole layer/token an EVM replay. Model-bank input transitions and layer/head invocation boundaries require authenticated transition rules; a valid multiply witness alone cannot prove the advertised complete model.

## Build gates / 分阶段验收

1. MLP loop is built:1712instructions,11bisection rounds, authenticated MUL/store arbitration, all1712one-step witnesses verified, six negative tests. Existing arbitrary-guest exact-EVM twin also matches the C mini core at two1024instruction boundaries. This is not a complete ISA proof.
2. MiniCPM layer pilot is built: full guest arithmetic on actual weights/tokens,848.94Minstructions for two positions, committed checkpoints and local disputed instruction. Exact EVM verification covers bounded startup/norm/MAC windows, not the entire layer. Authenticated external model-bank input verification remains open.
3. Full42-layer integer reference matches6/6 fixed raw-prompt GGUF argmax IDs and independent integer layer/head results. Linear group scales corrected failures of earlier power-of-two schemes. This is a narrow empirical gate, not BF16/GGUF bit equivalence or long-context quality. Next require cached multi-token decode, overflow bounds and broader fixed prompts.
4. A local RAM-only stateless Solidity arbiter now passes1,959suite cases plus a dense witness and13rejections. BSC-testnet integration still requires full profile/challenge conformance: TapeOut must expose or permit a bounded state-witness step, authenticated memory reads/writes, canonical serialization, explicit exception/MMIO/timer semantics, and a challenge manager with model/trace/DA binding. No testnet transaction is authorized in this session.
5. ASIC first silicon is now **one IHP Tiny Tapeout tile carrying hard untrained RLT-mini and a streaming MiniCPM MAC**, with shared pins, RTL/routed-netlist tests, GDS and official precheck PASS. It excludes NEE/RV32/full-model storage. The actual linear32 Q-row replay returns Q12−1258 exactly. [Submission report](../tapeout_asic/tt/REPORT.md) gives theSeptember21IHP26b deadline,€385Academic/Industry total (€185eligibleIndividual), one fanout review exception and user decision gate. A future128MAC/cycle100MHz array has5.69dense tokens/s compute ceiling and needs about8GB/s for current weight/scales; SRAM must cover declared active-layer KV/context, not just256KiB by assumption.

Real build-host-2 Q4_K_M throughput is35.10CPU decode tokens/s and325.47±2.84Vulkan RTX4080SUPER decode tokens/s, three32-token repetitions. These are ordinary llama.cpp benchmarks, not committed integer execution throughput. See the [milestone](../tapeout_asic/minicpm/MILESTONE_2.md) for pinned code, quantization, all six prompts and reproduction boundaries.

中文结论：MiniCPM确实能在自有硬件上运行，但链上逐条解释仍需每token数万亿gas。推荐先建立可复现整数执行器和分层争议协议，再做芯片加速。第一版微型芯片验证网络语义，不能伪装成2B模型加速器；六个提示词的完整42层argmax一致性已通过；更广泛质量、外部权重分页认证和链上单步仲裁仍是后续门槛。


Section-5 review: one roadmap/decision, one H1, three opening answers, stable status/units and evidence beside comparisons; ordered gates express stage progression. Static controls are not applicable. Local links and narrow/keyboard rendering are checked with the documentation harness.
