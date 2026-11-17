# drive283 — other agents as clerks of circuit #283

Harness: `drive283.py`. Every tick calls on-chain `step(283, state, inputs)` (BSC view call) and asserts it equals
the local evaluation of the same 1104 bytes fetched from `netlist(283)`. The clerk (any model) only proposes a move
per turn; the circuit's 15 action bits are what the harness executes. Logs: `drive283_<clerk>_<ts>.jsonl`
(one line per tick with state/inputs/outputs hex, then summary + transcript).

Task: "Compute the sum of all prime numbers below 1000. Use the python tool, then reply with just the number."
Judge: answer == 76127. Environment: partner sandbox (env=10).

| clerk | model | ticks | path | verdict | notes |
|---|---|---|---|---|---|
| stub | scripted | 6 | call → tool_search → run_fn → call → spawn_sub → finish+pay | PAID | self-test |
| cursor | Cursor Grok 4.6 High Fast | 5 | call → tool_search → run_fn → call → finish+pay | PAID | 2 model calls |
| cursor | Composer 2.5 | 5 | same as Grok | PAID | first attempt hit a harness bug (exec scope) → circuit gave one retry then **abort** as specified; fixed tool, rerun paid |
| cursor | GPT-5.6 Sol | 2 | call → finish | FINISHED_UNPAID | Cursor monthly quota exhausted → empty reply; harness now records "no move" instead |
| cursor | Claude Opus 5 (via Cursor) | 2 | call → finish | FINISHED_UNPAID | same quota issue |
| openai | GLM-5.3 (zhipu, OpenAI-compatible endpoint) | 5 | same as Grok | PAID | ran 11:24Z right after the 5h cap reset; 2 model calls |

What the runs show:
- The circuit forced the tool-definition lookup (`tool_search`) before the first `run_fn` for every clerk, because the
  harness reported `tool_known=0` on first use.
- Composer's failed tool call was retried exactly once, then aborted, without any harness logic for retries: that policy
  lives in the on-chain gates (TOOL phase, `err` latch).
- Payment happened only when `judge_ok=1` was observed together with `model_done`; the clerk cannot pay itself.
- All ticks of every run matched on-chain `step()` bit for bit.
