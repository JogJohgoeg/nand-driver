# Driver v2: measured results / 实测结果

Both circuits finish **24/24 and 24/24**. Total finishing steps: **3294 memoryless, 3262 memory** (0.971% fewer with memory). Mean progress is 1.000 vs 1.000 laps.

**Scope of the result:** this is a best-found comparison, not a global optimality proof. The specified environment does not require memory to finish a lap. Hidden speed alone does not prove that every memoryless controller must be slower. The stronger reactive search overturned the initial hand-expert comparison; those results are retained. Do not cite this as a proof that memory is necessary for optimal driving.

中文：双方均能完成全部起点；记忆收益仅为本次搜索中的实测步数差，不是全体无记忆布尔策略的最优性证明。低速无记忆策略也能完成，所以本环境不满足“完成任务必须有记忆”的强表述。

| Controller | Grid search steps | Final steps | NAND | LATCH | Depth | Exhaustive transitions |
|---|---:|---:|---:|---:|---:|---:|
| memoryless | 3442 | 3294 | 559 | 0 | 38 | 32768 |
| memory | 3322 | 3262 | 824 | 3 | 58 | 262144 |

## Search and training

Grid search: 216 reactive and 486 speed-tracking parameter combinations. Both then receive 400 deterministic sensor-table mutations, seed 29. The reactive challenge reaches 3294 total steps and the initial memory challenge reaches 3295. A further memory search warm-starts from the evolved reactive policy and receives 400 additional mutations. This extra budget is disclosed; no global best-possible score is claimed. Tables see only sensor bits and (for memory) the three register bits. No position, step counter, start identity or simulator speed is supplied.

The recurrent differentiable experiment uses widths 48/32/16/7 (four actions plus three next-state bits), soft gate and wiring choices, 600 Adam epochs, teacher-forced old state, trajectory visitation weights plus a full valid-input floor. Memoryless uses four final outputs. Discretization is followed by 1000 local gate/wiring mutations. Neither neural experiment reproduces the teacher reliably; the selected circuits use exact decision-DAG Boolean distillation into the same DLGN representation, with a shared exact saturating three-bit counter for next state. Factoring that counter reduces the memory DLGN from 1008 to 493 gates. Raw and polished neural networks are retained. This is a successful discrete-controller artifact, **not a successful end-to-end neural distillation result**.

- memoryless: neural weighted error 0.136637; after polish 0.124595; exact decision DAG 341 gates, 1024 valid rows, zero mismatches.
- memory: neural weighted error 0.637419; after polish 0.585472; exact decision DAG 493 gates, 8192 valid rows, zero mismatches.

Untuned diagnostic on 96 random starts (seed 811; broader offsets, never used for selection): memoryless 96/96 finishes, 13251 total steps, mean progress 1.0000; memory 96/96 finishes, 13233 total steps, mean progress 1.0000.

The register equals the actual speed index on all 3262 closed-loop steps. 15 visited observations have different expert actions at different speeds. That proves memory is needed to reproduce **this expert**, not that it is needed by every equally fast policy. Frozen-state ablations are in memory_evidence.json.

## Encoding and read-only verification

Official wire IDs 0/1 are constants; 2..16 are inputs. Three op-1 LATCH elements precede the NANDs, each with one 24-bit big-endian D wire that may point forward. NAND op 0 has two 24-bit wire references. Logical state bytes are one 0/1 value per latch; ABI state and inputs pack bits least-significant-bit first. Outputs are the last four gate wires. Exhaustive checks call the unmodified official Circuit.step for every input/state combination, including invalid thermometer patterns and state 7. Action pedal bits remain mutually exclusive. Closed-loop scores equal the selected teachers exactly.

Live user CPU `0x6Fb4089e7Cbaa9660Fd11056274Cbd8117EE5B38`, block 120819519: scanned 279 circuits, found 61 stateful circuits. Existing circuit #12 passed 16 read-only step comparisons. No live tapeout or beat was sent. The **new** circuits were deployed and executed only in isolated PyEVM using the official artifacts.

| Circuit | First beat gas used | Subsequent beat gas used | estimate_gas range |
|---|---:|---:|---:|
| memoryless | 1349234 | 1331147–1332400 | 1383387–1398059 |
| memory | 1972677 | 1935553–1939677 | 2027532–2027604 |

These are local PyEVM gas measurements, not a BSC gas quote. Each circuit also passed 64 official-EVM step comparisons and eight persistent Witness beats with state assertions.

Exact **unsent** tapeout calldata: [tapeout_calldata.txt](tapeout_calldata.txt). Recipient, chainId 56, value zero and full data: [tapeout_request.json](tapeout_request.json). Full netlist and counts: [dlgn_v2.json](dlgn_v2.json). No signing key is read. The live scanner optionally reads only BSC_RPC_URL from ~/.tapeout_env, never records that URL, and issues read-only calls.

## All 24 starts

| Start index | Lateral | Heading offset | Memoryless steps | Memory steps |
|---:|---:|---:|---:|---:|
| 0 | 0.0 | 0.0 | 136 | 136 |
| 0 | 0.6 | 0.4 | 137 | 136 |
| 0 | -0.6 | -0.4 | 138 | 138 |
| 180 | 0.0 | 0.0 | 137 | 134 |
| 180 | 0.6 | 0.4 | 137 | 139 |
| 180 | -0.6 | -0.4 | 139 | 136 |
| 360 | 0.0 | 0.0 | 138 | 138 |
| 360 | 0.6 | 0.4 | 139 | 137 |
| 360 | -0.6 | -0.4 | 137 | 135 |
| 540 | 0.0 | 0.0 | 134 | 135 |
| 540 | 0.6 | 0.4 | 137 | 135 |
| 540 | -0.6 | -0.4 | 136 | 136 |
| 720 | 0.0 | 0.0 | 137 | 135 |
| 720 | 0.6 | 0.4 | 138 | 136 |
| 720 | -0.6 | -0.4 | 139 | 136 |
| 900 | 0.0 | 0.0 | 136 | 135 |
| 900 | 0.6 | 0.4 | 140 | 136 |
| 900 | -0.6 | -0.4 | 136 | 135 |
| 1080 | 0.0 | 0.0 | 136 | 135 |
| 1080 | 0.6 | 0.4 | 135 | 135 |
| 1080 | -0.6 | -0.4 | 139 | 138 |
| 1260 | 0.0 | 0.0 | 137 | 134 |
| 1260 | 0.6 | 0.4 | 139 | 137 |
| 1260 | -0.6 | -0.4 | 137 | 135 |

## Reproduce locally

Runtime: Python + NumPy. Training adds PyTorch. EVM checks use the dependencies pinned in ../../stateful_cpu/requirements-lock.txt (the existing /private/tmp/stateful-cpu-venv was used). No farm compute or credits. From this directory:

```sh
python3 test_env2.py
python3 baselines.py
python3 reactive_challenge.py
python3 memory_challenge.py
python3 memory_challenge.py --warm
python3 select_teachers.py
python3 train.py
python3 compile2.py
python3 verify.py
python3 memory_evidence.py
python3 holdout.py
python3 read_cpu.py
/private/tmp/stateful-cpu-venv/bin/python evm_verify2.py
python3 report.py
```

See [RULES_v2.md](RULES_v2.md) for bilingual dynamics. See baseline_grid.json, *_challenge.json and memory_warm.json for all search-stage results. The remaining research gap is a certified memoryless upper bound or a task specification that truly requires memory; neither is manufactured here.
