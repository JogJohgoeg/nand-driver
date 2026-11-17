# TapeOut RISC-V machine / 链上通用计算研究

2026-09-13, codex H. Read-only chain, zero transactions/burns. The user's complete-model goal and built MLP dispute milestone are addressed in **[ROADMAP_DEEPSEEK.md](ROADMAP_DEEPSEEK.md)**. This report completes the original H2 scope: local machine, our workloads, hybrid and horizon scan.

## Findings / 结论

The VM makes reloadable programs practical to develop and audit; its fixed tick and copy-on-write overhead makes a standalone tiny controller more expensive than a native circuit. Compile control logic directly into C; a NAND-netlist evaluator in C pays interpreter overhead twice. Keep immediate on-chain safety gates native, batch flexible policies in software, and put large inference off chain behind an authenticated dispute/proof interface.

中文：通用 RISC-V 让加载程序、更新策略、运行模型成为统一的软件问题，但并没有把链上计算变便宜。小型安全控制仍适合原生电路；复杂逻辑可编译成 C 并批处理；大模型走链外执行、链上证明或裁决。不要把 C 写的 NAND 解释器当成高效电路加速器。

## 1–2. Machine and validated local twin

[Machine reverse engineering](machine.md) records ABI selectors, ownership, page mapping, bytecode and receipt fitting. [Twin validation](twin.md) records two exact deployed-EVM transitions at blocks 120503146 and 120503286: all eight CPU words match at each height, and all 12+16 dirty-page addresses and contents match. Public archive caches permit local replay. The distinct mini-rv32ima Linux-state adapter is still experimental and failed snapshot equality; it is not the validated twin.

Receipt model (80 samples, held-out RMSE 11,700 gas):

`G = 578245 × transactions + 11670.8 × flips + 962.115 × instructions + 5470.59 × loads + 239714.66 × dirty pages`.

A flip handles up to 1,024 guest instructions. A tick transaction can contain multiple flips; never equate a guest instruction, internal flip and transaction. Exact local historical replay identifies a 503,295-gas memory-expansion charge; dirty-page CREATE and fixed overhead are material. Sampled BSC gas price: 0.05 gwei; block interval 0.45 seconds. `gas_fit.json`, `current_chain.json` contain evidence and ranges.

## 3. Our workloads / 软件与电路成本

C sources were compiled on build-host-2 with Clang 22.1.8, RV32IMA/ILP32, `-O2`, freestanding, no Linux boot. The local mini interpreter counted executed instructions. Programs load input/config from pages and return results through memory. All reported outputs match independent scalar references. Driver and relay each have 12 sampled inputs/states (not an exhaustive new C proof); the existing relay circuit has its earlier exhaustive proof. Graph workloads use real driver21, deployed controller87 (three latches converted into explicit state inputs) and relay174 (ten state bits), plus an explicitly **synthetic** 300-gate graph.

| Workload | Guest instructions | Pages touched / dirty | Flips | Tick transactions, assuming terminal-stop wrapper | Fitted gas | BNB |
|---|---:|---:|---:|---:|---:|---:|
| Driver policy compiled C | 75 | 5 / 3 | 1 | 1 | 1.409M | 0.0000704 |
| Relay policy compiled C | 234 | 5 / 3 | 1 | 1 | 1.562M | 0.0000781 |
| int4 MLP, loaded weights | 1,712 | 5 / 3 | 2 | 1 | 2.995M | 0.0001498 |
| Generic evaluator, actual 21 NAND | 484 | 8 / 4 | 1 | 1 | 2.058M | 0.0001029 |
| Generic evaluator, actual 87 NAND + 3 state bits | 1,537 | 8 / 4 | 2 | 1 | 3.083M | 0.0001541 |
| Generic evaluator, actual 174 NAND + 10 state bits | 3,055 | 9 / 5 | 3 | 1 | 4.800M | 0.0002400 |
| Generic evaluator, synthetic 300 NAND | 4,801 | 10 / 5 | 5 | 1 | 6.509M | 0.0003254 |

