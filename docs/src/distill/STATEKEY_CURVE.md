# State vs Key Width, and Tool-Call Decision Points -- closed measurements

**Owner:** pi Code Mode (agent A, session 3) · **Status:** measurements 1, 2 and 2b closed; architecture
decision recorded. Scripts/logs: `37_*.py … 41_statecurve.py`, `state37.log … state41.log` in this dir.
H's mechanism costs (register 414 NAND @ k=64; tiny-table entry 14.606 NAND; main-table entry 11.364
NAND from `build/cost47`) are the currency; all arms are matched on it.

---

## 1. Measurement 1 -- state width k, matched budget, as a curve (41_statecurve.py)

Fixed new-gate budget 414 NAND (= one k=64 register; also 828 = one k=128 register). For every k the
same gates are spent either on a k-bit self-updated register plus as many fallback-table entries as
fit (keyed by that state), or on extra entries in the main cascade. Baseline: 6-level hashed cascade,
K=3700/level, 47-bit addresses, top-8192 labels -> **0.20734** agreement (published ref 0.21365; the
gap is the top-8192 vs top-16384 label head). Missed positions: 23.91 % of test; global-guess on
those = 0.02171.

Budget 414 NAND (register 6.472 NAND/bit; fallback entry 14.606 NAND; main-table entry 11.364 NAND):

| k | register | fallback entries that fit | cover | gain on missed | **deployed gain** | agree |
|---|---|---|---|---|---|---|
| 4 (cheap4) | 26 | 26 | 1.000 | 0.06373 | **+0.01524** | **0.22258** |
| 8 (presence-8) | 52 | 24 | 0.814 | 0.05139 | +0.01229 | 0.21963 |
| 16 | 104 | 21 | 0.464 | 0.03221 | +0.00770 | 0.21504 |
| 32 | 207 | 14 | 0.316 | 0.02251 | +0.00538 | 0.21272 |
| 64 | 414 | **0** | 0 | 0 | **0** | 0.20734 |
| 128 | 828 | — | — | — | infeasible | 0.20734 |
| **entries-only control** | 0 | 36 in main | — | — | **+0.0003** | 0.20765 |

Budget 828 reproduces the shape: k=4 +0.01524, k=8 +0.01535, then 0.0094 / 0.0069 / 0.0056 / 0.

**Three findings.**

1. **State beats entries by 25–50× at every k** (+0.015 vs +0.0003 at matched budget). The
   sequential axis is real and measured, not argued. 36 extra entries in a 3700-entry table are
   worth +0.0003 -- entries are past their knee at this budget.
2. **Value is monotonically DECREASING in k, and crosses zero at k=64.** This falsifies my own prior
   (I expected presence-64/128 to pay). The mechanism is coverage, not information: a wide presence
   state is a high-entropy address (570k unique keys at k=64, 240k at k=32, 10.6k at k=16, **4** at
   k=4), so a handful of bought entries covers almost nothing (0.30 at k=64 with 28 entries) while
   the 4-bit coarse state has 4 populated keys -> 100 % coverage with 4 entries. The useful state is
   a **low-entropy summary**, not a wide one.
3. **State in the cascade *key* is negative at every k** (37_statekey.py: presence-16 in key
   0.13495 vs plain 0.20734 at K=3700; presence-128 0.14602; fixed-hash control ≈ global guess).
   Folding state bits into the 38 entry sub-circuits' addresses partitions an already-sparse key
   space and destroys coverage. So H's default wiring (state as extra input bits on all 38 subs) is
   the wrong place for it -- see the decision below.

**cheap4** (the k=4 winner) = 2 bits prev-token frequency rank | 1 bit sentence-initial | 1 bit
" the" within the last 8 tokens. cheap4 with only **4** entries gets +0.01524; presence-16 needs
~3,700 entries to reach +0.0180 -- a ~1000× entry-efficiency gap (37e_smallB.py). The fixed-hash
control gains +0.0002, i.e. the gain is state-ness, not raw context width.

## 2. Measurement 2 -- tool-call decision points (38_toolcall.py, 39_legaltable.py)

Bilingual stream: wiki p=0.02 with ` search("<8 tokens>", <limit 01..20>, <mode>)`; 328,079 calls,
656,158 decision points = **2.0 per call** (one limit digit + one mode token); legal alphabet = 23
tokens.

