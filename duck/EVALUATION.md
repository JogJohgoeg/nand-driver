# Course 2 and seeded evaluation / 场地 2 与种子评估

**Memory now changes decisions, but is not a universal improvement.** On course 2 fixed starts the burned composite is worse (12/16 goals versus 14/16). On 100 random starts it improves goals (94 versus 90), with unchanged collision-free count (17) and slightly more mean steps. These are finite, paired tests, not a general performance guarantee.

**记忆确实改变了动作，但不是全面改善。** 场地 2 固定起点中，烧录组合较差（12/16 到达，而 A 为 14/16）；100 个随机起点中，到达数增加（94 对 90），无碰撞数仍为 17，平均步数略增。以下是确定性的配对测试，不代表普遍性能保证。

## Course 2: fixed starts / 场地 2：固定起点

| Brain / 大脑 | Goals / 到达 | Collision-free / 无碰撞 | Total steps / 总步数 | Mean steps / 平均步数 | Contact steps / 碰撞步数 |
|---|---:|---:|---:|---:|---:|
| A #281 | 14/16 | 0/16 | 45732 | 2858.25 | 4421 |
| A + B #282 (two-clear / 两步清空) | 12/16 | 0/16 | 47002 | 2937.62 | 5588 |
| A + B one-clear / 单步清空 | 11/16 | 0/16 | 44990 | 2811.88 | 5253 |

Both composites lose goals relative to A. The burned circuit overrides A on 116 control steps; the one-clear variant on 204. All 48 fixed trials have contacts, so this pocket/gap course is a severe contact-heavy stress test, not a successful collision-free navigation demo. Two-clear has one fall and three timeouts; one-clear has two falls and three timeouts; A has two timeouts.

两种组合的到达数都低于 A。烧录电路在 116 个控制步覆盖 A 的输出，单步版本为 204 步。48 次固定起点测试全部发生碰撞；这是接触密集的压力测试，不是无碰撞导航成功演示。两步版有一次跌倒、三次超时，单步版有两次跌倒、三次超时；A 有两次超时。

## Random seeds 1–100 / 随机种子 1–100

| Course / 场地 | Brain / 大脑 | Goals / 到达 | Collision-free / 无碰撞 | Mean steps / 平均步数 | Contact steps / 碰撞步数 |
|---|---|---:|---:|---:|---:|
| 1 | A #281 | 99/100 | 54/100 | 1542.84 | 1641 |
| 1 | A + B #282 (two-clear / 两步清空) | 99/100 | 54/100 | 1533.58 | 1566 |
| 1 | A + B one-clear / 单步清空 | 99/100 | 54/100 | 1533.58 | 1566 |
| 2 | A #281 | 90/100 | 17/100 | 1941.53 | 8424 |
| 2 | A + B #282 (two-clear / 两步清空) | 94/100 | 17/100 | 1974.12 | 8340 |
| 2 | A + B one-clear / 单步清空 | 88/100 | 17/100 | 1907.99 | 8295 |

Mean steps includes all trials, including early falls and 4,000-step timeouts. A shorter mean is not automatically better. On course 2, two-clear gains goals on seeds 3, 57, 70, 72, 93 and loses seed 32. One-clear gains 70, 72, 93 but loses 9, 11, 32, 60, 63. Collision-free means zero obstacle-contact control steps; in these results every collision-free run also reaches the goal. All warmup contact counts are zero.

平均步数包含提前跌倒和 4,000 步超时；较短不自动代表较好。场地 2 两步版改善种子 3、57、70、72、93，损失种子 32。单步版改善 70、72、93，却损失 9、11、32、60、63。无碰撞指没有任何障碍接触控制步；本批数据中无碰撞的测试也全部到达目标。所有预热阶段接触数均为零。

## Does A oscillate? / A 是否振荡？

The original eight poses and obstacles are retained. The added U opens west, with a back wall at x=0.65 and side walls y=±0.29. A downstream gap has 0.38 m clear width; goal is (3.15,0). Seven added poses initially have front-near and both side-near bits set with goal bits 00. A at new start 9 makes 153 turn-direction changes, 148 within one second of the preceding change. This is observed oscillation; symmetry alone does not mathematically force every memoryless controller to oscillate—#281 has a left-biased tie rule.

保留原始八个起点与障碍。新增 U 形口袋向西开口，背墙 x=0.65，两侧墙 y=±0.29；后方窄缝净宽 0.38 米，目标为 (3.15,0)。七个新增起点最初的前近、左近、右近位全为 1，目标位为 00。A 在起点 9 改变转向 153 次，其中 148 次距上一次转向改变不超过一秒。这是实际观察到的振荡；不能声称对称性在数学上迫使所有无记忆控制器振荡——#281 的平局规则偏向左转。

## Small unburned proposals / 小改动提案，未烧录

| Proposal / 提案 | Goals / 到达 | Collision-free / 无碰撞 | Contact steps / 碰撞步数 | Total steps / 总步数 |
|---|---:|---:|---:|---:|
| front_far_commit | 8/16 | 0/16 | 2417 | 51510 |
| side_clear_release | 12/16 | 0/16 | 3277 | 47004 |

1. The smallest wiring-only change is to commit at front-far (0.7 m) instead of front-near (0.3 m): map B input 2 to external bit 3 instead of bit 2. It needs no new NAND/LATCH gates, but performed worse for goals here. Do not treat it as a proven fix. The existing composer is immutable, so applying a wiring change on-chain would require a separately authorized deployment.
2. A small release-condition extension is to require front-far, left-near and right-near all to be clear for two steps. It retains three state bits and uses the existing unused side inputs. It reduces contact steps relative to burned B while retaining the same 12 goals, but still loses to A on goals and does not produce collision-free fixed runs. This is the more useful next candidate, not a claim of a complete solution.