**Scope:** these are guest measurements and fitted gas extrapolations, not new chain receipts. Harness stack/output/terminal-store pages increase dirty counts; tighter co-location and batching can remove much of that overhead. EBREAK is the local harness boundary, not a claim that deployed Linux/tick halts there. A real native VM deployment needs an appropriate yield/syscon/program-stop wrapper. Formula training had 62–132 loads and 7–20 dirty pages, so these sparse-page programs lie outside that range. Do not overstate small-program price accuracy.

Compare native circuits using Task H's three-point #280/#283/#284 fit (gate/state coefficients covary; estimates only): `52250.6 + 1920.69 NAND + 6704.92 LATCH` gas per step. Native 21 ≈92.6k; 87+3 **261,497 read-only estimate**; 174+10 ≈453.5k; 300 stateless ≈628.5k. Thus the graph software cases are approximately 22× / 12× / 11× / 10× costlier per standalone action. C relay is about 3.4× its fitted native counterpart, but is easier to update; C driver about 15×. A 100-policy batch can amortize fixed/dirty overhead, though output persistence and guest page locality must be measured.

MLP initialization: 44 packed weight bytes fit one 1 KB page, approximately 237–278k gas to construct/store its pointer, plus program, stack and config pages. No model weight is burned into the C program. Tensor weights live at guest 0x80100000. Repacking program/data to avoid half-empty pages is an obvious next optimization. Existing tiny MLP native serial-core inference cost ~1.73B gas; the software model's ~3M proxy is hundreds of times lower.

Reproduce: `build_workloads.py` creates a single isolated remote build script; `ssh build-host-2 bash -s < build_workloads.sh` returns ELF archive; `measure_workloads.py` builds binary images and verifies outputs. Exact evidence: `workloads/results.json`, `small_costs.json`. The repeated synthetic 300-gate point measures evaluator scaling, not a newly designed production controller.

### FP4/int4 core improvement

`lut_core.py` emits Verilog, synthesizes through Yosys/ABC, extracts NANDs and checks against independent arithmetic. Products: **256/256 exact** for signed4 and FP4; full transition cones: **10,000 random state/operand/clear tests each**, not exhaustive state proofs.

| Core | NAND | State latches needed | NAND depth | MAC transitions |
|---|---:|---:|---:|---:|
| Task H serial core | 223 | 36 | 11 | **64** for full uint4×int4 MAC |
| Signed4 product LUT only | 270 | 0 | 17 | combinational product |
| Signed4 LUT + 16-bit accumulator + sequencer | 513 | 19 | 50 | **1** |
| FP4 product LUT only | 280 | 0 | 19 | combinational product |
| FP4 LUT + accumulator + sequencer | 514 | 19 | 51 | **1** |

The full Verilog exposes state input/output pins; closing 16 accumulator and 3 sequencer feedback wires with latches is an **architecture estimate**, not a newly encoded/verified physical TapeOut core. Operands are parallel ports; serial operand loading would add ticks. Each accumulator wraps modulo 2^16; full-model scaled reductions need wider arithmetic. One redundant constant output/input is ignored in this transition prototype. No activation or block-scale logic is included.

Naïve full-LUT depth is large: NAND×depth³ ≈64.1M / 68.2M versus old 344,729 scoring metric; fewer calls does not imply a better contest score. Circuit step gas does not scale as this scoring metric. The old gate/latch fit predicts ~1.165M gas/new parallel MAC vs ~46M for 64 old calls, about 40×, excluding operand marshaling. A factored integer multiplier and faster carry structure should beat the naïve 256-case ROM; the measured LUT is a feasible reference point, not an optimized lower bound. Pipelining reduces combinational depth but adds latency/state and must preserve accumulation dependencies.

RV32 software comparison already exploits native MUL: LUT and decode+MUL both 20 instructions/MAC; shift/add ~44.875. Applying FP4×FP4 to the full DeepSeek runtime would be wrong because its expert activations are FP8. The roadmap addresses that distinction.

## 4. MMIO hybrid / VM 调原生电路