| position class | n | accuracy |
|---|---|---|
| forced / grammar-literal | 2,296,553 | **0.71505** |
| decision (choice point) | 656,158 | 0.19176 |
| free text | 20.6 M | 0.13609 |

- **Grammar legality at decision points = 1.000** (the cascade never emits an illegal token -- the
  earlier 0.0286 figure was a denominator bug: mean over the whole stream, not over decision
  positions; corrected in 39b/40). The grammar skeleton is free.
- **0.19176 = exactly the information ceiling.** Per-position-type chance is ½·⅓ + ½·(1/20) =
  0.19167: my synthetic choices (limit uniform 1..20, mode uniform over 3, independent of the query)
  are unlearnable by construction, and the measured accuracy is the marginal, not skill. Legal-
  restricted tables all score *below* the cascade at decision points (39: W=3 B=4096 -> 0.18569 vs
  0.19176), confirming no table beats an uninformative marginal.
- Forced literals are **5.3× more accurate than free text** (0.715 vs 0.136): tool-call structure is
  the cheap, learnable part.

## 3. Measurement 2b -- when the choice IS content-informed (40_learnchoice.py, 40b_split.py)

Same stream, but the limit index and mode index are deterministic functions of the **first query
token** (≈8–10 tokens before the choice), so the ceiling is 1.0 by construction and the question is
which context mechanism reaches it.

| decision | evidence distance | chance | cascade acc | oracle |
|---|---|---|---|---|
| mode token | 1–2 tokens back (the emitted limit token is inside the key window) | 0.3333 | **0.5131** | 1.0 |
| limit digit | 8–10 tokens back (first query token -- outside every key window at budget) | 0.0500 | **0.0844** | 1.0 |
| overall decision | — | 0.19167 | 0.29876 | 1.0 |

Per-key-width source of the decision prediction: W=6 0.539, W=5 0.508, W=4 0.460, W=3 0.089,
W=2 0.079. **Learnability is set entirely by the distance from the deciding evidence to the
decision point.** Evidence inside the k-gram window (mode) is learned at 1.5× chance by shallow
keys; evidence 8–10 tokens back (limit) is at 1.7× chance and no wider key at this budget reaches
it -- the only mechanism that can is a self-updated state carrying the caller-intent class forward.

## 4. Architecture decision (the matched-budget answer to "state vs key width")

- **Spend on neither a wider key nor a wide state.** Deploy **4–8 bits of coarse self-updated state
  as the address of a 4–26-entry fallback/decision table**, on the ~24 % of positions the cascade
  misses; the bulk of the budget stays as shallow 47-bit hashed keys. Expected accuracy
  **≈ 0.2226** vs 0.20734 re-implementation and 0.21365 published (+0.009; inside the imitative
  class, the ~0.40 ceiling is untouched).
- Cost: register 26–52 NAND + table ≈ 4–26 entries ≈ **< 350 NAND ≈ 0.2 % of the 151,402 NAND
  budget**, for +0.015 agreement. At K=3700 that is ~30× more NAND-efficient than buying entries
  (+0.005 for the remaining ~97k NAND).
- **Wiring for H:** ONE state-update call per token `(st,_) = step(state_cid, st, ctx)` holding the
  4–8 latches. The 38 entry sub-circuits stay **combinational and state-free** (state in their
  addresses is measured-negative); the state feeds only the small fallback/decision table. This
  avoids the trap H flagged (replicating k latches into 38 subs -> 38k latches) and keeps the
  crossing cheap: state as input to ONE small table, not 38.
- **Tool-call grammar implication:** 2 real choices per call at 1.5–1.7× chance means a call is
  correct end-to-end only ~(0.7)^7 × 0.30 ≈ 1 % of the time. Two design levers, in order of value:
  (a) make choices content-informed (mode ← query content, limit ← query length) so they enter the
  measurable regime -- 2b shows the headroom is 1.0; (b) reduce the *number* of decision points
  (fixed limit + fixed mode = a deterministic call; the only remaining free choices are query
  tokens at 0.136).

## 5. Falsified priors (my own)