1. 最小的接线改动是将承诺转向的触发从前近（0.3 米）改为前远（0.7 米）：B 输入 2 由外部位 2 改接位 3，不增加 NAND 或 LATCH。但本次到达表现更差，不能当作已验证的修复。现有组合器不可改接；链上应用需要另行授权部署。
2. 较小的释放条件扩展是：前远、左近、右近连续两步全清空才释放；保持三位状态，利用现有未使用的侧向输入。相比已烧录 B，它减少碰撞步数、维持 12 次到达，但到达数仍低于 A，也没有无碰撞的固定起点测试。它是更有价值的后续候选，不是完整解决方案。

Both proposals were tested only locally on these 16 starts, after freezing the main comparison. They were not added to the production controller, burned, or evaluated on the 100-seed benchmark. No tested proposal wins all reported metrics. A concrete side-clear netlist is saved as `side_clear_unburned.json`: 28 NAND + 3 LATCH, all 512 transitions verified. This exceeds the original 25-NAND target; no gate-minimality claim is made.

两个提案都仅在固定主对比之后，本地测试这 16 个起点；没有加入正式控制器、没有烧录，也没有进行 100 种子的评估。没有任何已测试提案在所有指标上获胜。具体的侧向清空网表保存在 `side_clear_unburned.json`：28 NAND + 3 LATCH，512 种转移全部验证；超过原先的 25 NAND 目标，不声称门数最优。

## Reproduction / 复现

Use the Course selector and Random start button with the same seed, brain and course. The active seed is visible; Reset repeats it. The shared JS Mulberry32 generator and bounds/clearance are documented in duck/README.md. Sampling bounds are x∈[-1.75,2.8), y∈[-1.5,1.5), with ≥0.25 m footprint clearance, ≥0.35 m goal clearance and uniform yaw in [-π,π). The narrow U interior is intentionally excluded by random clearance; the fixed close starts cover it. Seed poses match exactly between brains within each course.

使用相同场地、大脑和种子点击随机起点；当前种子显示在状态行，重置会重复该起点。共享 JS Mulberry32 生成器、采样范围和间距详见 duck/README.md。范围为 x∈[-1.75,2.8)、y∈[-1.5,1.5)，距障碍轮廓至少 0.25 米、距目标至少 0.35 米，偏航均匀取自 [-π,π)。随机间距排除了狭窄 U 内部；贴近障碍的固定起点负责覆盖该区域。同一场地内，各大脑的种子起点完全一致。

Artifacts: [random trial rows](./eval_random.json), [summary](./evaluation_summary.json), [MJCF](./course2.xml). In the repository, course2_fixed.json also contains all 48 fixed trials and packed decision traces. MuJoCo/ONNX, timestep, speeds, thresholds and burned circuits remain unchanged. HTTPS was blocked during evaluation; no on-chain writes or RPC evaluations were used.

文件：[随机测试明细](./eval_random.json)、[汇总](./evaluation_summary.json)、[MJCF](./course2.xml)。仓库中的 course2_fixed.json 包含 48 次固定测试及位打包决策轨迹。MuJoCo/ONNX、时间步长、速度、阈值及烧录电路保持不变；评估期间阻止 HTTPS，没有链上写入或 RPC 求值。

## Per fixed start / 每个固定起点

Cells: termination / contact steps / steps. goal=到达, fallen=跌倒, timeout=超时. Starts 1–8 are original; 9–16 are new.

| Start / 起点 | A | Two-clear / 两步 | One-clear / 单步 |
|---|---|---|---|
| 1 | goal / 41 / 2149 | goal / 41 / 2149 | goal / 41 / 2149 |
| 2 | goal / 32 / 2104 | goal / 32 / 2104 | goal / 32 / 2104 |
| 3 | goal / 127 / 2896 | goal / 225 / 3603 | goal / 183 / 3477 |
| 4 | goal / 255 / 3017 | goal / 220 / 3109 | goal / 220 / 3109 |
| 5 | goal / 245 / 3309 | goal / 147 / 2824 | goal / 131 / 2888 |
| 6 | goal / 196 / 2994 | goal / 237 / 3081 | goal / 143 / 2488 |
| 7 | goal / 23 / 2184 | goal / 23 / 2184 | goal / 23 / 2184 |
| 8 | goal / 178 / 3126 | goal / 344 / 3471 | fallen / 132 / 1955 |
| 9 | goal / 104 / 3264 | fallen / 100 / 2284 | fallen / 129 / 2443 |
| 10 | goal / 278 / 2981 | goal / 278 / 2981 | goal / 278 / 2981 |
| 11 | goal / 142 / 2390 | goal / 142 / 2390 | goal / 142 / 2390 |
| 12 | goal / 78 / 2330 | goal / 78 / 2330 | goal / 78 / 2330 |
| 13 | goal / 198 / 2496 | timeout / 1197 / 4000 | timeout / 1197 / 4000 |
| 14 | goal / 124 / 2492 | goal / 124 / 2492 | goal / 124 / 2492 |
| 15 | timeout / 1197 / 4000 | timeout / 1197 / 4000 | timeout / 1197 / 4000 |
| 16 | timeout / 1203 / 4000 | timeout / 1203 / 4000 | timeout / 1203 / 4000 |