Proposed reserved device window **0x12000000** (not implemented in current TapeOut; existing UART/CLINT/syscon ranges are separate): command/version, circuit ID, input length, state length, buffers, status and output fields. Firmware writes input/state to a committed descriptor then writes START. An extended host interpreter validates bounds and invokes a **view `step(circuitId, inputBits, priorState)`** through STATICCALL; results update committed guest output/state. Hard limits on circuit size, output size and gas prevent an unbounded instruction. Fixed-code allowlist or code-hash binding prevents upgrading a peripheral inside a dispute.

Wrapper sketch:

```text
onMMIOWrite(START):
    descriptor = authenticatedGuestRead(descriptorAddress)
    require version, circuit identity, bounds and gas budget match context
    (output, nextCircuitState) = circuitCPU.staticStep(id, input, priorState)
    authenticatedGuestWrite(resultAddress, output || nextCircuitState)
    set committed status = DONE
```

Use caller-supplied explicit circuit state, not a shared per-caller `beat` state. The current VM has no general external-circuit device path; a frontend-only wrapper around tick cannot intercept inner guest loads/stores. This requires an interpreter extension or an explicit yield/resume host-call protocol. The fraud-proof arbiter must verify the same peripheral transition, including the external circuit's fixed semantics; otherwise it introduces a trusted escape hatch. For a complex peripheral, further bisect its operation instead of executing unbounded work as “one instruction.”

Generic graph evaluation costs roughly 16 RV32 instructions/NAND (~15k marginal gas/gate), while native circuit evaluation is ~1.9k/gate in our small fit. A graph MMIO call can therefore save **roughly 8× on the hot kernel**. For 174 gates, using 3.06M instruction gas as the comparator and ~0.45M native plus estimated 20–100k marshaling gives ~5–6× kernel improvement; the unchanged tick/page overhead reduces end-to-end benefit. This is a budget estimate, not a benchmarked peripheral.

**Single-MAC MMIO is a bad granularity:** software ~20×962≈19k marginal gas versus ~1.17M for the current NAND LUT MAC plus calls. Batch a dot product or use a direct deterministic EVM integer/LUT kernel; the latter is a new host accelerator with separate proof semantics, not a NAND accelerator. Only pursue the circuit hybrid for workloads whose native circuit beats their guest instruction sequence after marshaling.

## 5. Horizon scan, ranked / 相邻技术排序

1. **Stateless one-step arbitration and hierarchical replay:** highest relevance to full inference. Budget 150–300k happy settlement, 5–10M per two-party dispute; conditional finality and watcher/DA requirements apply. Reuse Cartesi/BoLD where possible. The [DeepSeek roadmap](ROADMAP_DEEPSEEK.md) distinguishes the deployed API, built pilot and missing production machinery.

