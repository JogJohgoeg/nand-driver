# One-step language model v0 — a combinational TapeOut netlist

**Primary information / 主信息:** v0 exists as a purely combinational TapeOut netlist: **192 input
bits = 32 characters × 6 bits, 6 output bits = the greedy next character, 0 latches,
37,334 NAND**, and it predicts the next character of held-out TinyShakespeare with **exact top-1
0.4259** against a **bigram 0.2621** and **trigram 0.3707** baseline on the same split. It is
bit-exact with its discrete reference on **every one of the 111,508 held-out contexts** and on
**1,000,000 random contexts** (0 mismatches), and the text it generates through the netlist is
character-identical to the reference's. Its predicted cost is **85,734,891 gas per step, i.e. 1.25×
the BSC block gas limit (68,444,479)** — so this size **cannot be executed in one transaction**. The
largest size that fits is **27,527 NAND** (63.2 M gas, exact 0.4190) and the spec's comfort point
(~4,300 NAND) reaches **0.3526**.

**Required context / 关联上下文:** interface frozen by [SPEC.md](SPEC.md); corpus TinyShakespeare
1,115,394 bytes, 90/10 split (1,003,822 train windows, 111,508 held out); alphabet 64 symbols in
[alphabet.json](alphabet.json); gas from `../netlist/gas_model.py` (read-only fit on 284 burned
circuits) and the block limit from `../netlist/chain_block_limit.json`. Training ran on the local
machine's CPU and on m64; the GPU path for a learned DLGN variant is set up but not yet folded in.

**Next judgement / 下一步判断:** burn one size to get a real `estimateGas` — the cheapest useful
anchor is **tiny2k** (4,370 NAND, 0.3526) and the best executable demo is **small9k** (10,890 NAND,
0.3902, 25.1 M = 37% of a block) or **fits29k** (27,527 NAND, 0.4190, 63.2 M = 92% of a block,
almost no headroom). That burn is the same user decision as `tp-2ea.8`. Quality work that is worth
more than size: train the differentiable DLGN on the m64 GPU (a different family, may beat the rule
list at equal gates) and/or let the model learn a *joint* argmax head.

## v0.1 sampling, the single-transaction ladder, and measured gas (added 2026-09-14 late)

**Primary information:** the deliverable is now a **ladder** rather than one size, and the binding
constraint turned out to be the **burn**, not the step. v0.1 adds 8 random input bits (nIn 200) and
samples inside the netlist, with the greedy path preserved exactly at random byte 0. Three verified
sizes: **netlist_v0_4k** (4,053 NAND, held-out top-1 0.3138), **netlist_v1_23k** (21,208 NAND,
0.3800) and **netlist_v1_29k** (27,259 NAND, 0.3890), alongside the greedy v0 kept as delivered
(37,334 NAND, 0.4259). Measured on a local CPU running the repo's official TapeOut bytecode,
calibrated against the chain at 0.27%: **9,292,259 gas for one step of the 4 k netlist** (the model
said 9,382,776). The same run shows that burning a netlist into storage costs **2,923 gas per NAND**,
so a single BSC transaction can hold a burn of at most **~23,400 NAND** (68,444,479 / 2,923), which
is *less* than the ~29,900 NAND a single step can hold. That is why v1 is 21 k and not 27 k NAND.

**Required context:** the sampling semantics, the verification, the local measurement setup and the
difflogic comparison are below. Every ladder row is bit-exact against its discrete reference over all
111,508 held-out contexts plus 300,000 random contexts, with byte 0 and with random bytes, and a
three-way check netlist = compiled DLGN = Python rule reference.

**Next judgement:** burn **netlist_v0_4k** first (11.8 M gas to burn, 9.3 M measured per step) — the
cheapest anchor that replaces the model with a chain measurement; then **netlist_v1_23k** if the demo
wants better text at 0.71 of a block per step. v0 (37 k) and v1_29k cannot be burned in one
transaction and stay as documented boundaries, not candidates.

### In-netlist sampling (why the first build looped)

Greedy decoding of a 4-gram backoff table repeats itself ("the the the"): that is a property of a
deterministic order-4 predictor, not a defect. v0.1 therefore takes 8 random bits per step:

* the **top five bits** (s = byte >> 3) select how deep into the backoff chain to look — s < 11 gives
  depth 4 (the full chain, i.e. the greedy argmax; byte 0 lands there), s < 19 gives 3, s < 26 gives
  2, otherwise 1. A shallower cut drops the specific long rules and exposes the smoother short ones;