- wide presence state (k>=16) as a key or fallback address -- dominated at matched budget;
- banked cascade at matched total entries (37b: 0.10906 vs 0.20734);
- k-means fallback gain +0.011 -- artifact of a degenerate 1-cluster + empty-bank->pred=0 path;
- legal-restricted decision tables beating the cascade -- all negative;
- modal_in_legal = 0.0286 -- denominator bug; true value 1.0;
- parametric fork (MLP over embeddings) -- needs ~4000× the honest gate budget, rejected.

## 6. Open

- cost47: hash47 (s0/s16/s128) and stup16/32/64/128 modules still to land for the K_fit =
  148,000/(per_entry + amortised hash overhead) readout and an independent check of H's 414 NAND.
- Emit + synthesize the deployed design (cascade + 4–26-entry fallback table + 4–8-bit state
  register) as a real netlist for the pipeline.
- If a second state is worth it: the tool-call limit decision wants a ~5-bit caller-intent class
  carried 8–10 tokens (40b: oracle 1.0, measured 0.084) -- a separate, small, decision-only
  register, not a wider presence state.


---

## 7. Honest-cost correction -- the deployed register is 148 NAND, not 26 (43_cheaphw.py, cost_state.py)

41 priced the k=4 register at 6.472 NAND/bit = 26 NAND. That is H's latch+XOR-mixer figure and it
UNDERSTATES the real cost, because the cheap4 address needs rank[prev token] = set membership in the
top-512 frequent tokens, which is ~10k NAND of comparators. The register that is actually deployable
uses 5 comparators and two saturating counters instead:

- state = 8 bits {since_delim[2:0], since_the[2:0], is_the_prev, is_del_prev},
- next-state: both counters reset on their token and saturate at 7 (so "no delimiter in the last 8"
  and "the in the last 8" are just counter comparisons),
