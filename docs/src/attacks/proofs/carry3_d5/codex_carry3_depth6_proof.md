# Three-bit positive carry has minimum NAND2 depth6

Let A and B be unsigned three-bit words and c one input bit. The output is `[A+B+c >= 8]`, on all128 inputs. The statement permits arbitrary gate count, sharing, and optional literal constants. It concerns this carry function; it does not establish minimum depth or cost for a complete adder or multiplier.

## Complete function enumeration

Let F_d contain every Boolean function of the seven ordinary positive input signals realizable with NAND2 depth at most d. Starting from the seven input truth tables, form each next set by retaining the prior set and adding NAND(a,b) for every pair in the prior set. Induction on a circuit's output gate proves that this recurrence covers every DAG at the given depth, regardless of gate count or sharing.

The exact sizes F0 through F3 are7,35,540,84156. A depth5 root is NAND of two F4 functions. Every F4 function is either already in F3 or the NAND of two F3 functions.

Write T for the target truth table and Z for its complement. Each root operand must equal1 on every state in Z. For a newly formed operand NAND(a,b), this condition is exactly `(a & b & Z)==0`. Its contribution to the final output is the product `a & b`, which is a subset of T. For operands already in F3, add their complements when they satisfy the same condition. Thus a depth5 realization exists exactly when T is the union of two resulting products, or T is already realizable at a smaller depth.

Complete enumeration yields1,052,195 legal unordered F3 operand pairs,21,787 distinct products, and262 products maximal under set inclusion. Keeping only maximal products is safe: replacing a product by a larger product still contained in T cannot spoil a union cover of T. No pair of maximal products covers T; the earlier-depth check is also negative. Therefore depth5 is impossible.

The native implementation scans all unordered F3 pairs directly. An independent Python implementation instead constructs, for each zero state, a bitset of candidate functions that are0 there, intersects these bitsets for each first operand, and enumerates the surviving partners. It independently reconstructs every primary truth table and F3, and agrees on every count and the final exclusion. Native execution took2.014 seconds and Python5.277 seconds. Both low-word and full128-row parity controls exercise reachable and unreachable cases.

Optional constants do not help a nonconstant NAND function: constant propagation removes NAND(0,x), and replaces NAND(1,x) by NAND(x,x), without increasing the depth of surviving logic. The same exclusion therefore covers optional constants.

## Matching upper bound and artifacts

`codex_carry3_d6_witness.json` is extracted from a previously verified ADC3 graph, then independently checked on all128 arithmetic inputs; its output depth is exactly6. This proves the matching upper bound.

`codex_carry3_depth6_proof.json` fingerprints the function catalog, native source and output, independent Python checker and result, and witness. Primary evidence is this complete local enumeration, not a gate-limited SAT inference. Claude main separately reports that CaDiCaL returned UNSAT on the matching31-slot NOSYM CNF after3500 seconds; its local log copy is pending and is not needed for the enumeration proof. For that CNF, binary-tree unrolling bounds any depth5 output cone by31 NAND occurrences, dead padding is permitted, and use_all is false, so a provenance-matched completed UNSAT is also depth-complete.
