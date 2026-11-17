# Depth-targeted relay search / 深度定向搜索

Frozen baseline: **174 NAND + 10 LATCH, depth 11, C=244,904**, SHA-256 `b276f9b10b9a2aabac5d301d8267cf9f337b798d0ab2d419de4fb85e83b19d75`. ABC randomized search is stopped. No latency or latch-count change is allowed; the full canonical 2^28 transition check remains the promotion gate.

## Depth-11 endpoints / 深度11端点

Wire IDs below use the farm convention: observations 0–17, old latch bits 18–27, NAND wires from 28. Each set is the structural transitive input set, not a claimed minimal Boolean support. Gates count the complete transitive cone; shared gates appear in multiple cones.

| Output or next-state bit | Root | Cone NAND | Input/state count | SAT target | Gate ceiling |
|---|---:|---:|---:|---:|---:|
| call_a | 188 | 65 | 23 | 10 | 69 |
| call_b | 189 | 62 | 23 | 10 | 66 |
| retry | 191 | 37 | 15 | 10 | 41 |
| reserve | 196 | 37 | 16 | 10 | 41 |
| breaker_open | 197 | 49 | 12 | 10 | 53 |
| next_busy | 155 | 58 | 22 | 10 | 62 |
| next_channel_b | 166 | 66 | 23 | 10 | 70 |
| next_model_b | 171 | 60 | 22 | 10 | 64 |

**call_a**: `start`, `key_valid`, `tier`, `quota1`, `quota0`, `rate_ok`, `model_b_only`, `enable_a`, `enable_b`, `healthy_a`, `healthy_b`, `prefer_b`, `result`, `ok`, `retryable`, `busy`, `channel_b`, `retried`, `model_b`, `cool1`, `cool0`, `bcool1`, `bcool0`.

**call_b**: `start`, `key_valid`, `tier`, `quota1`, `quota0`, `rate_ok`, `model_b_only`, `enable_a`, `enable_b`, `healthy_a`, `healthy_b`, `prefer_b`, `result`, `ok`, `retryable`, `busy`, `channel_b`, `retried`, `model_b`, `cool1`, `cool0`, `bcool1`, `bcool0`.

**retry**: `enable_a`, `enable_b`, `healthy_a`, `healthy_b`, `result`, `ok`, `retryable`, `busy`, `channel_b`, `retried`, `model_b`, `cool1`, `cool0`, `bcool1`, `bcool0`.

**reserve**: `start`, `key_valid`, `tier`, `quota1`, `quota0`, `rate_ok`, `model_b_only`, `enable_a`, `enable_b`, `healthy_a`, `healthy_b`, `busy`, `cool1`, `cool0`, `bcool1`, `bcool0`.

**breaker_open**: `result`, `ok`, `retryable`, `tick`, `busy`, `channel_b`, `strike_a`, `cool1`, `cool0`, `strike_b`, `bcool1`, `bcool0`.

**next_busy**: `start`, `key_valid`, `tier`, `quota1`, `quota0`, `rate_ok`, `model_b_only`, `enable_a`, `enable_b`, `healthy_a`, `healthy_b`, `result`, `ok`, `retryable`, `busy`, `channel_b`, `retried`, `model_b`, `cool1`, `cool0`, `bcool1`, `bcool0`.

**next_channel_b**: `start`, `key_valid`, `tier`, `quota1`, `quota0`, `rate_ok`, `model_b_only`, `enable_a`, `enable_b`, `healthy_a`, `healthy_b`, `prefer_b`, `result`, `ok`, `retryable`, `busy`, `channel_b`, `retried`, `model_b`, `cool1`, `cool0`, `bcool1`, `bcool0`.

**next_model_b**: `start`, `key_valid`, `tier`, `quota1`, `quota0`, `rate_ok`, `model_b_only`, `enable_a`, `enable_b`, `healthy_a`, `healthy_b`, `result`, `ok`, `retryable`, `busy`, `channel_b`, `retried`, `model_b`, `cool1`, `cool0`, `bcool1`, `bcool0`.

## Search protocol / 搜索协议

Each of the eight complete cones is scheduled on both build-host-2 and build-host with independent kissat seeds, depth bound 10 and at most its current gate count +4. Sampled-row SAT uses counterexample refinement against the complete cone truth table; SAT on a sample alone never counts. A solution must match every boundary assignment, then the composed native relay must pass all 268,435,456 input/state transitions. Solver timeouts and row caps are inconclusive, never UNSAT.

