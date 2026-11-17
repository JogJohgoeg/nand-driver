# Agents-API session controller v3 — the fuses

v3 keeps v2's interface (15 actions) and adds the one-way fuses v2 lacked. Built 2026-09-11 from `spec3.py`
by `build3.py`; local only until the user burns it.

## What changed vs v2 (#283)

| fuse | v2 | v3 |
|---|---|---|
| turns cap | 3 bits, abort at 7 | 8 bits, abort at 255 |
| tool retries | 1 (err latch) | 3 (2-bit err), abort on the 4th failure |
| concurrent subagents | 3 (2-bit) | 7 (3-bit) |
| subagent failure | none (only sub_done) | new input `sub_fail`; 2-bit counter; the 3rd failure aborts; sub_fail also releases the slot |
| ineffective compaction | livelock until external budget_low | 2-bit consecutive-compact counter; a 4th ctx_high after 3 compacts aborts; counter resets when ctx_high drops |
| DONE | absorbing | absorbing |

Interface: 17 observations (v2's 16 + `sub_fail` at index 11), 21 state bits, 15 actions (unchanged).

## Netlist

| | NAND | depth |
|---|---|---|
| A: structural-hash lowering of the spec (no optimisation) | 479 | 62 |
| B: yosys `synth` + ABC (best of 15 scripts: `deep`) | 262 | 36 |
| wrapped (B + 5 output clones) | **267** + **21 LATCH**, 1953 bytes | |

`tapeout(nl, 17, 15)` → predicted circuitId **284** on CPU 0x6Fb4…5B38 (preflight passed; balances 8367 NAND / 194 LATCH).

## Verification (2^38 rows: 17 obs + 21 state — too big to enumerate, so SAT)

1. Seven scenario tests on the Python spec: 3 retries then abort; 3 subagent failures abort; 3 compacts then abort;
   compact counter resets when ctx drops; 255 turns then abort; 7 subagents then the 8th waits; DONE absorbs.
2. 20 000 random rows: A and B both match the spec.
3. **kissat miter A vs B: UNSAT** — the two independently lowered netlists are equivalent on every one of the 2^38 rows.
4. **kissat miter wrapped-vs-A: UNSAT** — the final on-chain byte encoding (latches as inputs, D-wires as outputs) is equivalent too.
5. 20 000 random `Circuit.step` calls vs `spec3.step_scalar`: 0 mismatches.

Files: `spec3.py`, `build3.py`, `agent_controller_v3.json`, `burn_agent_v3.py`, `_work/` (Verilog, ABC scripts, CNFs).
