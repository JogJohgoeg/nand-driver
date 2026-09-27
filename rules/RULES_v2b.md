# Driver v2b / 带惯性的驾驶环境

## English

`env2b.py` preserves `env2.py` and reuses its NumPy-only track occupancy, original
1440-sample centerline, half-width 1.3, grid .04, and 24 fixed starts.

- Five speed notches: **0.10, 0.20, 0.30, 0.40, 0.50** world units per step.
- Steering angle at these notches: **10, 8.25, 6.5, 4.75, 3 degrees**.
- Two consecutive identical nonzero pedal commands commit one speed notch, then
  clear the pending command. Coast clears it; reversing pedal direction starts a
  new two-step sequence. Repeated pairs saturate at speed endpoints.
- Four action bits: left, right, throttle, brake. Left+right cancels; brake wins
  if both pedals are set. Generated controllers enforce pedal exclusivity.
- Speed update precedes steering, which precedes movement. Reset speed .10,
  pending command zero, controller latch state zero.
- Rays at +60,+30,0,-30,-60 degrees, range **2.4**, samples every .1. Thermometer
  thresholds remain strict `distance > .8, 1.6, 3.0`; all five third bits are
  consequently zero. No speed, position, time or pending-command sensor.
- Optional documented blackout variant: before decisions 4,8,12,... (zero-based
  environment step index modulo 4 equals 3), all 15 bits become zero. Dynamics
  continue unchanged. No separate blackout bit or clock is provided.
- Terminate on crash, one lap, or 1200 steps. Run score is centerline progress
  clamped to [0,1] laps, with fewer finishing steps as tie-break. Aggregate uses
  mean progress then sum of finishing steps; an unfinished run contributes 1200
  to that sum. Report finish count separately.

Five speeds and three pending-command values require 15 exact states (four
bits). The three-bit exact expert restricts its reachable speed to .10–.30 and
never commands beyond those endpoints: three settled states plus four pending
states fit in seven codes. This restriction applies to that expert, **not** to
the environment or reactive controller. Four-latch candidates may use the full
range. Equal-budget search is empirical evidence within the tested policy
families, not a mathematical upper bound on every reactive Boolean circuit.

## 中文

保留 env2.py，沿用其仅依赖 NumPy 的赛道：1440 个中心线采样点、半路宽 1.3、
网格 .04 和 24 个固定起点。五档速度为 **.10/.20/.30/.40/.50**，对应转角为
**10/8.25/6.5/4.75/3 度**。同一非零踏板指令连续两步才改变一档，然后清空
待执行指令；滑行清空，反向踏板重新计第一步。端点限幅。

输出为左、右、油门、刹车四位；左右同开抵消，双踏板时刹车优先（控制器
保证踏板互斥）。先调速、再转向、再移动。初速 .10，待执行指令及寄存器
初值均为零。五条射线角度不变，**最远 2.4**，步长 .1；阈值仍为严格大于
.8/1.6/3.0，故每条射线第三位恒零。不提供速度、位置、时间或惯性状态。

可选遮断版：第 4、8、12… 次决策前全部 15 位输入变零，物理继续运行；
不额外提供遮断标记或时钟。出界、一圈或 1200 步结束；先比圈进度（限制
0–1），再比完成步数。24 起点汇总先比较平均进度，再比较总完成步数
（未完成计 1200），另报完成数。

完整的五档速度×三种待执行指令需要 15 个状态，即四位。三位精确专家将
自身速度限制在 .10–.30：三个稳定态加四个待执行态共七个编码。环境和
无记忆控制器没有这个限速。四位候选可使用全范围。相等预算搜索是所测
策略族的实验证据，不冒称全体无记忆布尔电路的最优性证明。

## Final protocol / 最终实验协议

Blackout was **not enabled**: the ordinary 2.4-range environment exceeded the
15% equal-budget target. All three classes (reactive, 3-bit, 4-bit) receive 72
seed-policy evaluations and 300 mutation evaluations, including no-op mutations.
No class is warm-started from another class's evolved result. Accepted-policy
trajectory replays supply mutation locations; they do not evaluate new candidates.
After search, each teacher supplies trajectories from the same 256 additional
random starts (seed 2026) for reachable-row distillation, not further policy search.
Fresh diagnostic holdout seed 812 is never used for training or selection.

Three-bit exact-expert codes (LSB first in the official packed state):

| Code | Speed | Pending pedal |
|---:|---:|---|
| 0 | .10 | none |
| 1 | .10 | throttle |
| 2 | .20 | none |
| 3 | .20 | throttle |
| 4 | .20 | brake |
| 5 | .30 | none |
| 6 | .30 | brake |
| 7 | .10 | reset alias, unreachable in normal expert trajectories |

最终未启用遮断，因为普通短射线版本已超过 15% 的目标。三类策略均为
72 次专家种子评估 + 300 次变异评估（含无效变异）；不借用另一类进化结果
热启动。后续蒸馏对每位教师使用相同的 256 个额外随机起点（种子 2026），
仅收集可达行，不再搜索策略。种子 812 的新验证集不参与训练或选择。
表中为三位精确专家编码；最终压缩电路对未访问行使用 don't-care，不承诺
在任意人为构造的传感器/状态组合上仍保持物理速度编码含义。
