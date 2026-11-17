# NAND plays Squared

> A netlist of 386 NAND gates plays the 11×11 Squared mini game in your browser. The netlist picks its own moves to reach the target square.

::: buttons
- [Open the demo](../../assets/squared/en.md)
:::

**How to play:** click "▶ Play". The netlist controls the white square. Each step it picks up, down, left, right, or stay, trying to reach the green target square. Reaching it scores 1 point. Leaving the board, or not reaching it within 33 steps, loses 1 point.

**How it actually does:** we played out all 14,520 positions on the 11×11 board (own square × target square) one by one. Every one reaches the target, every step gets closer, 7.3 steps on average. From the page's starting square (the center), all 120 targets are reached too, in 5.5 steps on average. For comparison, picking a random move each step reaches the target only about 11% of the time. Command: `python3 grid_policies.py --page …/assets/squared/en.html` (the script is in our code repository and is not public yet).

The demo lives on this site as one file. It loads no outside scripts, fonts, or images.

## What this player is

| Item | Value |
|---|---|
| Gates | 386 NAND gates, 0 latches |
| Input | 14 bits: your square and the target square, a 7-bit number each, low bit first (number = row × 11 + column) |
| Output | 3 bits: move 0–4 (stay, down, up, left, right) |
| Source | The full truth table of the rule "first reach the target's row, then its column" (all 121 × 121 inputs listed), reduced to NAND gates with yosys / abc; checked exhaustively on every input |
| Written on chain | 2026-09-15, block 121982629, circuit #287 on processor 0x6Fb4…5B38 |

## How the page checks it

- When the page opens, it computes the netlist's sha256 and compares it with the value written in the page. If they match, it shows ✓.
- Every step is computed two ways at once: gate by gate through the NAND netlist, and with the spec, computed straight from the rule. The right panel counts steps where they differ. It should always stay 0.
- The netlist is evaluated in a Web Worker, entirely in your browser, with no server.

## The on-chain button

- "Run one step on chain" is the only feature that goes online. One click sends one read-only `eth_call` to the public node `https://bsc-rpc.publicnode.com`, calling `step()` on the BNB Chain processor `0x6Fb4089e7Cbaa9660Fd11056274Cbd8117EE5B38`. No wallet, no cost.
- **If you don't click, it doesn't connect.**
- This netlist is already written on chain: circuit #287 on processor `0x6Fb4…5B38`. The transaction that wrote it is [`0x8d46c603…7a25`](https://bscscan.com/tx/0x8d46c603524de56ed67b78463edda40c0f0defc80ed7d522177ddbbc982b7a25). The cid box defaults to 287.
- Click it, and the chain runs one step on the current position while the page computes the same position with its own netlist. If both give the same move number, it shows "match".
- The chain returns two parts: the new state and the output. The page reads the first byte of the output part. Its low 3 bits are the move number, least significant bit first.
