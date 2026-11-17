# Fly CNS → logic circuits / 果蝇全中枢神经系统逻辑蒸馏

| Stage / 阶段 | Status / 状态 | Evidence / 证据 |
|---|---|---|
| 1 Data / 数据 | PASS / 已完成 | 176,422 neurons; 11,752 groups; 3,853,300 type edges; 125,024,863 synapses; 132.7 MB / 全量数据通过校验 |
| 2 Rate model / 速率模型 | PASS numerical checks / 数值检查通过 | 8 × 160-step trials; all finite and bounded; GF peak 0.284 < 0.5 / GF未达默认触发阈值 |
| 3 GF escape / 巨纤维逃逸 | Calibration + circuit PASS / 校准与电路通过 | 39 NAND@10; gain3.60; 102/256 positives; 0/128 controls / 正例39.8%，控制静默 |
| 4 Visual→DN / 视觉→下行 | Calibration + circuit PASS / 校准与电路通过 | 24 NAND@7; gains3.90/5.85; 84/85 positives; controls silent / 正例均超过30% |
| 5 Scaling / 扩展规律 | PASS fixed-interface curve / 固定接口曲线完成 | 10/100/1k/10k/11752 types: 48/59/44/44/44 NAND; 100% finite teacher agreement / 有限域全等价 |
| 6 Architecture / 链上架构 | Proposal + local semantic check complete / 方案与本地语义检查完成 | 92 ROI groups; 74.24% cross-ROI edges; 4-bit scenario≈4.09B gas/step / 参考情景非实测全脑 |

The long-term target is the whole MaleCNS, not a claim of an achieved whole-brain behavioral model. Task-card reference counts are 176,422 neurons and approximately 125 million synapses; live extraction will establish the actual query scope. / 长期目标是全脑；当前不声称实现了全脑行为模型。任务卡参考计数为176,422个神经元、约1.25亿突触，实际查询范围将以提取结果为准。

**Current correction / 当前修正:** the original round 3/4 circuits below are historical baselines, not current burn recommendations. The user required calibration before further distillation and ≥30% positives. Calibration is now completed before retraining; new artifacts live in `calibrated/gf/` and `calibrated/visual_dn/`. / 原第3/4轮电路仅保留为历史基线，不再作为烧录候选。先完成行为约束校准，再训练平衡数据集。

Calibration / 校准: keep leak=0.25, rate threshold=0.1 and firing threshold=0.5; search each target gain from1.25 in0.05 increments, selecting the smallest that activates all32 looming calibration trials and suppresses all32 controls. Calibration uses amplitudes .75/.9 and durations24/48; the later finite Boolean domain uses amplitudes .55/.70/.85/1 and durations16/32. / 固定泄漏和阈值，仅拟合目标增益；校准与后续布尔域采用不同幅度和时长。

| Target / 目标 | Fitted gain / 增益 | Minimum looming peak / 逼近最低峰值 | Maximum control peak / 控制最高峰值 | Positive domain rows / 正例 |
|---|---:|---:|---:|---:|
| GF / DNp01 | 3.60 | .505339 | .436885 | 102/256 =39.84375% |
| DNp02 | 3.90 | .504200 | .403844 | 84/256 =32.8125% |
| DNp11 | 5.85 | .502935 | .403415 | 85/256 =33.203125% |