In parallel, each host runs randomized **16–24 gate** windows rooted on depth-10/11 critical paths. Boundary arrival depths are included in the SAT constraint. Verified partial depth reductions are stored separately from C-best promotions and fed back to later jobs, with no bus line for a mere working-frontier update. The bus receives verified C-best promotions and one summary per 30 minutes; detailed attempts remain in `randopt.log` and `depth_search/`.

If all endpoints reach depth 10 with 174 NAND unchanged, C becomes **184,000**. Allowing four extra gates per eight cones would instead give 206 NAND +10 LATCH and C=216,000; sharing and output placement may change that count. Neither number is a measured result. Existing latches are kept at the canonical state boundary in this search; no pipeline/extra-latency retiming is used. Any later movement of existing latches must still pass the identical transition relation and retain ten state bits.

Local fallback (2026-09-12): while neither host is reachable, the coordinator runs `depth_worker.py --mode full --workers 4` on this Mac at nice 10, using installed Kissat. The remaining critical endpoints get independent seeds to fill four worker slots. Local results use the identical exhaustive 2^28 verifier. SSH is probed every minute with short connection timeouts; reachable remote dispatchers are checked/restarted and receive the working frontier. Local jobs drain after the current bounded batch once remote work resumes. Local logs and PID are in `depth_search/local/`. To stop all local work, create both `depth_search/STOP` and `depth_search/local/STOP`.

## Tactic change: two remaining endpoints (2026-09-12T15:23:23.911771+00:00)

Working frontier SHA `583f9e199c4fe02e67d37d75c40f96902682cb26fdd46faa27d61cdbb582d795` has 270 NAND, ten latches, and two depth-11 endpoints. This is a verified exploratory circuit, not the C-best.

| Endpoint | Kind | Farm root | Complete cone gates | Input count | Target |
|---|---|---:|---:|---:|---:|
| call_a | output 0 | 284 | 65 | 23 | depth 10 |
| next_model_b | next-state, tap 17 | 257 | 60 | 22 | depth 10 |

Input sets are the same as the corresponding original cone lists above. The complete cones include upstream logic back to observations/state, not merely the final gate levels.

Locally available completed full-cone attempts: **12**, statuses `{'timeout': 9, 'care-cap (inconclusive)': 2, 'deadline (inconclusive)': 1}`. Individual solver-call statuses: `{'SAT': 67, 'timeout': 9}`. **No local depth-10 full-cone UNSAT.** The 18 attempts mentioned in the request cannot all be matched to completed local records. Older cached remote summaries contain aggregate UNSAT counts across unrelated windows/cones; without the remote per-job records those cannot be attributed to these two endpoints or used as a bound. Remote logs will be accessible again when SSH returns.

`top.v` now exposes independent initial/retry A grants and computes model-B load/retention with route lookahead. In particular `accept & model` simplifies to `ready & model & b`; `again & saved_model` simplifies to `failed & retryable & ~tried & ~channel & b & saved_model`. Twelve bounded mappings used `balance -d`, with/without `dc2` or rewriting, two NAND libraries, and optional delay target 10. The selected result passed all 2^28 transitions but is worse: **277 NAND, depth 15, C=968625**. It was archived under `depth_search/lookahead/`, not promoted.

The new local tactic runs four seeded **26–30 gate multi-output windows**, retaining endpoint and depth-9/10 predecessor outputs plus all externally consumed window signals. SAT jointly synthesizes shared logic with each predecessor's original arrival bound and endpoint bound 10. Full boundary truth tables validate sampled SAT, then the entire relay is exhaustively verified before retention. `lookahead/check_multi.py` checks joint truth tables, per-output depth bounds, and shared splicing. Single-output full-cone retry batches were stopped locally.

An UNSAT window establishes only an encoding/gate-budget/arrival-bound result for that cut. Even widening a cut to 30 gates would not prove that the complete frozen spec intrinsically requires depth 11. No global lower-bound claim is justified here. Current promoted single C is 244904; the verified two-circuit graph remains better at **224696** (175 NAND, part depths 4 and 11). Further gate/graph work remains available if the depth tactic is abandoned; no unproved lower bound is used to trigger that conclusion.

First widened batch completed: {'timeout': 4}. No depth lower bound established. Remote recovery now installs this multi-output tactic before restarting this relay’s dispatchers.
