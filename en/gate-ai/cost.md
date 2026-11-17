# What a large model on chain would cost

> Running a large model directly in an on-chain processor on BNB Chain costs about 20,000 BNB per token. So the model runs off chain and disputes are settled on chain.

## Conclusion

- **Running a full large model directly on chain: we don't do it.** Even in the best case, each token takes about 4×10^14 gas and fills the whole chain for nearly 30 days.
- **Run off chain, settle on chain: this works.** The model runs off chain, and only a commitment to the result goes on chain. If someone disagrees, the dispute is narrowed down to one instruction, and an on-chain contract recomputes that one instruction to decide.

## Direct execution: per token

The example is DeepSeek-V4.1-Flash (about 16 billion active parameters per token), running in the on-chain RISC-V processor. The numbers below are estimates from the count of multiply-adds, not measurements.

| Case | Instructions per token | Gas per token | Blocks filled | Days the whole chain is full | BNB per token |
|---|---|---|---|---|---|
| 20 instructions per multiply-add (measured inner loop) | 3.20×10^11 | 3.985×10^14 | 5,732,001 | 29.85 | 19,925 |
| 40 instructions per multiply-add | 6.40×10^11 | 7.969×10^14 | 11,463,078 | 59.70 | 39,847 |
| 80 instructions per multiply-add | 1.28×10^12 | 1.594×10^15 | 22,925,232 | 119.40 | 79,691 |

- 40 and 80 are sensitivity assumptions, not upper limits.
- The first row, at the 2026-09-13 BNB/USD rate of 722.195, is about 14.4 million US dollars per token.
- The model weights are about 510 GB. Today's on-chain machine has only 16 MB of memory, so they don't fit. A new paging interface is needed first.

## Run off chain, settle on chain: one settlement

| Settlement | Estimated gas | BNB at 0.05 gwei |
|---|---|---|
| Submit and confirm the result for one token | 150,000–300,000 | 0.0000075–0.000015 |
| One full dispute (39 rounds of bisection, both sides, plus the final step) | about 5 million–10 million | 0.00025–0.00050 |

- This is a design budget. It has not been measured in Solidity yet.
- It does not include the cost of off-chain execution, replay by watchers, data storage, or deposits.
- Normally you pay only to submit and confirm. You pay for a ruling only when there is a dispute.

## What already works

With a tiny model of 88 parameters (16→4→4, int4), the whole dispute flow runs end to end, all locally:

- One inference takes 1,712 instructions.
- We broke the state on purpose after instruction 1,478. Bisection found that step in 11 rounds, the judge recomputed it from one page of code, and picked the honest side.
- All 1,712 steps were replayed one by one and passed.

Not done yet: the on-chain dispute contract and a testnet deployment.

## How it was calculated

- Date: 2026-09-13. Only on-chain data was read. No transactions were sent.
- At block 121602744 the suggested gas price was **0.05 gwei**, the gas limit per block was 69,522,300, and blocks came every 0.45 seconds on average.
- One gas = 5×10^-11 BNB. Gas prices and token prices change.
- The gas model was fitted to the receipts of 80 public transactions.
