# Driver v2b / 带惯性的记忆控制器

**Target met:** 87 NAND + 3 LATCH, depth 13, 621 netlist bytes. Both circuits finish 24/24. Memory takes **3943 steps vs 8826 reactive**, **55.33% fewer**, without blackouts.

This is a strong **equal-budget empirical separation**, with register ablation and an independent holdout. It is not a certified upper bound over every possible memoryless Boolean policy. Memory is not needed merely to finish slowly. The tested performance criterion is substantially faster complete laps.

中文：87 NAND + 3 LATCH 达到电路尺寸和速度目标，无需遮断传感器。相等搜索预算下，双方 24/24 完成，记忆电路少用约 55.33% 步数。这是实测性能分离及状态消融证据，不冒称所有无记忆布尔策略的全局最优性证明。

## Rules and fairness

See [RULES_v2b.md](RULES_v2b.md). The original env2.py is preserved. Five speeds .10/.20/.30/.40/.50 require two consecutive identical pedal steps per notch; reversing or coasting resets the pending sequence. Turning falls from 10° to 3°. Rays stop at 2.4, so every 3.0-threshold bit is zero. No velocity/time/position inputs. Score is capped lap progress, then fewer finishing steps; 24 original starts, 1200-step cap.

Exact full-range speed+pending state requires four bits (15 states). The three-bit expert uses seven states up to .30; its restriction is not imposed on the reactive policy or environment. The four-bit expert was tested separately with the same budget.

| Policy class | Seed evaluations | Mutations evaluated | Finishes | Total steps |
|---|---:|---:|---:|---:|
| reactive | 72 | 300 | 24/24 | 8826 |
| 3-bit memory | 72 | 300 | 24/24 | 3943 |
| 4-bit memory | 72 | 300 | 24/24 | 3321 |

Each class uses seed 61, the same 72 steering/lookahead seed combinations and 300 single-row mutations, counting no-ops. The reactive class mutates steering or pedals; memory mutations update the exact speed/pending transition consistently. Neither memory class is warm-started from the evolved reactive result. Budgets are 372 scored candidates each. **Earlier progress-bus entries saying 144 seeds were arithmetic mistakes; JSON logs correctly record 72.**

## Circuit size versus score

Each teacher supplies the same 256 additional starts (seed 2026) after search. These are distillation rollouts, not extra policy optimization. Repeated visited rows provide frequency weights; unvisited rows are don’t-cares. PyEDA Espresso minimizes multiple outputs jointly, then the existing NAND compiler performs structural hashing and DCE. No neural convergence claim is made for this discrete minimization.

| Candidate | NAND | LATCH | Depth | Finishes | Steps | Notes |
|---|---:|---:|---:|---:|---:|---|
| v2b_memory_seed_pruned | 54 | 3 | 13 | 24/24 | 4401 | Smaller seed expert |
| v2b_memory_six | 95 | 3 | 12 | 24/24 | 4183 | L60/front/R60 feature subset |
| v2b_memory_pruned | 87 | 3 | 13 | 24/24 | 3943 | Selected; rare rows (<5 visits) are don’t-cares |
| v2b_memory_ten | 117 | 3 | 13 | 24/24 | 3943 | Exact fit to every collected row |

Selected model: 46224 weighted trajectory rows, 98 distinct sensor/register rows; training mismatch 0.0411%. Actual sensor bits used are [0, 1, 3, 4, 6, 7, 13] (0-based: L60 .8/1.6, L30 .8/1.6, front .8/1.6, R60 1.6). The constant third bits disappear. All three registers match the physical speed/pending pair on 3943/3943 required-run steps.

The four-bit teacher is faster (3321 steps), but its fully faithful minimized circuit needs 321 NANDs; it was rejected for the 150-NAND target. The 87-NAND selection leaves substantial size margin.

## Don’t-care failure and independent check

The first 61-NAND circuit used only the 24 trajectories (35 unique rows). It passed those starts but finished only 76/96 on diagnostic seed 811; the teacher finished 96/96. This exposed a real generalization failure in the sparse don’t-care fit. That version and its results are retained under v2b_core/. The additional seed-2026 teacher trajectories expanded coverage to 98 rows and produced the final 87-NAND circuit.

After that revision, a **fresh seed-812 holdout**, not used for training or candidate selection, gives memory **96/96**, mean progress 1.0000, total steps 15949; reactive **95/96**, mean progress 0.9902, step sum 36040 (unfinished runs contribute 1200). These finite tests are not a guarantee for arbitrary states or tracks.

Eight visited observations require different actions at different stored speeds/pending phases. Freezing the selected circuit at each of its eight register values makes seven settings fail every start; the remaining setting completes 24/24 but takes 11562 steps. This directly demonstrates the selected circuit’s dependence on feedback.