There are four looming temporal profiles and four non-looming controls: one-step flash, two-step flash, stationary dim and dark. All128 control-domain rows are silent for each target. The sources are **assumed LC4/LPLC2 feature rates**, not measured neural traces or rendered visual stimuli. Therefore this is qualitative calibration to published activation behavior, not independent biological validation. High sustained LC4-only and translating-spot stimuli are not silently treated as negative controls; broad non-looming silence is not established. Some fly visuomotor pathways respond to translating objects ([Kim et al., 2023](https://doi.org/10.1016/j.cub.2022.12.014)). / 非逼近控制包括短闪光、低强度静态和黑暗，全部静默；但源特征曲线是假设而非实测，不能据此声称任意非逼近刺激都不触发。

Connectome topology, synaptic counts, and predicted neurotransmitters do not identify thresholds, time constants, receptor signs, or behavior. All chosen dynamics must be stated as assumptions, and circuit equivalence to those dynamics must be distinguished from biological validation. / 连接组无法确定阈值、时间常数、受体效应或行为。必须披露动力学假设，区分模型等价性和生物验证。

TapeOut uses NAND+LATCH with C=g*d³. The task-card reference #280 has 87 NAND+3 LATCH and 261k gas per step. Large models require many circuits. CircuitGraph source uses constructor-fixed acyclic wiring, concatenates private part states, and returns only the last part's outputs. Recurrent cross-part signals require explicit timestep handling; per-ROI wiring alone is insufficient. / 大模型需要多个小电路；组合器只允许固定无环布线，拼接各部件状态，仅返回最后部件输出。跨部件反馈必须显式处理时间步。

Safety / 约束: read-only chain access; no tapeout/enter/settle or other chain writes. Data target <2 GB; no download >10 GB; each run <30 minutes. Credentials are read privately from ~/.tapeout_env. / 仅只读链访问，不发送交易；数据目标小于2GB，单次下载不超过10GB，单次运行少于30分钟，不打印令牌。

Sources / 来源: [MaleCNS programmatic access](https://male-cns.janelia.org/download/), [neuprint-python query documentation](https://connectome-neuprint.github.io/neuprint-python/docs/queries.html). Local compiler reused from dlgn_llm/common.py and dlgn_ctrl/compile.py.

Round 1 observations / 第一轮观察: `neurons.parquet` is approximately 94 MiB. neuprint-python 0.4.26 runs on this environment's Python 3.9; 0.5.2 and 0.6.3 import syntax failed. The model index will retain one explicitly named `__untyped__` aggregate so untyped cells are not silently dropped; this heterogeneous group is a major approximation, not a discovered cell type. / 神经元表约94MiB；使用兼容Python3.9的neuprint-python 0.4.26。无类型神经元暂合为显式未知组，避免静默丢弃；这是重要近似，不是真实细胞类型。

Published GF evidence / GF文献依据: LC4 and LPLC2 provide direct inputs to GF and encode distinct looming features ([Ache et al., 2019](https://doi.org/10.1016/j.cub.2019.01.079)). The live MaleCNS table labels GF as `DNp01`, with instances `DNp01(GF)_L/R`. / LC4和LPLC2分别提供逼近刺激的不同特征，直接输入GF；实时数据中GF类型名为DNp01。

Glutamate sign will be an assumption: inhibitory is a defensible baseline for fly brain, with receptor-dependent exceptions and separate sensitivity analysis needed for the CNS ([network statistics paper](https://www.nature.com/articles/s41586-024-07968-y)). / 谷氨酸的基线抑制符号属于假设，需考虑受体差异并进行敏感性分析。

ROI membership / 脑区归属 (overlapping, not an additive partition / 存在重叠，不可直接相加):

| ROI | Neurons / 神经元 | Pre sites / 突触前位点 | Post sites / 突触后位点 |
|---|---:|---:|---:|
| CentralBrain | 54,463 | 19,279,459 | 54,014,256 |
| Optic(L) | 54,298 | 7,101,867 | 23,315,237 |
| Optic(R) | 55,697 | 7,055,777 | 27,416,429 |
| VNC | 25,794 | 9,508,190 | 26,104,020 |
| FB | 2,832 | 446,448 | 1,644,344 |
| EB | 707 | 181,456 | 730,915 |
| PB | 865 | 50,122 | 177,590 |

All 5,619 ROI annotations are in `data/roi_counts.json`. `somaSide` is populated for 150,726 neurons (25,696 missing); `rootSide` is kept as a separate field. / 完整5619个ROI见数据文件；胞体侧缺失25,696条，不使用rootSide静默填充。

Round 1 PASS / 第一轮通过: all 3,853,300 edge weights match their sparse matrix coordinates exactly; 176,422 unique body IDs; SHA-256 manifest in `data/verification.json`. Directed type degrees (self-loops included): out median 281, p95 704.45, max 11,308; in median 282, p95 721.45, max 11,062. Full quantiles and weighted strengths are in `data/summary.json`. / 全部边权、稀疏矩阵坐标及唯一ID验证通过；包含自环，完整度分布和强度分布见数据摘要。

Round 2 / 第二轮: `r_next = 0.75*r + 0.25*clip(1.25*A*r + drive - 0.1, 0, 1)`, where A is target×source, signed by the modal predicted NT of source type, divided by target total unsigned incoming synapses. ACh +1; GABA/Glu/histamine −1; other/unknown 0. No fitted time scale. / A为目标×源矩阵，按目标总输入突触数归一化，使用来源类型的众数递质符号。无拟合的真实时间单位。

Signed nonzero edges: 3,617,485; 606 zero-sign types suppress 6.38% of synaptic weight. 658 groups have mixed NT predictions. This is a disclosed coarse model, including the heterogeneous unknown group. / 零符号类型关闭相应快速传递，混合递质与未知组属于粗粒化近似。

| Sign variant / 符号 | Stimulus / 刺激 | Driven / 驱动类型 | Peak firing types ≥0.5 / 峰值触发数 | GF peak / GF峰值 | Final max / 最终最大值 |
|---|---|---:|---:|---:|---:|
| glu_inhibitory | zero | 0 | 0 | 0.000000 | 0 |
| glu_inhibitory | looming | 2 | 6 | 0.284279 | 2.73e-10 |
| glu_inhibitory | olfactory | 53 | 123 | 0.000000 | 5.62e-10 |
| glu_inhibitory | distributed | 596 | 603 | 0.000000 | 4e-10 |
| glu_excitatory | zero | 0 | 0 | 0.000000 | 0 |
| glu_excitatory | looming | 2 | 6 | 0.284607 | 2.73e-10 |
| glu_excitatory | olfactory | 53 | 131 | 0.000000 | 5.66e-10 |
| glu_excitatory | distributed | 596 | 614 | 0.000000 | 8.38e-09 |

All 1,280 full-CNS steps pass finite/[0,1] checks; zero-input trajectories stay zero; stimulus removal decays in these trials. Clipping guarantees boundedness; it does not prove physiological stability. GF fails the arbitrary 0.5 firing criterion under LC4/LPLC2 drive, so the next round must disclose any lower threshold or changed local normalization. / 全部1280步数值检查通过；零输入保持零，本次撤去刺激后衰减。限幅保证有界而非生理稳定性；GF在默认0.5阈值下不触发，后续任何校准必须明确记录。

Round 3 / 第三轮: `gf/circuit.json` + `gf/verify.py`: soft DLGN trained on all 64 stimulus combinations, 14 NAND + 0 LATCH, depth 6, C=3,024. Independent byte evaluation recomputes rate labels: 64/64 PASS. Kissat UNSAT proves DLGN/byte equivalence (not gate optimality or biology). / 全64刺激组合训练并穷举验证；SAT仅证明编译等价。

Extracted LC4→GF=6,362 and LPLC2→GF=4,862 synapses; GF self=2. Inputs encode each source amplitude with two bits and duration [4,8,16,32] with two bits. LC4 is a linear ramp, LPLC2 a quadratic ramp, with clamped feature rates; only the isolated target evolves, retaining whole-CNS input normalization. / 使用真实类型间突触数，两路幅度各2位、时长2位；源特征钳位、目标速率演化，保留全脑归一化。

GF peak=0.233676 for maximal input; firing threshold 0.2 gives only **1 positive of 64** (constant-negative baseline 98.4375%). Thresholds 0.1/0.15/0.2/0.25/0.5 yield 14/5/1/0/0 positives. This illustrates threshold sensitivity and a narrow finite task, not whole escape behavior. Zero LATCH means a reset-to-zero fixed-horizon input→decision circuit, not a persistent timestep integrator. / 最大刺激下GF超过假设的0.2阈值；正例极少，应披露常负基线。该电路是固定时域决策，不是持久状态积分器，也非全脑逃逸行为证明。

Round 4 / 第四轮: `visual_dn/circuit.json` + `visual_dn/verify.py`: LC4/LPLC2→DNp02/DNp11; 9 NAND + 0 LATCH, depth 4, C=576, all 64 rows / 128 output bits exact; DLGN↔NAND SAT miter UNSAT. The trained soft DLGN had 4/64 row errors at 17 NAND@6; the delivered circuit is exact synthesis of the finite behavioral table after training failed, not a claimed perfect learned student. / 软DLGN存在4行误差，最终电路采用有限行为真值表精确综合，未声称训练直接得到完美结果。

The 0.2 threshold yields no positives; the explicitly calibrated 0.05 threshold yields 28 DNp02 and 12 DNp11 positives, with maximum rates 0.197173 and 0.097737. Constant-zero output baseline=68.75% per bit. This measures activation, not escape direction: pooling all LC4 cells loses the spatial synaptic gradients that experiments identify ([Dombrovski et al., 2023](https://www.nature.com/articles/s41586-022-05562-8)). / 0.2阈值下均不触发，调整至0.05后分别28和12个正例。类型聚合丢失空间梯度，只能讨论激活，不能声称预测逃逸方向。

Corrective round 5 / 校准修正第5轮: calibrated GF 39 NAND+0 LATCH@10, C=39,000, 256/256 bits; visual DN 24 NAND+0 LATCH@7, C=8,232, 512/512 bits. Both have independent exhaustive byte/teacher checks and UNSAT compiler miters. Primary paths: `calibrated/gf/{circuit.json,verify.py}` and `calibrated/visual_dn/{circuit.json,verify.py}`. Original circuits are superseded. / 两个新主电路均满足正例比例、负控制和全输入等价要求，原电路已被替代。

The calibrated soft GF student still missed20/256 rows; exact behavioral-table synthesis produced the primary. The visual soft-student errors are recorded in its results.json. Exact table synthesis is a fallback after attempted DLGN training, not evidence that optimization learned a perfect network. / 精确综合属于训练后的兜底，不冒充训练成功。

Round numbering / 轮次: user calibration correction inserted as round5; original plan step5 scaling resumes in round6, and step6 architecture follows in round7. / 用户校准要求插入第5轮，原计划第5步和第6步分别顺延至第6轮和第7轮。

Round 6, plan step5 / 第6轮，原计划第5步: nested subgraphs keep LC4/LPLC2/GF/DNp02/DNp11 and add types ranked by synapses into those five, then outgoing strength. Whole-CNS incoming normalization remains fixed; omitted populations are zero; all included non-source populations evolve recurrently. Target gains are frozen from the preceding calibration. / 保持归一化与校准增益不变，子图内所有非源类型进行循环速率演化。

All five teachers satisfy ≥30% positives per output and zero fires on all128 non-looming control rows before distillation. Every delivered circuit passes256 rows×3 outputs=768 bit checks and an UNSAT DLGN/byte miter. Soft-student row errors are31/27/31/31/31; all primaries use exact finite behavioral synthesis. / 每个教师先满足平衡和控制条件，才进入蒸馏；软学生有误差，主电路采用精确行为表综合。

The fitted log-log gate slope is −0.0247, predicting44.20 NAND at11,752 types; direct measurement gives44 NAND@10, C=44,000, 0 LATCH, one8-input/3-output circuit. These five nested models are not independent scaling samples. The interface encodes only256 fixed-horizon profiles and3 outputs; this estimate applies only to that behavior and cannot be extrapolated to complete recurrent CNS dynamics. / 拟合结果仅适用于256种固定时域刺激、3个输出的窄行为接口，不能宣称44门实现全脑动力学。完整状态的分区和成本需另外估算。

Round 7, plan step6 / 第7轮，原计划第6步: assign each type to its primary ROI with maximum summed pre+post counts, retaining explicit unassigned/unknown categories. This yields92 nonempty groups. 2,860,878/3,853,300 type edges (74.2449%) and53.7426% of synaptic weight cross those groups. Per-ROI circuits therefore require substantial boundary state, and large groups must be subdivided by an actual measured gate budget. / 92个非空分区之间存在大量连接，不能把脑区当作互不耦合的小电路。

Mapping to constructor-fixed `CircuitGraph` / 映射方案:

1. Fix a global state-bit order and a type→ROI→part mapping. Every future part computes local next-state bits from old boundary rates, local LATCH values, and sensory features. Quantization and transition fidelity still need to be established; the delivered finite-horizon circuits do not implement this transition. / 先固定全局状态顺序和分区，每个部件依据旧边界状态计算下一状态；当前有限时域电路尚不是这种转移电路。
2. Supply `Graph.step(oldState, packed(oldState, sensoryInput))`, with the boundary copy generated from the same authoritative old state. All cross-part wires select this external old-state region, never another part's newly computed rate. Local next-state bits become LATCH D values. / 全部跨分区输入来自同一旧状态副本，避免同一时间步中读到刚更新的数据。
3. `Graph.step` returns concatenated nextState automatically; a final small collector exposes motor outputs because the graph exposes only its last part's outputs. One complete graph invocation equals one synchronous model step, with all new state committed only after every part finishes. / 一次完整图调用对应一个同步模型时间步，最后统一提交，末部件仅收集运动输出。
4. For read-only execution the local caller can carry returned state to the next call. Persistent operation would require a wrapper that stores state and derives the boundary copy itself. Existing `Graph.beat(inputs)` does not generate that copy or validate its consistency against stored state. No wrapper was deployed or called. / 只读运行由调用方传递状态；持久化需要自动生成一致状态副本的包装器，当前没有部署或发送交易。

A local two-part reciprocal recurrence was exhaustively checked over8 state/input combinations using the existing Circuit.step interpreter. Synchronous old-state wiring passes8/8; naive same-step output forwarding differs on4/8. This verifies the semantic issue, not a full EVM deployment or a fly model. / 双部件反馈示例证明旧状态同步传递的重要性，不冒充完整链上验证。

Reference-sized full-state scenarios / 全状态参考规模情景:

| Bits/type | State bits | Parts at3 state bits/part | NAND tokens at87/part | LATCH tokens | Step gas at261k/part | Aggregate burn gas at461112/part |
|---:|---:|---:|---:|---:|---:|---:|
| 1 | 11,752 | 3,918 | 340,866 | 11,752 | 1,022,598,000 | 1,806,636,816 |
| 4 | 47,008 | 15,670 | 1,363,290 | 47,008 | 4,089,870,000 | 7,225,625,040 |
| 8 | 94,016 | 31,339 | 2,726,493 | 94,016 | 8,179,479,000 | 14,450,788,968 |

These assume, without having built the transitions, that87 NAND can update3 state bits as in #280 (depth13). They exclude graph deployment, wiring, boundary collection, storage, and other overhead; they are neither cost bounds nor measured whole-brain gas. #280's cached read-only step estimates were261,430–264,293, while its historical burn used461,112 gas (block120884836). C=g*d³ is a logic cost metric, not token price or gas. Burn resources are one token per NAND/LATCH element in the existing official-bytecode tests; native-coin gas cost remains `gas × gasPriceWei / 1e18`, with no current price quote here. / 这些是假设而非上下界；C不是gas或币价。费用需使用实际gas价格，本文不提供实时币价。

At four bits/type, state is5,876 bytes; supplying a boundary copy doubles state-related call bytes to11,752 before sensory inputs. A naive edge-by-edge implementation has15,413,200 source-bit references; actual part-local deduplication could reduce this, but it has not been synthesized. A single whole-CNS graph invocation at these reference costs has not been demonstrated executable. / 四位状态及其副本已达11752字节，朴素布线1541万位引用；需要实测去重和分区，尚未证明整图单次调用可行。

First burn recommendation / 首次烧录建议: if the user chooses a **bounded behavioral pilot**, use `scaling/11752/circuit.json`:44 NAND,0 LATCH, depth10, C=44,000,308 netlist bytes,8 inputs and3 outputs, exhaustive768/768 output-bit checks. It evaluates only the documented256 reset-to-zero feature profiles. It needs one circuit and no composer; it must be named as a finite-profile motor-response surrogate, never a whole-brain timestep. The two individual calibrated unit artifacts remain independently verified (GF39 NAND; visual-DN24 NAND). / 若用户决定做有限行为演示，可选44门三输出电路；不要称为全脑时间步。未调用任何烧录、进入、结算或其他链写操作。

Next work / 后续工作: continue after plan step6 with control-profile robustness, independent teacher checks, and a small genuine recurrent NAND+LATCH transition model. Preserve the calibrated gain/threshold record and test positive/negative balance before every new distillation. / 继续检查控制鲁棒性、独立教师验证，并构建真正有状态的小规模转移电路；每次蒸馏前检查校准和平衡条件。

| Types | Represented neurons | Type edges | NAND | LATCH | Depth | C | Own teacher | Whole-CNS teacher |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 10 | 7059 | 74 | 48 | 0 | 14 | 131712 | 100% | 99.4792% |
| 100 | 49479 | 5580 | 59 | 0 | 12 | 101952 | 100% | 99.7396% |
| 1000 | 76935 | 160415 | 44 | 0 | 10 | 44000 | 100% | 100.0000% |
| 10000 | 171597 | 3339358 | 44 | 0 | 10 | 44000 | 100% | 100.0000% |
| 11752 | 176422 | 3853300 | 44 | 0 | 10 | 44000 | 100% | 100.0000% |
