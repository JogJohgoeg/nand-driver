# CONTEXT_USE — how much of the 192-bit context each TapeoutLLM rung actually uses

**Primary information / 主信息:** every current rung is a 4-gram backoff table and reads
**only the last 4 characters (24 input bits)**; the 200-bit sampled rungs add only the 8 random
sampler bits. The other 28 characters are dead wires, so the replies on the live page do not
depend on what you type. At equal gates, **no far-context shape beats the 4-gram**: higher-order
n-grams, a skip-bigram table that reads all 32 positions, and a 19,544-gate difflogic network all
score lower. Far context genuinely does not pay at this gate budget for English character prediction.

**Required context / 关联上下文:** 64-symbol alphabet, TinyShakespeare 90/10 split (1,003,822
train windows, 111,508 held out). "bits read" = transitive fan-in of the 6 output wires (exact).
"far-flip" = fraction of single far-bit flips (bits 0-167, the first 28 characters) that change the
6-bit output. Equal-gate reference is g44 (19,567 NAND, 24 bits, held-out top-1 0.4338).

**Next judgement / 下一步判断:** to make replies depend on the typed text, use a model whose
prediction is keyed by content far from the end (a skip feature the table keeps) — but expect lower
top-1 — or accept that this scale only supports near context and move the "real 192-bit model" to a
much larger, learnable-wiring network. The user decides; no burns.

## (a) Baseline — bits actually read per rung (exact fan-in of the outputs)

| netlist | nIn | nNand | bits read | slots read | far-flip (bits 0-167) |
|---|---:|---:|---:|---|---:|
| netlist_resyn_v0_4k_resyn.json | 200 | 1,935 | 32 | 28-33 (24 ctx + 8 random) | 0 |
| netlist_resyn_cap_s.json (cid 285) | 200 | 5,069 | 32 | 28-33 | 0 |
| netlist_resyn_cap_s4.json (cid 286) | 200 | 5,120 | 32 | 28-33 | 0 |
| netlist_resyn_cap_g3.json | 192 | 5,583 | 24 | 28-31 | 0 |
| netlist_resyn_g44_resyn.json | 192 | 19,567 | 24 | 28-31 | 0 |
| netlist_resyn_s41_resyn.json | 200 | 20,073 | 32 | 28-33 | 0 |
| netlist_resyn_v2_resyn.json | 192 | 61,646 | 24 | 28-31 | 0 |
| netlist_resyn_v4.json | 192 | 131,560 | 24 | 28-31 | 0 |

Every rung reads the last 4 characters only (bits 168-191) plus, for sampled rungs, the 8 random
bits (192-199). Far-flip ratio is exactly 0: flipping any of the first 28 characters never changes
the output. This is what the user observed on the live page.

## (b) Three far-context shapes at equal gates

### Shape 1 — higher-order n-grams (5-8)

| model | order | DLGN gates | nNand (resynth) | bits read | held-out top-1 |
|---|---:|---:|---:|---:|---:|
| g44 (reference) | 4 | 21,658 | 19,567 | 24 | **0.4338** |
| ng5 | 5 | 20,411 | 19,007 | 30 | 0.4213 |
| ng6 | 6 | 23,146 | — | 36 | 0.4204 |
| ng8 | 8 | 27,430 | — | 48 | 0.4109 |

All at min-support 10 / min-prec 0.22 / max-entries 3900. More context **lowers** top-1: the rare
5-8-gram rules eat the gate budget that the useful 3-4-gram rules need, so the table reads more bits
(30-48) but predicts worse. ng5 is bit-exact verified (held-out 111,508 x2 + 50,000 random, 0
mismatches, resynth_ng5.json).

### Shape 2 — skip-bigram table over all 32 positions

Each rule is (last character AND character at offset o) -> next character for o = 1..31, so the rule
set spans all 32 slots (192 bits read; each individual prediction uses 2 positions = 12 bits).

| model | entries | DLGN gates | bits read | far-flip (bits 0-167) | held-out top-1 |
|---|---:|---:|---:|---:|---:|
| skip2 (min-support 5, min-prec 0.10) | 3,400 | 17,942 | 14,342 NAND | 192 (all slots) | 0.0010 (7/6,720) | 0.1679 |
| skip (min-support 10, min-prec 0.30) | 227 | 1,902 | — | — | — | 0.1522 |

skip2 compiled to an official netlist (netlist_resyn_skip2.json, 14,342 NAND, 0 mismatches over
111,508 held-out x2 + 50,000 random) - so it is a real rung that reads all 32 positions, but at
14,342 NAND it still needs a split (over the 5,723-record single-chip cap). Reading all 32 positions
does not help: 0.168 is below the bigram baseline (0.2621). Far bits change the output on only 0.1%
of flips. Honest reading: a far character is nearly uncorrelated with the next character once the
last character is known, so skip features add gates without adding accuracy.

### Shape 3 — difflogic learned network (GPU venv /var/tmp/joj2/venvs/tcu, m64)

| model | gates | bits read | held-out top-1 |
|---|---:|---:|---:|
| df_2k_deep | 1,948 | 192 (random wiring) | 0.149 |
| df_14k_deep | 14,304 | 192 | 0.160 |
| df_20k_deep | 19,544 | 192 | **0.2336** |

difflogic 0.1.0 only supports random/unique wiring (learnable connections assert out), so these are
random-wired LUT stacks with a learned GroupSum readout. It reads all 192 bits but at 19.5k gates
still reaches 0.234 — below the bigram 0.2621 and far below the 4-gram 0.4338. The curve
0.149 -> 0.160 -> 0.234 is sublinear; closing the 0.20 gap to the table would take roughly an order
of magnitude more gates and an architecture with learnable wiring, which this package does not offer.

## (d) Honest conclusion and the cost of a real 192-bit model

Far context genuinely does not pay at this gate budget. English next-character prediction is
dominated by the last 1-4 characters; a far character carries almost no information conditional on
the near characters (skip-bigram far-flip 0.1%), and the two mechanisms that do read far context —
higher-order n-grams and random-wired learned networks — both score lower than the 4-gram table at
equal gates (0.41-0.42 and 0.23 vs 0.43).

What it would cost to use the full context productively: a learned structure with **learnable
wiring** (connections chosen by gradient, not random), because that is the only family here that can
turn 192 raw bits into a useful feature without the n-gram's combinatorially-exploding rule count.
difflogic 0.1.0 cannot express that (connections in {random, unique}); its random-wired curve implies
reaching table parity needs >= 10^5 gates (and may never converge with random wiring). At the
mainnet cap that means a split netlist (5,723 records per circuit, SPLIT_DESIGN.md) and, on today's
numbers, ~10^5-10^6 NAND — i.e. a different architecture, not a parameter tweak.

Artifacts: measure_context_use.py (fan-in), skip_model.py (shape 2), model_skip*.json,
probe2_ng5..8.json + resynth_ng5.json (shape 1), m64 /var/tmp/joj2/onestep_lm/df_20k_deep_report.json
(shape 3).
