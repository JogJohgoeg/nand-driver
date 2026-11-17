# Driver v2 / 有记忆的驾驶控制器

## English
Runtime environment uses only Python standard library and NumPy. Track, 24 starts,
road half-width 1.3, occupancy resolution .04, five rays (+60,+30,0,-30,-60°),
and strict thermometer thresholds (.8,1.6,3.0) match ../env.py. Track occupancy
is the union of radius-1.3 disks around the same 1440 centerline samples.
Inputs are those 15 sensor bits only; neither speed nor position is exposed.

Outputs [left,right,throttle,brake] are binary. Left/right 11 cancels; throttle/
brake 11 uses brake priority (controllers must produce mutually exclusive bits).
Reset speed is .10 and register state is zero. Speed index 0..6 maps to
.10+.05*index; throttle increments and brake decrements with saturation.
Speed changes first, then heading changes ±(10-index) degrees, then movement.
A three-bit controller register stores the index, least significant bit first;
invalid state 7 is treated as 6 and recovers on the next transition.

A run ends on leaving the road, completing one lap, or 1200 steps. Score is
centerline progress /1440 clamped to [0,1], with fewer finishing steps as a
lexicographic tie-break. Across 24 starts compare mean progress first, then
sum of finishing steps (unfinished runs assigned 1200). Report finishes too.
No reward shaping or speed input is used. Search results are best **found**,
not a proof of the optimum over every possible memoryless Boolean function.
Hidden speed makes observations partially observable; whether memory is necessary
for superior lap time must be tested, and is not assumed from this fact alone.

## 中文
环境运行仅依赖 Python 标准库与 NumPy。沿用 ../env.py 的赛道、24 个固定起点、
1.3 半路宽、.04 占用网格、五条射线（+60,+30,0,-30,-60 度）及严格大于
.8、1.6、3.0 的温度计编码，共 15 位输入；不提供速度、位置。

输出依次为左转、右转、油门、刹车。左右同时为 1 则直行；油门刹车同时为 1
则刹车优先，控制器应保证互斥。初始速度 .10，状态全零。速度档位 0..6
对应 .10+.05*档位，油门加一、刹车减一并限幅。先更新速度，再以
±(10-档位) 度转向，最后移动。三位寄存器以低位在前保存速度档位；
非法值 7 按 6 处理，下一次状态更新恢复合法范围。

出界、一圈或 1200 步结束。得分为中心线进度/1440，限制在 [0,1]；相同
进度时完成步数更少更优。24 起点按平均进度优先、完成步数之和其次
（未完成计 1200）比较，并单独报告完成数。不添加奖励或速度输入。
搜索结果只是已找到的最好策略，不冒称全体无记忆布尔函数的全局最优。
隐藏速度造成部分可观测性，但是否必须有记忆才能更快，需要实际验证。
