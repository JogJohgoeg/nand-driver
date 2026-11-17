# Final call_a analysis

The sole-depth11 endpoint belongs to the 295N exploratory candidate, not the promoted 174N winner.

Boolean expression tree (AND groups are balanced; leaves are observations or old latch bits):

```
OR
├─ AND [initial eligibility]
│  ├─ AND(~busy,start,key_valid,quota1,quota0,rate_ok,~model_b_only)
│  ├─ AND(enable_a,healthy_a,~cool1,~cool0)
│  └─ OR(~prefer_b,~enable_b,~healthy_b,bcool1,bcool0)
└─ AND [retry eligibility]
   ├─ AND(busy,result,~ok,retryable,~retried,channel_b,~model_b)
   └─ AND(enable_a,healthy_a,~cool1,~cool0)
```

Initial selection of A makes the tier check redundant; quota still means BOTH bits set, not merely nonzero. No accept/choose_b/again wire occurs in this expression.

Mapped exploratory call_a cone: 49 NAND, 22 primary/state inputs, depth11. Farm wires 0..27 denote observations/state, NANDs begin at28.

One actual longest path (ties selected by first fanin):

model_b_only → w37 → w38 → w39 → w40 → w41 → w49 → w50 → w51 → w66 → w75 → w309

- w37 = NAND(w6, w6), depth 1
- w38 = NAND(w3, w37), depth 2
- w39 = NAND(w38, w38), depth 3
- w40 = NAND(w4, w39), depth 4
- w41 = NAND(w40, w40), depth 5
- w49 = NAND(w41, w48), depth 6
- w50 = NAND(w49, w49), depth 7
- w51 = NAND(w36, w50), depth 8
- w66 = NAND(w51, w65), depth 9
- w75 = NAND(w66, w74), depth 10
- w309 = NAND(w75, w75), depth 11
