# Microduck

> 39 NAND gates steer a simulated little duck robot. Circuit #281 is written on BNB Chain. Walking is still done by the original neural network.

::: buttons
- [Open Microduck](https://nand.aihashrate.stream/duck/)
- [See the layout of #281](../../gallery/en/chip.html?tid=281.732)
:::

## How to play

1. Open the page and wait for it to load the robot, the MuJoCo physics simulation, and the walking policy.
2. Pick a starting point and a "brain" (hand-written rules or circuit #281), then click run.
3. Watch the duck walk toward the goal. The right panel shows the live input bits and which of the 39 gates are on.

Everything runs in your browser. The page has an "On chain" switch, **off by default**. Turn it on and each steering step becomes a read-only call to the circuit on BNB Chain (through `https://bsc-rpc.publicnode.com`). No wallet needed. If a call fails, the page falls back to computing in your browser.

## Who does what

- **Walking**: the upstream Microduck ONNX walking policy, unchanged.
- **Steering**: circuit #281. 14-bit input, 2-bit output `[left, right]`: `10` turns left, `01` turns right, `00` and `11` don't turn.
- The 14 input bits = 12 bits from a virtual depth sensor (top and bottom halves × three zones, left, center, right × two distance thresholds, 0.3 m and 0.7 m) + 2 bits of goal direction.
- The forward speed command is fixed at 0.25 m/s.

> The depth sensor is an ideal sensor added in the simulation, with no noise. The goal direction comes straight from the true position in the simulation. This is not a real robot.

## Circuit #281

| Item | Value |
|---|---|
| Gates | Trained as 14 logic gates, compressed to 39 NAND gates, depth 13, no latches |
| Netlist size | 273 bytes |
| Equivalence | On all 16,384 inputs, the hand-written rules, the gate network, the NAND netlist, and the page's evaluator all give the same result |
| Processor | BNB Chain `0x6Fb4089e7Cbaa9660Fd11056274Cbd8117EE5B38` |
| Written on chain | 2026-09-09, block 120889741 |
| Transaction | `0x4160e34f83e0220a79d529b78514a69e5c31453c4e8e3ab427c48d7e756c9740` |
| On-chain check | 64 random inputs, on-chain `eval` and local all match |

## Results on the original field

One field, 8 fixed starting points. The hand-written rules and circuit #281 give exactly the same results.

- 7 / 8 reach the goal, and 6 of those never touch an obstacle.
- 1 fall. There is no policy for getting back up after a fall.
- With the on-chain switch on, start 1: all 2,014 steps computed on chain, 0 failures, 0 fallbacks, goal reached, bit for bit identical to local.

This is a development starting point on a fixed field. It does not mean a different field gives the same result.

## Memory circuit #282

The page can also hook up #282 (22 NAND gates + 3 latches) so the duck remembers which way it just turned. It is a fixed rule and does not learn. On field 2, which has a U-shaped pocket, some starting points do better and some do worse. It is not an overall improvement.

## The new circuits (tested, not on chain yet)

We rebuilt the steering circuit and the memory circuit and ran the final test in simulation on 2026-11-11. Neither is on chain yet; the demo page above still runs #281 and #282.

- **New steering circuit** (145 NAND gates, no latches): On two test courses, its collision-free arrival rate is 25–29 percentage points higher than heading straight for the goal. Course 1: 63.98% against 38.94%. Course 2: 54.78% against 25.56%.
- **New memory circuit** (554 NAND gates + 9 latches, placed after the new steering circuit): Adding memory makes it better. Its collision-free arrival rate is 99.33% on course 1 and 98.56% on course 2, about 41 points higher than the new steering circuit without memory.

"Collision-free arrival" means the duck reaches the goal and never touches an obstacle on the way. "Heading straight for the goal" is a comparison controller that ignores obstacles and steers only by the goal direction.

### Details of the check

- **How it was tested**: the same in-browser simulation as the demo page, with random starting points. The pass criteria, the candidate circuits and the starting-point seeds were all fixed before the test, and all 30,564 runs were done in one go. Course 1 has 5,100 runs per side and course 2 has 900. A criterion counts as met only if the one-sided 95% lower bound clears the line.
- **Course 3, never seen before** (not used in training, 150 runs each, not counted toward passing): the new steering circuit arrives collision-free in 49.33% of runs, under half, and one of its three groups missed the line. The new memory circuit scores 93.33%.
- **Falls**: the new steering circuit falls more often than heading straight for the goal, 1.16% against 0.08% on course 1. The new memory circuit did not fall in the 1,800 runs on courses 1 and 2.
- **Fixed starting points**: the 16 fixed starts on course 2 are hard. The new steering circuit reaches the goal from 14 of them, only 4 without a collision. With the new memory circuit it reaches the goal from all 16, 8 without a collision.
- **The gain does come from memory**: with every latch read as 0 at every step, all 1,950 runs come out the same, run for run, as the new steering circuit without memory. We also compared against 6 memoryless circuits found by the same search; the new memory circuit beats each of them by more than 39 points.
- All of this is simulation with an ideal sensor. It has not been tested on a real robot.

## Next

- [21 gates that drive](index.md): circuit #279, the first circuit made the same way.
- [Arena rules](arena.md)