## Official encoding and EVM verification

Inputs are wires 2..16. Three op-1 LATCH elements have one 24-bit big-endian data wire each, pointing forward to computed next state. Combinational gates are op-0 NANDs with two 24-bit references. Last four gate wires are actions. Circuit.step reads old state, then captures all next-state bits together. ABI state/input packing is LSB first; logical Python state has one byte per 0/1 latch.

The unmodified official Circuit.step passed **262144 exhaustive memory transitions** and **32768 reactive inputs**, including unreachable sensor/state combinations. This proves encoding equivalence to the discrete network on the complete Boolean domain, not policy quality outside training. Both closed-loop scores were reproduced with Circuit.step; pedal exclusivity was checked exhaustively.

Official artifacts on isolated PyEVM passed 64 step comparisons and eight persistent Witness beats per circuit, plus exact official ABI calldata comparison. No HTTP provider, signing key or real-network transaction is used by the EVM verifier.

| Circuit | First beat gas used | Subsequent beat gas used | estimate_gas range |
|---|---:|---:|---:|
| reactive | 129035 | 111498–112410 | 124467–139106 |
| memory | 314615 | 277311–281236 | 285483–329399 |

Local PyEVM gas only, not a BSC gas quote. The earlier v2 live encoding evidence is retained in read_cpu.json; v2b verification required no additional network calls.

**Unsent calldata:** [v2b_tapeout_calldata.txt](v2b_tapeout_calldata.txt). Full recipient/chainId/value/data: [v2b_tapeout_request.json](v2b_tapeout_request.json). Netlist and score: [dlgn_v2b.json](dlgn_v2b.json). Nothing sent. No credits or farm compute.

## Required 24 starts

| Centerline index | Lateral | Heading offset | Reactive steps | Memory steps |
|---:|---:|---:|---:|---:|
| 0 | 0.0 | 0.0 | 531 | 165 |
| 0 | 0.6 | 0.4 | 269 | 164 |
| 0 | -0.6 | -0.4 | 534 | 166 |
| 180 | 0.0 | 0.0 | 531 | 164 |
| 180 | 0.6 | 0.4 | 269 | 163 |
| 180 | -0.6 | -0.4 | 271 | 164 |
| 360 | 0.0 | 0.0 | 530 | 162 |
| 360 | 0.6 | 0.4 | 271 | 162 |
| 360 | -0.6 | -0.4 | 268 | 162 |
| 540 | 0.0 | 0.0 | 531 | 165 |
| 540 | 0.6 | 0.4 | 269 | 170 |
| 540 | -0.6 | -0.4 | 271 | 167 |
| 720 | 0.0 | 0.0 | 531 | 164 |
| 720 | 0.6 | 0.4 | 269 | 163 |
| 720 | -0.6 | -0.4 | 271 | 165 |
| 900 | 0.0 | 0.0 | 531 | 164 |
| 900 | 0.6 | 0.4 | 270 | 163 |
| 900 | -0.6 | -0.4 | 270 | 165 |
| 1080 | 0.0 | 0.0 | 531 | 165 |
| 1080 | 0.6 | 0.4 | 268 | 166 |
| 1080 | -0.6 | -0.4 | 271 | 167 |
| 1260 | 0.0 | 0.0 | 530 | 162 |
| 1260 | 0.6 | 0.4 | 270 | 162 |
| 1260 | -0.6 | -0.4 | 269 | 163 |

## Reproduce

Environment dependency: NumPy only. Distillation additionally uses installed PyEDA 0.29.0; PyEVM dependencies are pinned in ../../stateful_cpu/requirements-lock.txt. From this directory:

```sh
python3 test_env2b.py
python3 search2b.py
python3 search2b.py --four
python3 distill2b.py --augment
python3 verify2b.py
python3 evidence2b.py
python3 holdout2b.py 812
/private/tmp/stateful-cpu-venv/bin/python evm_verify2b.py
python3 report2b.py
```

For the optional blackout experiment, pass --blackout to both searches and distill2b.py. It was not needed or used for the reported result. All v2 files remain alongside these v2b additions.

2026-09-09: Authorized browser-wallet burn completed: CPU `0x6Fb4089e7Cbaa9660Fd11056274Cbd8117EE5B38`, circuit **280**, tx `0x3815d2a86a3af898fee5c1126dd17d007d09a5f88234d83cad9732e43a16178d`, block 120884836, gas 461112. Exact netlist, `(15,4,3,90)` info (87 NAND + 3 LATCH), and 16 on-chain/local transitions verified. See `burn_v2b_result.json`; send guard prevents resubmission.
