# M3 — INT primitive selection (doc only)

**Status:** topic selection only. Do **not** start SAT hunting or tapeout.
**Explicitly not competing with** sticky src97 (6-bit popcount) hunt / herdr97 farm.

Goal: one narrow INT building block on the LLM-inference datapath that can be
**ham=0 verified** with the existing `official_vectors` + `farm.gpu_audit.gold_fn`
stack and exercised via `circuits/farm/accept_net.py` (never tapes).

Inventory source: `circuits/farm/slots.json` + `gold_fn` name patterns in
`circuits/farm/gpu_audit.py` (adder / popcount / mul / compare / MAX-MIN).

---

## Primary candidate — **4-bit greater-than** (src **31**)

| Field | Choice |
|-------|--------|
| Slot | srcId **31**, name `4 位大于判定` |
| I/O | **nIn=8** (A[3:0] \|\| B[3:0]), **nOut=1** (`A > B`) |
| Gold | `gold_fn`: `1 if A > B else 0` (already wired for `N 位大于判定`) |
| TT | Full **2^8 = 256** vectors — cheap; official pairs also available |
| Inventory bar | chain **g=18, d=7, C=6174** → success target **ham=0 net with g≤53** (comfortable; beat inventory if C improves, else PASS_FUNC via `--no-chain-cmp`) |
| Why LLM INT | Attention / mask / Top-k style compares, ReLU-threshold gates, and score clipping are all **unsigned/signed magnitude compares**. A verified 4b GT is a reusable leaf for wider cascaded compare and for INT8→nibble datapath experiments without touching the sticky popcount-6 farm. |
| Verify | `python3 circuits/farm/accept_net.py <net.json> --src 31 [--no-chain-cmp]` → expect `official_ok`, `gold-ok`, `last_outs_ok`, ham=0 |
| Family | Maps to existing **compare** problem family (siblings: src147=2b GT, src149=3b GT) |

**Out of scope for this pick:** CSA/full-adder rewrite, src97, sticky farm cores.

---

## Backup — **2-bit adder (no cin)** (src **37**)

| Field | Choice |
|-------|--------|
| Slot | srcId **37**, name `2 位加法器（无 cin）` |
| I/O | **nIn=4** (A[1:0] \|\| B[1:0]), **nOut=3** (sum + carry) |
| Gold | `gold_fn` adder pattern `N 位加法器（无 cin）` → `A+B` packed to 3 bits |
| TT | Full **16** rows |
| Inventory bar | chain **g=16, d=5, C=2000** → ham=0 under **g≤53** is the easy bar; real win is beating C |
| Why LLM INT | Matmul / MAC micro-tile: tiny adders are the accumulation spine under INT nibble products (pair with 2×2 mul src59 later). Clear CSA-family growth path (→3b/4b add) without overlapping herdr97. |
| Verify | `accept_net.py <net.json> --src 37 [--no-chain-cmp]` |
| When to switch | Use backup if compare nets stall on last_outs / wire-base quirks, or if M3 wants an explicit **adder/CSA** narrative for matmul over attention-mask compare. |

---

## Rejected / deferred (for clarity)

- **src97 / 6b popcount** — sticky hunt; M3 must not compete.
- **src164 3b popcount** — tempting (tiny TT) but same family as 97; keep as later popcount ladder only after M3 compare/add lands.
- **src59 2×2 mul** — strong matmul leaf, but slightly denser than needed for first ham=0 LLM-INT milestone; revisit after primary.

## Success definition (M3)

1. Produce a **ham=0** net for the primary (src31) under inventory **g≤53** (ideally last_outs).
2. Offline proof only: `accept_net` → rc 0 with `--no-chain-cmp` (PASS_FUNC) or with live/override `chain_c` (PASS).
3. No auto tapeout, no NAND burn, no sticky farm cores, no `accept.py` default edits.
