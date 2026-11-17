# 21 gates that drive

> A driving circuit of 21 NAND gates, written on BNB Chain as circuit #279. Anyone can run it on chain themselves.

::: buttons
- [Watch it drive in the arena](https://nand.aihashrate.stream/arena.html)
- [See the layout of #279](../../gallery/en/chip.html?tid=279.732)
- [Contract addresses](../reference/contracts.md)
:::

## What it is

- A small car runs on a closed curved track. Its front has 5 distance rays (left 60°, left 30°, straight ahead, right 30°, right 60°).
- Each ray gives 3 bits by distance (greater than 0.8, 1.6, 3.0), for 15 input bits in total.
- Output is 2 bits `[left, right]`: `10` turns left, `01` turns right, `00` and `11` go straight.
- The controller is first trained as a differentiable logic gate network of 13 gates, then compressed to 21 NAND gates.

## Some numbers

| Item | Value |
|---|---|
| NAND gates | 21, depth 10, no latches |
| Netlist size | 147 bytes |
| Against the trained gate network | All 32,768 inputs tested exhaustively, 0 differences |
| 24 fixed starting points | All 24 finish one lap |
| 100 random starting points | 96 finish one lap (the other 4 start facing the wall, and no controller that sees only these 15 input bits can save them; the hand-written rules also get 96) |

## The on-chain record

| Item | Value |
|---|---|
| Chain | BNB Chain |
| Processor | `0x6Fb4089e7Cbaa9660Fd11056274Cbd8117EE5B38` |
| Circuit | #279 |
| Written on chain | 2026-09-08, block 120731587 |
| Transaction | `0xc6eaa6616968fc6f7ffa8058d18d55e26a06469e9e866ce07636d94e33754a6e` |
| Check | On-chain `eval` and the local netlist match on all 64 random inputs |

## Run it on chain yourself

Install Foundry's `cast`, then:

```sh Have BNB Chain compute one step with the on-chain #279 netlist (read-only, no wallet, no cost)
cast call 0x6Fb4089e7Cbaa9660Fd11056274Cbd8117EE5B38 \
  "eval(uint256,bytes)(bytes)" \
  279 0xff7f \
  --rpc-url https://bsc-rpc.publicnode.com
```

- `0xff7f` is the 15-bit input, packed least significant bit first into 2 bytes. Bit i = threshold i%3 of ray i÷3.
- The bytes returned are the 2-bit output `[left, right]`.
- Try another input and compare with the local netlist.

## Limits

- The controller imitates a hand-written rule. It is not reinforcement learning. At best it is as good as that rule.
- The track is fixed and has no noise. Results are reported on the same set of starting points, with no held-out test track.

## Next

- [Arena rules](arena.md): build your own driving circuit and compete.
- [Microduck](duck.md): 39 gates steer a little duck robot.
