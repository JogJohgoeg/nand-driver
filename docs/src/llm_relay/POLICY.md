# Partition and policy / 分区与规则

## Boundary / 边界

**ON-CHAIN-capable:** authorization gate over `key_valid/tier`, small quota and rate comparisons, two-channel eligibility/model routing, one retry, reservation/charge/release enables, bounded breaker state. This artifact is evaluated locally, not deployed. / 可上链的是有限位宽确定性决策；本次仅本地验证。

**OFF-CHAIN:** bearer verification/hash/lookup and expiry, JSON/model-name classification, account records and exact large balances, token counting and tariff quantization, weighted scheduling preference, enabled/health observations, HTTP/TLS/streaming, credentials, real-time ticks and durable ledger persistence. / 密钥、HTTP、实际额度和用量真实性由外部提供。

This is a bounded customer tariff: `units = min(3, ceil(total_tokens / 128))` on a successful response; failed attempts charge zero to the customer. Reserve three units before the first upstream call; release that reservation exactly once at success/final failure and deduct the circuit's 0–3 units. The operator bears extra upstream usage/retry cost. This is not an exact upstream invoice or payment transaction. / 成功按每128 token一单位、每请求封顶3单位；失败不向客户收费，超额与重试成本由运营者承担；演示账本非付款。

## Interface / 接口 (bit order is spec.py order)

18 observations: `start key_valid tier quota1 quota0 rate_ok model_b_only enable_a enable_b healthy_a healthy_b prefer_b result ok retryable usage1 usage0 tick`.

- Quota bucket `00/01/10/11` means 0/1/2/at-least-3 available units. All tiers need bucket 3. Tier 1 permits B-only model class; class 0 is available to both tiers on A or B.
- `prefer_b` is the deterministic weighted scheduler's proposal when both channels support the request. The circuit can override it for eligibility; fair weights are not proved by this circuit.
- `result` is a completion strobe for the single in-flight call. `ok` takes precedence over `retryable`. Timeouts must be reported as retryable failures by the harness.
- `tick` means one cooldown interval elapsed. It is not a clock or verified timestamp.

10 latches: `busy channel_b retried model_b strike_a cool1 cool0 strike_b bcool1 bcool0`. Per-request model/selected channel/retry state is latched; both channels’ strikes and cooldowns persist across requests.

14 outputs: `call_a call_b deny retry finish charge1 charge0 release reserve breaker_open log_event code2 code1 code0`. `reserve` admits the request and authorizes a three-unit reservation; `release` releases it. `finish` serves a successful result. `deny` rejects admission or terminates failure. Codes: 0 none, 1 auth/tier, 2 quota, 3 rate, 4 no eligible route, 5 final upstream failure. `breaker_open` indicates either channel has a nonzero next cooldown; it is status, not a separate action.

## Complete rule table / 完整规则表

| Priority/condition / 条件 | Outputs / 动作 | Next state / 状态 |
|---|---|---|
| Idle, no start / 空闲无请求 | No request actions | Clear per-request fields; keep/update breaker |
| Idle start, invalid key or B-only without tier / 鉴权失败 | deny, code 1 | Remain idle |
| Otherwise quota != 3 / 额度不足 | deny, code 2 | Remain idle |
| Otherwise rate_ok=0 / 限流 | deny, code 3 | Remain idle |
| Otherwise no eligible channel / 无路由 | deny, code 4 | Remain idle |
| Otherwise admit / 接受 | reserve; exactly one call | busy=1, selected channel and model latched, retried=0 |
| Eligibility / 通道资格 | A: enabled AND healthy AND cooldown=0 AND class=0. B: enabled AND healthy AND B cooldown=0. Prefer B if eligible and (prefer_b OR A ineligible) | Model class stays latched throughout retries |
| Busy, no result / 等待 | No repeated call, reservation or charge; start ignored | Hold request fields |
| Busy result ok / 成功 | finish, release, charge=usage (0..3) | Clear request fields |
| Busy failed, retryable, not retried, alternate eligible / 首次可重试失败 | retry and exactly one alternate call; no second reservation or charge | busy=1, selected channel flips, retried=1 |
| Other busy failure / 不可重试或耗尽 | deny code 5, release, charge=0 | Clear request fields |
| Channel retryable failure while its cooldown=0 / 通道可重试失败 | First sets strike; second opens breaker | On second set its cooldown=3 and retain strike=1 |
| Channel success / 通道成功 | No separate action | Clear that channel’s strike |
| tick AND cooldown>0 / 冷却计时 | No request action unless an independent request/result is present | Decrement cooldown, saturating at zero; opening dominates tick |
| A channel cooldown expires / 通道冷却结束 | breaker_open=0 only if both cooldowns are zero | Channel becomes eligible on following step; retain strike for half-open probe |
| Every admission/retry/terminal/open event / 事件 | log_event | One observation/transition log entry |

Cooldown does not cancel an in-flight call. Both channels have independent breakers. After cooldown, strike=1 means half-open: the single in-flight slot permits one probe, a retryable failure reopens immediately, success closes it. Non-retryable failures leave the strike unchanged. Duplicate results with `start=0` in idle cannot charge again. Simultaneous start/result in idle starts a new request and ignores the result; callers must not replay start as a new request. All input/state combinations, including unreachable states, have defined semantics. / 恶意或失序观测的有限状态行为也完全定义，但请求身份、防重放和状态保管不由此电路证明。

Reused architecture: v2 `logic(x,s,M)` and Circuit wrapper; v3/v4 finite retry and termination fuses; v5 charge gating; gateway_demo replayable hashed ledger. No upstream software dependencies are added.