* at **depth 1** the three low bits pick one of eight **unigram buckets** (equal-mass buckets of the
  training unigram, each represented by its median symbol), so the bottom of the chain samples rather
  than repeating an argmax;
* inside an entry the low three bits choose between that entry's **top-1 and top-2 symbol** according
  to its measured top-1 share (rounded to eighths), so a context that is 60% "t" and 15% "s" yields both.

Sampled text through the netlist:
`to man a a a to mard i her he should int in the shownd inther her he shall a and in he should in to my`.
Sampling roughly doubles the readout cost per entry, so at equal NAND a sampled model carries fewer
entries than the greedy one (2,157 DLGN gates for 140 entries vs 2,218 for that count without sampling).

### The ladder

| netlist | DLGN gates | NAND | nIn | held-out top-1 | step gas | step/block | burn gas | burn/block | one tx |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---|
| `netlist_v0_4k.json` | 2,157 | 4,053 | 200 | 0.3138 | 9.38 M (**9.29 M measured**) | 0.14 | 11.8 M (measured) | 0.17 | yes |
| `netlist_v1_23k.json` | 11,129 | 21,208 | 200 | 0.3800 | 48.74 M | 0.71 | 62.0 M | 0.91 | yes (tight) |
| `netlist_v1_29k.json` | 14,279 | 27,259 | 200 | 0.3890 | 62.62 M | 0.91 | 79.7 M | 1.16 | **no (burn)** |
| `netlist_v0.json` (greedy v0) | 19,624 | 37,334 | 192 | 0.4259 | 85.73 M | 1.23 | 109.1 M | 1.59 | **no** |

Baselines on the same held-out split: bigram 0.2621, trigram 0.3707. The cheapest mineable rung
already beats the bigram; v1_23k and above beat the trigram.

### Measured gas: a local CPU calibrated against the chain

`local_cpu_gas.py` deploys the repo's official TapeOut creation bytecode in eth-tester (the pattern
of `dlgn_ctrl/arena/test_arena.py`), tapeouts a netlist and reads the step receipt. Nothing is sent
to BSC. The calibration is what makes it useful: the largest burned circuit (cid 272, 632 NAND)
re-taped locally costs **1,478,320** gas per step against the chain's **1,482,309** exec gas — 0.27%.

| netlist | NAND | burn gas | step gas (receipt) | step gas (local estimateGas) | model |
|---|---:|---:|---:|---:|---:|
| cid 272 (chain reference) | 632 | 2,029,186 | 1,478,320 | 1,515,773 | chain 1,482,309 (0.27% off) |
| netlist_v0_4k | 4,053 | 11,846,423 | 9,292,259 | 9,442,590 | 9,382,776 (model 1.0% high) |

The two measured slopes: **2,293 gas per NAND per step** (the chain fit says 2,294 — 0.04% apart) and
**2,923 gas per NAND to burn** (418–458 gas per netlist byte). The 27 k and 37 k rows could not be
burned locally either — the PyEVM burn of a 190 kB netlist did not finish in half an hour — which is
the same constraint from the other side, and the reason the ladder stops at 23 k.

### difflogic vs the n-gram table at equal gate count (tp-2ea.15)

The original difflogic package does not build here (its C/CUDA extension needs a matching toolchain),
so its released pure-Python implementation was imported from the sdist (`implementation="python"`)
and trained on the same 192-bit window to 64-class next character with `GroupSum(64)` and
cross-entropy:

| family | gates | held-out top-1 |
|---|---:|---:|
| difflogic, 3 layers | 1,948 | 0.1490 |
| difflogic, 3 layers | 2,148 | 0.1490 |
| difflogic, 3 layers | 14,304 | 0.1538 |
| difflogic, 4 layers | 14,304 | 0.1599 |
| **n-gram decision table (this work)** | **2,157** | **0.3138** |
| n-gram decision table | 11,129 | 0.3800 |
| n-gram decision table | 14,279 | 0.3890 |

At equal gate count the n-gram table is **2.1–2.4× better**, and difflogic barely moves between 2 k
and 14 k gates on this task. The honest reading: a randomly wired LUT stack at 2–14 k gates is far
below where differentiable logic networks start to learn (that line of work uses 10^5–10^6 gates),
while an n-gram table gets the right inductive bias for free. difflogic 0.1.0 also only offers
`connections ∈ {random, unique}`, so learnable wiring is not available in this version.

### Reachability of the 37 k netlist (read-only, tp-2ea.14 groundwork)

