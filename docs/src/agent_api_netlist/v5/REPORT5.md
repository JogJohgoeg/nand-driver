# Agents-API session controller v5 — final feature set

Built 2026-09-11 from `spec5.py` by `build5.py`. v3 and v4 were kept local; v5 is the version to burn.

## Interface

- **16 observations**: model_done model_tool tool_type1 tool_type0 tool_known tool_batch tool_ok ctx_high budget_low
  sub_req sub_done sub_fail secret_req vault_ok **judge1 judge0**
- **23 state bits**: phase(2) err(2) subcnt(3) subfail(2) turns(8) compactcnt(2) waitcnt(2) searchcnt(2)
- **17 actions**: call_model run_fn run_mcp run_builtin tool_search tool_parallel compact spawn_sub wait_sub vault_grant
  finish **pay1 pay0** abort code2 code1 code0

Graded pay: judge 0 fail / 1 partial / 2 full (3 reserved); pay bits equal the judge bits when finish fires and are 0 otherwise.
Single budget: every call_model **and every compact** consumes a turn (255 cap).
Fuses (one-way): DONE absorbing; 3 tool retries; 7 subagents; 3 subagent failures (wait timeout after 3 waits = failure);
3 consecutive compacts; 3 consecutive tool_search; budget_low.
Abort codes: 1 budget_low · 2 turns cap · 3 tool retries · 4 subagent failures · 5 vault denied · 6 compaction ineffective · 7 tool_search cap.

## Netlist

| | NAND | depth |
|---|---|---|
| A: structural-hash lowering of the spec | 517 | 62 |
| B: yosys + ABC (best of 15: `map`) | 289 | 36 |
| wrapped for chain (B + 6 output clones) | **295** + **23 LATCH**, 2157 bytes | |

`tapeout(nl, 16, 17)` → predicted circuitId **284** (preflight passed; fee-aware for the Open Beta switch on 2026-09-12 08:00 UTC).

## Verification (space 2^39 = 16 obs + 23 state)

1. 13 scenario tests on the Python spec (every abort code; wait timeout; three timeouts abort; full / partial / no pay; compact counts as a turn; DONE absorbs).
2. 20 000 random rows: A and B match the spec; 20 000 random `Circuit.step` calls: 0 mismatches.
3. kissat miter A vs B: **UNSAT**; wrapped vs A: **UNSAT**.
4. **16 safety properties proved by SAT** on the mapped netlist (violation UNSAT ⇒ holds for every state and input):
   done_absorbing · done_only_via_abort_or_finish · abort_or_finish_leads_to_done · turns_monotone ·
   abort_finish_call_exclusive · pay_implies_finish_and_judge · pay_equals_judge_on_finish · no_pay_without_finish ·
   run_exclusive_and_enters_tool · code_iff_abort · no_compact_past_cap · no_search_past_cap · no_retry_past_cap ·
   no_spawn_past_cap · wait_timeout_fires · abort_excludes_progress_actions.
5. **Independent implementation cross-check**: `indep.v` written by Grok 4.6 (Cursor) from the prose spec in
   `CROSSCHECK_TASK.md` only, mapped by yosys and mitered against the reference lowering by `crosscheck.py` — result recorded below.

Cross-check result: **UNSAT** (Grok's `indep.v`, 302 NAND after mapping, agrees with the reference on all 2^39 rows). Grok needed three
rounds: round 1 emitted `tool_search` at the search cap instead of abort code 7; round 2 mis-handled the subagent counter when
`sub_req`, `sub_done` and `sub_fail` arrive in the same tick (should hold). Both were implementation slips against the prose,
found by kissat as concrete rows; the Python reference needed no change. Verified again by hand after the agent exited.

Files: `spec5.py`, `build5.py`, `agent_controller_v5.json`, `burn_agent_v5.py`, `drive.py`, `crosscheck.py`, `CROSSCHECK_TASK.md`, `_work/`.
