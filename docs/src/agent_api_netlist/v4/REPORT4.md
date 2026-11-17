# Agents-API session controller v4 — complete fuses, reason codes, proved safety

Built 2026-09-11 from `spec4.py` by `build4.py`. v3 was kept local (not burned); v4 supersedes it.

## Interface

- **15 observations**: model_done model_tool tool_type1 tool_type0 tool_known tool_batch tool_ok ctx_high budget_low
  sub_req sub_done **sub_fail** secret_req vault_ok judge_ok (env bits removed: session environment is off-chain config)
- **23 state bits**: phase(2) err(2) subcnt(3) subfail(2) turns(8) compactcnt(2) waitcnt(2) searchcnt(2)
- **16 actions**: v2's 13 (env_sel dropped) + **abort reason code** (3 bits)

Abort codes: 1 budget_low · 2 turns cap (255) · 3 tool retries exhausted (4th failure) · 4 subagent failures (3rd, incl. wait
timeouts) · 5 vault denied · 6 compaction ineffective (4th ctx_high after 3 compacts) · 7 tool_search cap (4th consecutive).

New vs v3: subagent **wait timeout** (3 wait_sub ticks with no report count as one subagent failure and release the slot),
**tool_search cap**, **reason codes**, env bits removed.

## Netlist

| | NAND | depth |
|---|---|---|
| A: structural-hash lowering of the spec | 512 | 60 |
| B: yosys + ABC (best of 15: `c2rs`) | 285 | 34 |
| wrapped for chain (B + 6 output clones) | **291** + **23 LATCH**, 2129 bytes | |

`tapeout(nl, 15, 16)` → predicted circuitId **284** (preflight passed; balances 8367 NAND / 194 LATCH).

## Verification (space 2^38 = 15 obs + 23 state)

1. 10 scenario tests on the Python spec (every abort code reached; wait timeout releases the slot and three timeouts abort; DONE absorbs).
2. 20 000 random rows: A and B match the spec.
3. kissat miter **A vs B: UNSAT** (equivalent on all 2^38 rows); miter **wrapped vs A: UNSAT**.
4. 20 000 random `Circuit.step` vs `spec4.step_scalar`: 0 mismatches.
5. **14 safety properties proved by SAT on the mapped netlist** (each stated as a violation, kissat UNSAT = holds for every state and input, reachable or not):

| property | statement |
|---|---|
| done_absorbing | in DONE every output is 0 and the next phase is DONE |
| done_only_via_abort_or_finish | DONE is never entered without abort or finish in that tick |
| abort_or_finish_leads_to_done | abort or finish always lands in DONE |
| turns_monotone | next turns ∈ {turns, turns+1} (saturating) |
| abort_finish_call_exclusive | no two of abort / finish / call_model in one tick |
| pay_implies_finish_and_judge | pay ⇒ finish ∧ judge_ok |
| run_exclusive_and_enters_tool | at most one run_*; any run_* moves to TOOL |
| code_iff_abort | reason code ≠ 0 ⇔ abort |
| no_compact_past_cap / no_search_past_cap / no_retry_past_cap / no_spawn_past_cap | each counter's cap is respected |
| wait_timeout_fires | in SUB with waitcnt=3 and nothing reported, the circuit never waits again |
| abort_excludes_progress_actions | abort never co-fires with compact, spawn, search, vault_grant, run_*, wait |

Files: `spec4.py`, `build4.py`, `agent_controller_v4.json`, `burn_agent_v4.py`, `drive.py` (harness, `--sub-fail-rate` simulates
failing subagents), `_work/` (Verilog, ABC scripts, miter and property CNFs).
