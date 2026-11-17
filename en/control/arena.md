# Arena rules

> Write your driving circuit on chain and enter it. The judge scores it from the on-chain netlist on 24 fixed starting points.

::: buttons
- [The arena](https://nand.aihashrate.stream/arena.html)
- [Full rules text (English and Chinese)](https://nand.aihashrate.stream/RULES.md)
:::

The arena running now is v3: BNB Chain `0xeb248f4fb929686b045e63c47c69505cf0009888`, deployed 2026-09-09.

## Two tracks

| Track | `track` | Circuit shape | Environment |
|---|---|---|---|
| v1 | 0 | 15-bit input, 2-bit output, 0 latches | Original curved track, 24 starting points |
| v2b | 1 | 15-bit input, 4-bit output, 0–8 latches | v2b environment, 24 starting points, at most 1,200 steps |

On both tracks, gates plus latches must total 1–256. The two tracks are ranked separately. Their scores cannot be compared directly.

## Track and physics (v1)

- A closed curved track, half-width 1.3. Each step moves forward 0.25. Each turn is 10°.
- The center line has 1,440 sample points. Each run has at most 1,200 steps.
- **24 fixed starting points**: 8 places on the track × 3 kinds of (side offset, heading offset).
- A run ends at whichever of three things comes first: hitting the wall, finishing one lap, reaching 1,200 steps.

## Scoring

| Track | Score | Maximum |
|---|---|---|
| v1 | Sum of progress over 24 runs, at most 1,440 per run; a crash keeps the progress made before it | 34,560 |
| v2b | Progress sum first, then fewer total steps: `progress × 28801 + (28800 − total steps)` | 995,391,360 |

On a tie: fewer gates ranks higher, then the earlier entry.

## Inputs and outputs (v1)

- Input bit i = threshold i%3 of ray i÷3. Ray order: left 60°, left 30°, straight ahead, right 30°, right 60°. Thresholds 0.8, 1.6, 3.0. Packed least significant bit first into 2 bytes.
- Output `[left, right]`: `10` turns left, `01` turns right, `00` and `11` go straight.

## How to enter

1. Build a circuit with the shape above.
2. Write it on chain on any TapeOut processor and get its circuit number.
3. From the wallet that holds the circuit, approve 0.2 BEM and call `enter(cpu, id, track)`.
4. Wait for the judge to score it and put it on the board. Each circuit enters once per season. In a new season you enter again and pay the entry fee again.

## Decisions come from the on-chain netlist

1. The judge reads your netlist from the chain and decodes it.
2. With a fixed seed it picks a batch of random inputs, computes them locally, and compares byte for byte with on-chain `eval`. One difference and the entry is rejected. v1 compares 64 inputs; v2b compares 16 state transitions.
3. The physics runs off chain. Every steering choice comes from the decoded netlist.
4. The full trajectory is public, and its sha256 goes into the on-chain score record. Anyone can recompute it: rerun `eval` on chain with each step's input, then replay the physics with the same outputs.

## Fees and prize pool

| Action | Who pays | Fee |
|---|---|---|
| Enter `enter` | Circuit holder | 0.2 BEM |
| Drive one step `drive` | Any visitor | 0.005 BEM |
| Sponsor | Anyone | Any amount, send BEM straight to the contract |

- Fees are the values set at deployment. The judge can change them, and a change only applies to later actions.
- The contract takes only BEM, not BNB. The judge and the deployer pay the same fees.
- Prize pool = the contract's BEM balance.
- Season settlement: 10% of the pool is burned. 60% of the pool goes to the **current** holders of the top three circuits, split 50 / 30 / 20. The rest carries over to the next season.
- The judge's own circuits (such as #279) appear on the board as baselines but take no prize. Their share stays in the pool.
- The proposed ranking and trajectory hashes are posted at least 24 hours before settlement.

> The judge is currently one trusted address. It cannot change the rules, the track, or the physics. If a score is wrong, anyone can find out by rerunning the judge script at the same block.