2. **Off-chain model/site hosting with Greenfield + on-chain roots:** its [architecture](https://docs.bnbchain.org/bnb-greenfield/introduction/) stores metadata on a chain and payloads with providers. EVM cannot EXTCODECOPY Greenfield bytes. Authenticated witnesses bridge that gap. The [official CLI pricing example](https://docs.bnbchain.org/bnb-greenfield/for-developers/tutorials/file-management-overview/) lists 0.00006 BNB per GiB/month storage and 0.00041 read quota (it labels GiB as GB), so **475.24 GiB×0.00006≈0.0285 BNB/month** is illustrative, not a current provider quote. [FAQ](https://docs.bnbchain.org/bnb-greenfield/getting-started/general-faqs/) specifies provider-dependent prices, 128 KB minimum charged object size and reservation fees. Do not make every 1 KB VM page a separate hosted object: that can inflate billed size 128×. Pack chunks with subpage Merkle proofs. Measure provider latency and availability; no end-to-end SLA was established.

3. **zkVM / tensor proofs:** SP1's current production deployment and RISC Zero tooling make a second settlement route realistic, with estimated 250–350k wrapped verify gas. No full DeepSeek proof measured. [Binius64 benchmarks](https://www.binius.xyz/benchmarks/) report 1,365 Keccak permutations proven in 142.27 ms plus 28.42 ms witness time on C7i.16xlarge, 304.45 KiB proof. Binary arithmetic is naturally suitable for NAND graphs; hash/signature benchmarks are not NAND-MLP throughput measurements. A 304 KiB raw proof has roughly 5M worst-case calldata gas alone, so EVM wrapping is important. Benchmark a million-gate batch; do not prove 21 gates individually.

4. **opBNB:** public read `opbnb_reads.json` returned **0.001 gwei**, 100M block gas limit. Same nominal EVM gas would cost **50× less** than sampled BSC, not a guaranteed 100×; L1 data fees and deployment availability must be added. A 3M-gas MLP tick would be ~0.000003 BNB in L2 execution fee. The native full-model floor would still be ~398 BNB/token before L1 fees and would consume a huge number of L2 blocks. TapeOut's BSC contracts are not automatically deployed on opBNB; bridging settlement has separate trust/latency. [Official opBNB overview](https://opbnb.bnbchain.org/en).

5. **BSC faster blocks / super-instructions:** [roadmap](https://www.bnbchain.org/en/blog/bnb-chain-h2-2026-tech-roadmap-doubling-down-on-speed) reports 450 ms blocks, matching our reads. [Super-instruction article](https://www.bnbchain.org/en/blog/accelerating-smart-contract-execution-on-bsc-with-super-instruction) reported 15% faster execution and 17% throughput improvement, but explicitly local/consensus-neutral: **no automatic gas discount**. Moreover [August 2026 v1.8.0-alpha notes](https://www.bnbchain.org/en/releases) remove that optimization in the preview branch; it is not a reliable future dependency. Throughput gains of tens of percent cannot erase a 10^14-gas workload. Re-measure gas after actual protocol changes.

6. **SSTORE2 / on-chain sites / ERC-6551:** [SSTORE2](https://github.com/0xsequence/sstore2) is useful for immutable program/asset chunks, and [ERC-6551](https://eips.ethereum.org/EIPS/eip-6551) makes container-controlled pointers/updates natural. The page contract has immutable bytes; “owned page” means control of the registry/manifest, not editable bytecode. A 1 MB site payload costs at least ~200M code-deposit gas plus CREATE/calldata/map overhead; therefore use full-bytecode hosting for small permanence-critical assets and off-chain content-addressed media for voice/video/models. EthFS-style storage does not execute the hosted app inside EVM. No existing EthFS deployment or pricing was assumed here. Tokens changing owners should transfer admin authority through audited container rules, not alter historical model commitments.

## 6. Project decisions / 四项目的新能力

| Project | Newly practical software capability | Keep native / keep off-chain |
|---|---|---|
| Driver | Reloadable route/state policy, trajectory evaluation, versioned input logs | Native 21-NAND immediate safety gate; off-chain physics/vision and high-frequency control. Even 0.45 s blocks are too slow for many control loops. |
| Relay | Full C routing/quota/retry/circuit-breaker logic with persistent state; batch requests | Native small authorization interlock when standalone gas matters. VM output is not actual HTTP delivery or proof an upstream model answered; off-chain execution plus receipts still required. |
| Fly brain | Configurable simulation schedule, replayable stimuli, plasticity/learning code | Keep tiny escape/reflex circuits; batch simulation off chain and settle roots. Running the entire neural simulation natively needs its own measured budget. |
| Voice canvas | Container-owned application manifest, deterministic scene/event interpretation and model commitments | Audio generation, ASR and large model inference off chain; chain stores ownership/settled actions, not an audio-rate compute loop. |

Top three experiments, including costs and go/no-go gates, are the roadmap's phases 1–3: **stateless arbiter**, **real mixed-format expert tile + Engram**, **hierarchical disputed replay**. Keep the standalone graph interpreter as a compatibility/debugging tool. Build direct C policy paths and the small arbitration prototype; stop full native weight deployment and per-MAC circuit MMIO unless new measurements change the economics.