`reachability_readonly.py` records three findings: (1) **eth_call is not capped by the block gas
limit** — a call with `gas = 85,734,891` (1.25 blocks) is answered normally, so an RPC cannot be used
to demonstrate a transaction cap; (2) an **unregistered circuit id reverts** (`no circuit: 0x08c379a0…`),
so the 37 k netlist is unreachable before gas is even considered (it has no cid); (3) the cap that
binds is on the *transaction*: the modelled step (85.7 M) and the measured burn slope (109 M) both
exceed the 68,444,479 block limit, so a 37 k netlist can neither be burned nor stepped in one
transaction. The raised-cap experiment therefore ran locally (eth-tester genesis gas limit raised to
4 G gas), which is where the 4 k measurement above comes from and the template for the v2 evidence.


## The model, and the two shapes that were rejected on measurements

The frozen interface asks for one `step()` = one character out of the last 32. Three shapes were
built and measured here:

| shape | held-out exact top-1 | why it stands or falls |
|---|---:|---|
| random-wired differentiable LUT stack (`train.py --model dlgn`) | ~0.15 (stalled) | saturates at random-feature quality; an OR readout saturates to 1 and kills the gradient, and the deep sparse wiring was too weak. Kept in the repo, not used for v0 |
| six independent per-bit rule lists (earlier `rule_model.py`) | 0.166 | the frozen 6-bit symbol code makes single bits weakly predictable (bit 0 is the parity of the symbol index), so per-bit accuracy 0.68 caps exact accuracy |
| **symbol-priority decision list with n-gram backoff (v0)** | **0.4259** | joint over the 64 symbols; longest context first; cheap in gates (a 2-input-LUT AND per rule plus a priority encoder) |

v0 is a **PPM-style backoff table compiled into logic**: every n-gram (order 1–4) with enough support
and precision becomes an entry "if the context ends with this pattern, the next character is this
symbol"; entries are consulted longest-first, the priority encoder turns the winning symbol into the
6 output bits, and an unmatched context falls back to the unigram symbol. Two bugs found by
measurement, both fixed: (a) ranking entries purely by value let the short orders be crowded out, so
an uncovered context fell straight to the unigram (the first 3,000-entry build generated nothing but
spaces) — fixed with per-order quotas; (b) filtering the bigram table by precision removed the
one-character backoff entirely — short orders now keep a relaxed floor (this alone took exact top-1
from 0.3964 to 0.4259 at the same gate count).

## Quality vs gas

Same model shape, five sizes; gas is the read-only model fit and "bit-exact" is verified against the
discrete reference (0 mismatches in every row):

| row | rules/entries | DLGN gates | NAND | held-out exact | predicted gas/step | fraction of one block | executable in one tx |
|---|---:|---:|---:|---:|---:|---:|---|
| tiny2k | 360 | 2,378 | 4,370 | 0.3526 | 10,107,762 | 0.15 | yes |
| small9k | 902 | 5,820 | 10,890 | 0.3902 | 25,066,168 | 0.37 | yes |
| fits29k | 2,300 | 14,555 | 27,527 | 0.4190 | 63,235,339 | 0.92 | yes |
| **v0** | 3,068 | 19,624 | 37,334 | **0.4259** | 85,734,891 | 1.25 | **no** |
| big40k | 5,724 | 36,146 | 69,113 | 0.4569 | 158,643,354 | 2.32 | no |

Baselines on the same held-out split: bigram 0.2621, trigram 0.3707. So the spec's comfort size
(tiny2k, 4,370 NAND ≈ 4,300) is *below* trigram, small9k and above beat the trigram, and v0 beats it
by 5.5 points but needs 1.25 blocks. NAND per DLGN gate is 1.90 in every row, so the curve can be
extended by rule count alone.

## Verification (what "bit-exact" means here)

1. **All held-out contexts**: 111,508 windows, netlist vs the discrete DLGN reference, 0 mismatches.
2. **1,000,000 random contexts** (half real text slices, half uniform random symbol windows), 0
   mismatches — the spec's ≥10⁶ requirement.
3. **Generated text**: three 200-character greedy samples produced through the *netlist* are
   character-identical to the reference's (`verify.json → samples[].identical`).
4. The netlist is validated against the ISA rules (`golden.Netlist.validate`) and has **0 latches**,
   so one step is one combinational evaluation and state never enters the picture.

Honest boundaries: the verification is equivalence between the *discrete* model and the netlist
(compile + hashing + output ordering), not a proof about the model's quality; the corpus is a single
1 MB text; the alphabet folds uppercase and every unknown character to the space symbol; and greedy
decoding makes generation loop ("the the the …"), which is a property of a deterministic order-4
backoff predictor, not a bug.

