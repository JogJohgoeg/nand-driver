# Worked examples

> Gate-level designs for TapeOut circuit problems: gate count, depth and a one-line idea for 10 problems.

## Rules

- Two-input NAND only. Sequential problems also allow LATCH (stores one bit of input each cycle).
- Gate count = number of NAND gates. Sequential problems also count LATCHes. Depth = the most levels of gates a signal passes through from input to output.
- Every problem was checked locally in simulation: small problems run every input, large problems run every input or many random inputs.

## 10 problems

| No. | Problem | Gates / depth | Approach |
|---|---|---|---|
| 3 | XOR | 4 / 3 | First compute n1 = NAND(A,B), then NAND it once with A and once with B, then combine. Exhaustive search proves 3 gates cannot do it. |
| 18 | Half adder | 5 / 3 | The 4-gate XOR plus one gate: NAND n1 with itself to get the carry, so one gate does two jobs. |
| 75 | Divide by two | 1 NAND + 1 LATCH / 1 | Invert the output and store it back. Toggling needs one bit of storage and one inverter, so 2 parts is the minimum. |
| 48 | Count of 1s in a 4-bit number | 20 / — | One full adder plus one half adder, then XOR and AND on the two carries. |
| 83 | Sequence detector 1011 | 6 NAND + 2 LATCH / — | A 4-state machine. Try every state encoding and keep the cheapest. One state bit equals the input directly. |
| 100 | 16-bit + 8-bit addition | 108 / — | Chain 9-gate full adders for the low 8 bits. The high 8 bits only carry, so use a chain of 5-gate half adders. |
| 145 | 6-bit comparator (<, =, >) | 71 / — | "Greater than" is a prefix chain from the top bit down, 12 gates per lower bit. "Equal" and "less than" take 4 more gates off the chain. |
| 162, 163 | 8-bit max / min | 70 / — | A borrow chain computes A<B, then use it as the select signal, 3 gates per bit to pick A or B. Gate count 9n−2. |
| 209 | 16-to-4 priority encoder | 78 / — | Split in half recursively: if the high half has a request, take its index, otherwise the low half's. Merge with 3 gates per bit. |
| 227 | 8-bit saturating subtraction | 91 / — | Two's complement subtraction A + ~B + 1. A top carry of 0 means A<B; use it to clear the result, 2 gates per bit. |

"—" means the notes did not record the depth.

## The 9-gate full adder

Many of the addition problems reuse this one.

```text A full adder from 9 NANDs: the first 4 gates compute x = A⊕B, 4 more compute the sum, and the last 1 gives the carry
g1 = NAND(A, B)
g2 = NAND(A, g1)
g3 = NAND(B, g1)
x  = NAND(g2, g3)
g5 = NAND(x, Cin)
g6 = NAND(x, g5)
g7 = NAND(Cin, g5)
Sum  = NAND(g6, g7)
Cout = NAND(g1, g5)
```

The carry gate reuses g1 and g5, so it needs no extra inverter. The notes also used exhaustive search to rule out an 8-gate full adder.

## Pitfalls

- `NAND(x, ~x)` is always 1, not 0. For a constant 0, invert it again.
- In two's complement subtraction, a top carry of 1 means no borrow, so you can use it directly as an enable.
- To get d AND c: first `x = NAND(d, c)`, then `NAND(x, x)`. A single NAND gives you the inverse.