- **synthesized (yosys, mapped, DCE'd): 148 NAND** for the whole update + 4-bit address; a 2-bit
  comparator-only variant with no counters is 92 NAND, so the counters cost 56.

The gain measured with EXACTLY these counter semantics (so the number is the one the circuit
realizes), on the same cascade-missed set:

| entries | table NAND | cover | acc on missed | gain on missed | **deployed gain** | **agree** |
|---|---|---|---|---|---|---|
| 4 | 58 | 0.961 | 0.10744 | 0.08573 | **+0.02050** | **0.22784** |
| 16 | 234 | 1.000 | 0.11321 | 0.09150 | **+0.02188** | **0.22922** |

The hardware-honest state is **better AND cheaper** than the rank-based cheap4 (+0.0205 vs +0.0152,
and 148 NAND instead of ~10k). Only 8 of the 16 keys are ever populated: the table is essentially
"on an unpredictable position, predict the structural token the document state implies" --
key 4 (sentence-initial, prev not delim/the) -> label 33, 1.74M train cases; key 12 -> 304; key 2 -> 220.

**DEPLOYED TOTAL: 206 NAND (B=4) to 382 NAND (B=16) = 0.14-0.25 % of the 151,402 budget, for
+0.0205 to +0.0219 agreement** = 0.2278-0.2292 vs 0.20734 re-implementation / 0.21365 published.
At matched budget this beats entries (+0.0003 for 36 entries) by ~60x. The corrected low end of the
k-curve: the honest register at small k is dominated by state-computation logic (~18.5 NAND/bit
including comparators/counters), not latches, so fewer entries fit than 41 assumed -- which makes the
state arm's margin over entries narrower in absolute entries but does not change the ordering, and
the measured deployed gain only improves.

**K_fit readout** (cost_hash.py): with the hash module amortised over K entries,
K_fit = 148,000 / (per_entry + hash/K). Numbers in build/cost47/hash_cost_report.json.

---

## 8. BUDGET CORRECTION -- the honest numbers (44_budget.py)

Sections 3-7 used K=3,700/level as the cascade base. That base costs
6 x 3,700 x 11.364 = **252,620 NAND = 1.67x the 148,235-NAND monolithic budget** and 4.7x the
54,147 NAND H's container actually uses. So 0.20734 / 0.22784 were OVER-budget numbers. The
honest budget-matched table (same measurement window, same 5-block test split, cheap4b state,
fallback table fitted on train-missed, evaluated on test-missed):

| K/level | cascade NAND | miss frac | OVERALL base | +B4 fallback | OVERALL deployed B4 | deployed B16 | total NAND |
|---|---|---|---|---|---|---|---|
| 600 | 52,921 | 0.424 | **0.16172** | +0.0863 on missed = +0.0365 overall | **0.19827** | 0.20102 | 53,127-53,302 |
| 800 | 70,448 | 0.397 | 0.16761 | +0.0865 = +0.0343 | 0.20193 | 0.20447 | 70,654-70,829 |
| 1000 | 87,975 | 0.375 | 0.17346 | +0.0867 = +0.0325 | 0.20593 | 0.20831 | 88,181-88,357 |
| 3700 | 252,620 | 0.239 | 0.20734 | +0.0857 = +0.0205 | 0.22784 | 0.22922 | 252,826 (OVER BUDGET) |

Three honest conclusions:

1. **The state axis's value is ANTI-correlated with the cascade size.** The gain on missed positions is
   +0.086 at EVERY K (nearly constant), so the deployed gain is miss_frac x 0.086: +0.0365 at K=600,
   +0.0205 at K=3,700. The smaller the table, the more the state is worth. At H's actual container cost
   (54,147 NAND, i.e. K~600), the deployed design is **0.1983 (B4) / 0.2010 (B16) vs 0.1617 base**, for
   206-382 extra NAND = 0.4% of gates -- the largest single honest lever found on this axis, recovering
   44% of the distance from the K=600 base to the 0.21365 published reference.
2. **State beats entries by ~300x at matched budget.** The same 206 NAND buys 14 entries, worth +0.0001
   (entries-only control: +36 entries = +0.0003, +72 = +0.00059). The trade is unambiguous and it is the
   mechanism the k-curve already implied: entries are coverage-bound and marginal, the state addresses
   the missed 24-42% directly.
3. **At the full 151,402-NAND budget the design reaches ~0.217** (K~2,000/level, per-entry ~12.5, plus
   the 16-entry fallback): parity with the 0.21365 reference, not a breakthrough. The honest ceiling
   reading is unchanged -- the table paradigm is information-bound around 0.21-0.23 and the ~0.40
   imitation ceiling is untouched; every gain reported here is inside the imitative class.

Reference constants updated: OVERALL base at H's container cost = 0.16172 (K=600); deployed = 0.19827;
per-entry NAND interpolated flat at 14.606 below K=1,000 (measured only at 1k/3.7k/10k/22k, so the K=600
and K=800 cascade-NAND figures are slight underestimates).

### 8b. hash47 was broken (found and fixed)

cost47.py's emit_hash carried `prev = "r0"` while the format string prepended its own `r`, emitting
`rr0`-`rr5` -- undefined wires, so yosys collapsed the hash to 0 gates and extract_nand_netlist died with
KeyError 104. This is why cost47 never produced a report. Fixed (numeric prev) and re-synthesized:

| module | NAND | note |
|---|---|---|
| hash47_s0 | 339 | 6 tokens x 17 bits -> 47-bit address |
| hash47_s16 | 443 | +16 state bits mixed into the address |
| hash47_s128 | 1,145 | +128 state bits |

State-in-key costs ~7.2 NAND/bit on top of the 339-token hash -- consistent with H's 6.472/bit latch
figure. K_fit = 148,000 / (per_entry + hash/K): 9,903 (K=1k) rising to 17,291 (K=22k) with 0 state bits,
9,396-17,217 with 128. The budget is NOT the binding constraint on the cascade; the marginal value of
entries is.

### 8c. Ask of H (round 16)

- confirm the container's actual entries/level (my NAND arithmetic says K~600 at 54,147 NAND; if H's
  per-entry differs at that K, the base accuracy 0.16172 moves and I will re-fit the fallback table),
- the state-update call is ONE per token, 148 NAND combinational + 8 latches held in the lane; state
  feeds ONLY the 4-16-entry fallback table; the 38 entry sub-circuits stay combinational (in-key state
  measured negative at every k),
- k=64/k=128 registers remain dominated: even at 7.2 NAND/bit the wide state spends 400-1,100 NAND on
  an address whose entries cover nothing (570k unique keys at k=64 vs 4 at k=4).