## Gas: what is measured, what is modelled, and the extrapolation risk

* Measured on chain: nothing. `estimateGas` can only be evaluated for a circuit **registered** on
  the CPU, and no netlist here is burned — that is the open user decision `tp-2ea.8`.
* Modelled: `gas = 24,587 + 2,294.2·NAND + 2,636.0·LATCH + 285.8·nIn + 416.3·nOut`, a fit on 284
  burned circuits (leave-one-out 1.96%, extrapolation error 0.60% when fitting ≤250 NAND and
  predicting the larger burned ones, data-pattern band 1.3%).
* **Extrapolation risk, stated plainly**: the largest burned circuit is 632 NAND, so every row in
  the table above is a 7×–110× extrapolation. The per-NAND term is stable across the calibrated
  range, but nothing here proves it stays linear at 37,000 gates; the number could be wrong in
  either direction. The *verdict* that matters is robust only in the sense that the block limit is
  hard: a netlist whose modelled cost is 1.25 blocks is at best marginal.
* Calldata cost is included in the design (the input is calldata, 16 gas/byte); the netlist itself
  is 261,338 bytes for v0, so a `tapeout` burn of that size is a large transaction by itself.

## Artifacts (all in `circuits/_scratch/tapeout_asic/onestep_lm/`)

`SPEC.md` (frozen interface), `alphabet.json`, `data/tinyshakespeare.txt`, `train.py` (corpus,
windows, baselines, and the differentiable-DLGN trainer), `rule_model.py` (v0: selection, reference
prediction, DLGN emission), `model_v0.json` + `model_v0_rules.json` + `model_v0_report.json`,
`samples_v0.txt`, `compile_lm.py` (DLGN→NAND, verification, pricing), `netlist_v0.json`,
`verify.json`, `gas.json`, `burn_calldata/netlist_v0.tapeout.txt`, `curve.py` + `curve.json`
(the table above) and the per-row `curve_*.json` / `net_*.json` / `verify_net_*.json` /
`gas_net_*.json`.

Reproduce: `python3 rule_model.py --max-entries 3067 --quota 64,900,1100,1400 --min-support 10
--min-prec 0.28 --out model_v0` then `python3 compile_lm.py --random-contexts 1000000 --out
netlist_v0`, then `python3 curve.py` for the whole table.

## abc re-synthesis and the demo page (added 2026-09-14, round 42)

**Primary information:** re-synthesising the compiled netlists through yosys/abc removes 52-57% of the
NAND with 0 bit differences, so the whole ladder now fits one BSC transaction: 4,053->1,935, 21,208->9,043,
22,524->10,962, 27,259->11,642, 37,334->17,905, plus two new best models - greedy 3,900 rules 19,567 NAND
(held-out top-1 0.4338) and sampled 1,700 rules 20,073 NAND (0.4105). Recommended burns: g44 (quality),
s41 (varied text), v0_4k_resyn (1,935 NAND, cheapest anchor, step 9,292,259 gas measured).

**Required context:** resynth_lm.py is the pass - it emits the official-encoding netlist as Verilog, runs
abc -g NAND twice and re-encodes; verification is unchanged in strength (all 111,508 held-out contexts
twice, byte 0 and random bytes, plus 50,000 random inputs, 0 mismatches each). The demo page
onestep_lm/index.html is generated by build_demo.py, embeds the six re-synthesised netlists and evaluates
them in the browser; its JS self-checks against the Python netlists at load (48/48 vectors PASS), and the
chat-style 续写 box shows the gas per reply.

**Next judgement:** burn v0_4k_resyn first as the cheap anchor, then g44 or s41 (both under 0.9 of a block
to burn and under 0.7 to step); the burn decision stays tp-2ea.8.

### Measured receipts for the re-synthesised rungs (round 43-44)

| netlist | NAND | burn gas (receipt) | step gas (receipt) |
|---|---:|---:|---:|
| netlist_resyn_g44_resyn.json | 19,567 | 56,976,135 (0.832 block) | 45,738,885 (0.668) |
| netlist_resyn_s41_resyn.json | 20,073 | 58,407,619 (0.853) | 46,892,415 (0.685) |
| netlist_resyn_v0_4k_resyn.json | 1,935 | 5,722,670 (0.084) | 4,458,014 (0.065) |

Source: measured_rungs.json (local PyEVM CPU, official bytecode, raised gas limit; BSC untouched).
The kit lm_burn_kit.py/lm_burn_kit.json carries these numbers; the remaining rungs use the
measured slopes (2,293 gas/NAND step, 2,923 gas/NAND burn).
