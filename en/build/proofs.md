# Proven lower bounds

> The carry of a 3-bit addition needs at least 6 levels of NAND: 5 levels cannot do it, and a 6-level circuit exists.

## Result

| Item | Value |
|---|---|
| Function | A and B are 3-bit unsigned numbers, c is a 1-bit carry input, output `[A + B + c ≥ 8]` |
| Inputs | 7 bits, 128 combinations in total |
| Gates | Two-input NAND, any number, can be shared, can connect to constant 0 / 1 |
| Lower bound | Depth 5 cannot do it |
| Upper bound | There is a depth-6 circuit with 22 gates |

This covers only this one carry function. It says nothing about the minimum depth of a full adder or multiplier.

## Why 5 levels cannot do it

1. List every function that can be built with depth ≤ d, and call the set F_d. F_0 is the 7 inputs. For each new level, NAND any two functions from the level before and add the result. This misses no circuit, whatever the gate count or sharing.
2. Actual counts: F_0 = 7, F_1 = 35, F_2 = 540, F_3 = 84,156.
3. A depth-5 output = NAND(two F_4 functions). Each F_4 function is either already in F_3, or the NAND of two F_3 functions.
4. On the inputs where the output is 0, both operands must be 1. Filtering by this condition leaves 1,052,195 valid pairs of F_3 operands, giving 21,787 distinct products, of which 262 are maximal.
5. No two maximal products can make the target function, and shallower depths cannot either. So depth 5 is impossible.
6. Constants do not help: NAND(0, x) is always 1, and NAND(1, x) equals NAND(x, x). Neither makes the rest of the circuit shallower.

## Checked by two independent programs

- A native program scans every F_3 pair directly. It took 2.014 seconds.
- An independent Python program uses a different algorithm: for each input where the output is 0, it builds a set of candidate bits and then intersects them. It took 5.277 seconds.
- Both rebuilt every input truth table and F_3, and every count and the final result agree.
- SAT solvers (CaDiCaL, Kissat) were also run on the matching 31-gate slot problem, and both returned UNSAT. The main evidence is the full enumeration above, not SAT.

## The depth-6 circuit

- 22 NAND gates, depth exactly 6.
- Compared with `A + B + c ≥ 8` on all 128 inputs, one by one. All correct.
