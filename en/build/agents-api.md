# Agents-API circuits #283, #284

> The control rules of an agent session built as on-chain circuits: #283 is the first version, #284 adds circuit breakers, reason codes and tiered payment.

::: buttons
- [Flip #283 and #284 in your browser](https://nand.aihashrate.stream/agents-api/)
:::

## What it is

- The model, tools and sub-agents all run off chain. Each cycle, the circuit only decides the next step: call the model, which kind of tool to call, whether to start a sub-agent, whether to compress the context, whether to stop, whether to pay.
- The rules are fixed on chain. Anyone can use `step()` to recompute gate by gate and see whether a run followed the rules.
- Both are on the TapeOut CPU `0x6Fb4089e7Cbaa9660Fd11056274Cbd8117EE5B38` on BNB Chain, and both went on chain on the same day, 2026-09-11.

## The two circuits

| Item | #283 | #284 |
|---|---|---|
| Build | v2 | v5 |
| Inputs / outputs / state bits | 16 / 15 / 10 | 16 / 17 / 23 |
| NAND | 152 | 295 |
| LATCH | 10 | 23 |
| Netlist | 1,104 bytes, sha256 `93d65a3634679190…` | 2,157 bytes, sha256 `de800761487244af…` |
| Block | 121240525 | 121331172 |
| Spot check after going on chain | 64 sets of `step()`, match local | 64 sets of `step()`, match local |

To check the on-chain netlist bit by bit, see the last section of [Check it yourself](../start/verify.md).

## What #284 adds

| Item | #283 | #284 | Reason code when triggered |
|---|---|---|---|
| Round limit (a model call and a compression each count as a round) | 7 | 255 | 2 |
| Tool failure retries | 1 | 3, stops on the 4th failure | 3 |
| Sub-agents running at once | 3 | 7 | — |
| Sub-agent failures (3 cycles with no reply also count as one) | none | stops on the 3rd | 4 |
| Compression has no effect | gets stuck | stops if the context is still full after 3 compressions in a row | 6 |
| Repeated tool definition lookups | no limit | at most 3 in a row, stops on the next one | 7 |
| Budget used up / key rejected | stops | stops | 1 / 5 |
| Payment | 1 bit | 2 bits: 0 no pay, 1 partial, 2 full | — |

- Every circuit breaker is one-way: once it stops, it stays in DONE, and from then on the output is 0 whatever the input.
- The payment bits equal the judge's result only on the cycle that completes. At all other times they are 0.

## How it is proven correct

- #283: state plus input give 2^26 combinations in total. All were tested exhaustively, with 0 mismatches against the spec.
- #284: 2^39 combinations are too many to test one by one, so a SAT solver proves it.
  1. The spec was turned into a netlist along two independent paths (517 gates and 289 gates), and the two were proven equivalent on all 2^39 combinations. The packaged on-chain bytes were proven again.
  2. 16 safety properties were each proven to hold for every state and every input. For example: DONE cannot be left; payment always comes with completion and a passing judgment; the reason code is non-zero if and only if the machine has stopped; no counter goes out of range.
  3. Another model read only the written spec and wrote its own Verilog (302 gates), which was proven equivalent to the reference.

## Sessions that were run

- #283: several different models acted as the worker on the same task, "the sum of the primes below 1000". Payment happened only for the answer 76127. Every cycle matched the on-chain `step()` bit for bit.
- #284: three models each ran one session (5, 5 and 7 cycles). Every cycle matched the on-chain `step()`, and all ended with full payment.

## Try one call yourself

```sh Run one cycle of #284 on chain (needs Foundry's cast)
cast call 0x6Fb4089e7Cbaa9660Fd11056274Cbd8117EE5B38 \
  "step(uint256,bytes,bytes)(bytes,bytes)" \
  284 0x89ab14 0x07a0 \
  --rpc-url https://bsc-rpc.publicnode.com
```

- State is 3 bytes (23 bits), input is 2 bytes (16 bits), output is 3 bytes (17 bits). Bit i goes in bit i%8 of byte i/8.
- This set was spot-checked after going on chain: it should return the new state `0x89ab0c` and the output `0x000100`.
