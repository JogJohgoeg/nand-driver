# Arena v1 — Rules / 竞技场 v1 规则

> Undeployed v3.1 extension: [V3_1.md](V3_1.md) specifies composite admission,
> duck track 2 (14 inputs, 2 outputs, 0–8 state bits), exact goals/collision/step
> ordering, and season-0 migration. Existing deployed rules below are unchanged.
> 未部署的 v3.1 扩展见 [V3_1.md](V3_1.md)：组合报名、鸭子赛道及迁移细则；
> 下文已部署版本规则不变。

These rules are fixed for v1.  The on-chain part is enforced by `Arena.sol`; the physics
part is enforced by `referee.py` and is fully reproducible from the published trace.
本规则在 v1 内固定。链上部分由 `Arena.sol` 强制执行；物理部分由 `referee.py` 执行，且可由公开的
trace 完整复算。

## 1. Track and physics / 赛道与物理

* The track, car, sensors and dynamics are `../env.py` **exactly as is** (the referee
  imports it, never modifies it): closed wobbly loop, half-width 1.3, 5 rays
  (L60, L30, F, R30, R60), speed 0.25/step, 10° turns, `N_CL = 1440` centerline samples,
  `MAX_STEPS = 1200`.
  赛道、车辆、传感器与动力学即 `../env.py` 原样（裁判只 import，不修改）：闭合摆动环道、半宽 1.3、
  5 条射线、每步速度 0.25、每次转向 10°、中心线采样 `N_CL = 1440`、`MAX_STEPS = 1200`。
* **24 fixed starts** = `env.STARTS`: 8 positions (`i * 1440 // 8`, i = 0..7) × 3 offsets
  `(lateral, heading)` ∈ {(0, 0), (0.6, 0.4), (−0.6, −0.4)}.
  **24 个固定起点** = `env.STARTS`：8 个位置 × 3 种 (横向偏移, 航向偏移)。
* Each run ends at the first of: **crash** (car leaves the track), **1 completed lap**
  (`progress >= N_CL`), or **`MAX_STEPS`** steps.
  每局在以下三者最先发生时结束：**撞墙**、**跑完 1 圈**（`progress >= N_CL`）、或达到 **`MAX_STEPS`**。

## 2. Score / 计分

* `score = Σ_{24 runs} min(progress, N_CL)` as integer centerline samples.
  **Maximum = 24 × 1440 = 34560.**  A crash keeps the progress made before the crash
  (progress is clamped at 0 from below).
  `score = 24 局 progress 之和`，每局封顶 `N_CL`。**满分 24 × 1440 = 34560。** 撞墙保留撞前的进度。
* Tie-break: **fewer gates** (`circuitInfo.gateCount` at entry time), then **earlier
  entry** (smaller `entryId`).  Implemented in `Arena.best()` and `leaderboard.py`.
  平局判定：**门数更少**（入场时的 `gateCount`）优先，再比 **入场更早**。

## 3. Eligible circuit / 参赛资格

Checked on-chain in `enter()`:
链上 `enter()` 检查：

| check / 检查 | rule / 规则 |
|---|---|
| CPU | `checker.isCPU(cpu) == true` (checker = TapeOut `CircuitFactory` `0x68224F668083c29e9800Be2a646d42d18cedF7e2`) |
| ownership / 所有权 | `IERC721(cpu).ownerOf(id) == msg.sender` |
| shape / 形状 | `circuitInfo(id) == (nIn 15, nOut 2, nState 0, 1 ≤ gateCount ≤ 256)` |
| uniqueness / 唯一性 | one entry per `(cpu, id)` / 每个 `(cpu, id)` 只能入场一次 |

* Input bit layout (as `dlgn_ctrl.json` `input_bits`): **bit i = ray i//3, threshold i%3**,
  rays in order L60, L30, F, R30, R60, thresholds `d > 0.8, d > 1.6, d > 3.0`.  Bits are
  packed LSB-first into 2 bytes for `eval()` (`prototype.pack`).
  输入位：**第 i 位 = 射线 i//3 的第 i%3 个阈值**，射线顺序 L60, L30, F, R30, R60，阈值
  `d > 0.8, 1.6, 3.0`。按 LSB-first 打包成 2 字节传给 `eval()`。
* Output bits (as `output_bits`): **`[left, right]`**; `10` = left, `01` = right,
  **`00` and `11` = straight** (`env.bits_to_action`).
  输出位：**`[left, right]`**；`10` 左转、`01` 右转、**`00` / `11` 直行**。
* Awards are paid to the **current** `ownerOf(cpu, id)`, not to the address that entered.
  奖金支付给 **当前** `ownerOf(cpu, id)`，而不是入场地址。

## 4. Decisions come from the on-chain netlist / 决策来自链上网表

1. The referee fetches `netlist(cid)` via `eth_call` and decodes it with
   `compile.decode_nl` (the same decoder as `compile.py` / `onchain_check.py`).
   裁判通过 `eth_call` 读取 `netlist(cid)`，用与 `compile.py` 相同的 `decode_nl` 解码。
2. **Cross-check**: 64 random 15-bit inputs (seed `0x41524E41`, `random.Random`) are
   evaluated locally (`compile.eval_comb`) and on-chain (`eval(cid, packed)`); any
   mismatch rejects the run.  Decoded gate count must equal `circuitInfo.gateCount`.
   **交叉校验**：64 个固定种子随机输入，本地 `eval_comb` 与链上 `eval()` 逐字节比较；任一不符即拒绝。
3. Physics runs off-chain in `env.py`; each step's decision is `eval_comb(decoded netlist)`.
   物理在链下 `env.py` 运行；每步决策为 `eval_comb(解码后的网表)`。
4. The **full trace** is published: per run `start, steps, progress, crashed, lap` and per
   step `[inputsHex, outHex]` (both packed as for the ABI).
   `traceSha256 = sha256(json.dumps(runs, separators=(",",":"), sort_keys=True))` is what
   the referee posts as `traceHash` in `report()`.  Anyone can recompute both halves:
   re-run `eval()` on-chain for every step's `inputsHex`, and replay `env.py` from the
   same starts with the same outputs.
   **完整 trace** 公开：每局每步 `[inputsHex, outHex]`；`traceSha256` 即 `report()` 中的 `traceHash`。
   任何人都可以复算两半：对每步输入在链上重跑 `eval()`，再用相同输出在 `env.py` 里重放。

## 5. Referee / 裁判

* v1 has a single trusted referee address (`Arena.referee`); it may re-report (latest
  wins), pay awards from the pool, and hand the role over via `setReferee`.
  v1 只有一个受信任的裁判地址；可以重复上报（以最新为准）、从奖池发奖、通过 `setReferee` 移交。
* The referee cannot change the rules, the track, or the physics: they are pinned by the
  code in this directory and by `../env.py`; a dishonest score is detectable by anyone
  re-running `referee.py --cpu … --cid …` at the same block.
  裁判无法修改规则、赛道或物理；任何人用 `referee.py` 在同一区块重跑即可发现不诚实的分数。
* On-chain physics is future work (v2).  链上物理是后续工作（v2）。

---

# Arena v2 — fees, pool and payout / 竞技场 v2 费用、奖池与分配

Everything in sections 1–5 (track, score, eligibility, on-chain netlist, referee) is unchanged.
v2 adds a **BEM-denominated** economy; **no BNB is accepted anywhere** (the contract has no
`receive`/`fallback`).  第 1–5 节全部不变；v2 增加 **以 BEM 计价** 的经济系统；**合约不接受任何 BNB**。

## 6. Fee table / 费用表

| action / 动作 | who pays / 谁付 | fee / 费用 | how / 方式 |
|---|---|---|---|
| `enter(cpu, id)` | the circuit owner / 电路所有者 | **0.2 BEM** (`entryFeeBem = 20_000_000` raw, 8 decimals) | `BEM.approve(arena, fee)` then `enter`; pulled with `transferFrom` after the shape / owner checks |
| `drive(entryId, inputs)` | any visitor / 任意访客 | **0.005 BEM** (`driveFeeBem = 500_000` raw) | `approve` (e.g. `100 × driveFeeBem` once) then `drive`; runs one step on chain through the Witness and emits `Drove(driver, entryId, inputs, outputs, fee)` |
| sponsor / 赞助 | anyone / 任何人 | any amount / 任意 | plain `BEM.transfer(arena, amount)` |
| `report`, `settle`, `setFees`, `setReferee` | referee only / 仅裁判 | gas only | — |

No exemptions: the referee and the deployer pay the same fees.  没有豁免：裁判与部署者同样付费。
BEM token: `0x5ce033B2bFCa3Af30b3e8C8457DeaF776A8b695a` (symbol BEM, 8 decimals, no permit).

## 7. Prize pool and payout / 奖池与分配

* **Pool** = `BEM.balanceOf(arena)` (entry fees + drive fees + sponsorship).  `pool()` view.
  **奖池** = 合约的 BEM 余额（入场费 + 驾驶费 + 赞助）。
* **Settle** (`settle(uint256[3] entryIds)`, referee, closes one *season*):
  1. **burn 10 %** of the pool to `0x000000000000000000000000000000000000dEaD`;
     **销毁奖池的 10 %** 到 `0x…dEaD`；
  2. split the **remaining 90 %** as **50 % / 30 % / 20 %** to the *current* `ownerOf(cpu, id)`
     of `entryIds[0..2]` (rank 1, 2, 3 as ranked by section 2);
     其余 **90 %** 按 **50 % / 30 % / 20 %** 支付给 `entryIds[0..2]` 电路的 **当前** 所有者（按第 2 节排名）；
  3. an empty rank is passed as `type(uint256).max`; **its share stays in the pool** for the next
     season (with a single entry: 10 % burned, 45 % of the original pool paid, 45 % carried over);
     空位传 `type(uint256).max`，**该份额留在奖池** 进入下一赛季（只有一个参赛者时：销毁 10 %，支付 45 %，结转 45 %）；
  4. `season += 1`; emits `Settled(season, pool, entryIds, amounts)`.
* Amounts are fixed before any transfer (checks-effects-interactions); every transfer must
  succeed or the whole settle reverts.  金额在任何转账前固定；任一转账失败则整体回滚。
* The referee may change fees with `setFees(entryFeeBem, driveFeeBem)`; changes apply to future
  actions only.  裁判可用 `setFees` 调整费用，仅对之后的动作生效。

## 8. Season settlement policy / 赛季结算规则（2026-09-08 起生效）

**Trigger / 触发条件.** The referee settles the season when ANY of the following holds:
- 5 or more scored entries / 已评分参赛者达到 5 个；
- the pool reaches 5 BEM / 奖池达到 5 BEM；
- 60 days have passed since the last settlement (or since the arena was deployed) AND at least 3 entries are scored / 距上次结算（或合约部署）满 60 天且至少 3 个已评分参赛者。
If none holds, no settlement: the pool keeps accumulating. / 三条都不满足则不结算，奖池继续累积。

**House does not take prizes / 庄家不领奖.** Circuit #279 (owned by the referee wallet) stays on the leaderboard as the baseline but is passed as an empty slot at settlement; its share stays in the pool for the next season. / 279 号是裁判自己的电路，作为基准线上榜，结算时按空位处理，份额留池。

**Notice / 公示.** At least 24 hours before settling, the referee publishes the intended ranking (entryIds, scores, trace hashes) on the page and on X. Anyone can recompute any score with `referee.py` against the on-chain netlist; a proven mismatch postpones settlement until re-scored. / 结算前至少 24 小时在页面和 X 上公示拟结算排名与轨迹哈希；任何人可用裁判脚本复算，证实有误则重评后再结算。

**Payout / 分配.** As implemented in ArenaV2: burn 10% of the pool to 0x…dEaD, then 50 / 30 / 20 of the remainder to the current owners of the top three entries; empty slots leave their share in the pool. / 按 ArenaV2 合约：先烧 10%，其余按 50/30/20 付给前三名当前持有人，空位份额留池。

**Planned for v3 / 计划在 v3 改动（第一次结算前决定）.** Pay out 60% and roll 30% into the next season's seed pool; require re-entry (and the entry fee) each season. / 每季只分 60%，留 30% 作为下季种子；每季需重新报名并再付报名费。

## 9. Arena v3 — seasons and tracks / 赛季与赛道

**Live status / 当前状态 (2026-09-09).** Arena v3 is deployed at `0xeb248f4fb929686b045e63c47c69505cf0009888`, block 120886978. Season 0 entries: **0 = #279/v1**, **1 = #280/v2b**, both reported; pool 0.4 BEM. This supersedes the preparation-status statements below. `--v3` still defaults to offline drafts; the explicitly authorized `--yes` deployment/enter/report paths now simulate each call, request the browser wallet, and check each receipt before proceeding. Existing send records prevent duplicate submission. / v3 已部署，第 0 季报名 0 为 #279/v1、1 为 #280/v2b，均已评分，奖池 0.4 BEM。本段覆盖下文准备阶段的“未部署”说明。不带 `--yes` 仍只生成草稿；经用户授权可用 `--yes` 部署、报名和报告，每笔先模拟，钱包确认后核对回执再继续；发送记录防止重复提交。

**Version scope / 版本范围.** This section supersedes the v1 eligibility and v2 payout rules **only for ArenaV3**. Existing v1/v2 contracts are unchanged and retained as history. 本节仅适用于 ArenaV3，覆盖旧版准入与分配规则；原 v1/v2 合约不变，保留为历史记录。

**Season entries / 每季报名.** `enter(cpu,id,track)` checks current NFT ownership, pulls `entryFeeBem` using BEM `transferFrom`, and creates a new global entry ID for the current season. A circuit may enter once per season. `settle` increments `season`; old entries remain readable history but cannot drive, report, win or appear in `best()` for the new season. Re-entry requires the fee again. `entered(cpu,id)` means entered **this season**, not ever entered. 每季同一电路仅报名一次；结算后旧记录仅供查询，不能继续驾驶、评分或领奖；新季须重新缴费，产生新的 entryId。

| Track / 赛道 | `track` | Shape / 形状 | Environment / 环境 |
|---|---:|---|---|
| v1 | 0 | 15 inputs, 2 outputs, **0** latches | Original `env.py`, 24 starts / 原环境 |
| v2b | 1 | 15 inputs, 4 outputs, **0–8** latches | `v2/env2b.py`, 24 starts, 1200 steps, no blackout / 无传感器黑屏 |

Both tracks allow 1–256 total elements, including LATCHes. `Entry.nState` stores the official circuitInfo value. The reference v2b circuit #280 uses **87 NAND + 3 LATCH = 90 elements**, not 87 total. v2b outputs are `[left,right,throttle,brake]`; speeds 0.10/0.20/0.30/0.40/0.50, two consecutive pedal commands per notch, 10°→3° steering, 2.4-unit rays. See [RULES_v2b.md](../v2/RULES_v2b.md) for exact bilingual constants and update order. 两赛道总门数均为 1–256（含锁存器）；v2b 基准电路为 3 位状态，但允许 0–8 位参赛。

**Stateful driving / 有状态驾驶.** Paid `drive` calls Witness `evaluate` for zero-state circuits and `beat` for stateful circuits. Witness sees the Arena as caller; all visitors driving the same entry share its heart. `Drove.driver` identifies the actual visitor. Re-entering a stateful circuit resets its Arena-owned Witness heart so state does not leak between seasons. The referee separately resets state to zero at **each of the 24 starts**, carrying it between steps within that run. 有状态调用使用 `beat`，同一报名电路由访客共享 Arena 的 Witness 状态；新季重报会清零。裁判评分独立于付费驾驶演示，每个固定起点重新清零。

**Scores / 分数.** v1 keeps `sum(clamp(progress,0,1440))`, maximum 34560. v2b first maximizes that same progress sum, then minimizes total finishing steps (an unfinished run contributes 1200). To preserve the existing `report(uint256,uint32,bytes32,string)` ABI, v2b encodes:

```
score = progressScore * 28801 + (28800 - finishSteps)
maximum = 995391360
```

One unit of progress beats every possible step bonus. `best(track)` compares score, then fewer total elements, then earlier entryId; `best()` defaults to v1. Traces retain both human-readable components. v2b 用上述整数编码保持进度优先、步数次之；同分再比较总门数与报名顺序。

**Shared prize pool / 共享奖池.** Rankings are per track: **do not compare the raw v1 and v2b scores**. As in v2, the trusted referee supplies the three ranked slots to `settle`; the contract does not infer cross-track winners. Until a different allocation is agreed, the referee must publish the chosen shared-pool slots and the separate track rankings in the section-8 notice. This is an explicit referee decision, not an automatic cross-track normalization. 赛道分别排名，不能直接比较两种编码分数；共享奖池的三席仍由可信裁判明确公示并提交，不自动跨赛道换算。第 8 节触发条件和提前 24 小时公示属于裁判流程，并非链上时间锁。

**10/60/30 settlement / 结算.** Let `P` be the original BEM balance immediately before settlement. Burn `floor(P*1000/10000)` to `0x…dEaD`; reserve `floor(P*6000/10000)` for prizes, split 50/30/20 with integer rounding. Retain everything else. Thus a full podium receives **30% / 18% / 12% of the original pool** and at least 30% rolls over. With only rank 1 occupied: 10% burn, 30% paid, 60% retained, before rounding. This means 60% **of the original pool**, not 60% of the post-burn 90%. 原池先烧 10%，原池 60% 按 50/30/20 分配（即原池 30/18/12%），至少 30% 留到下一季；整数余数也留池。

`EMPTY = 2**256-1` leaves a slot unpaid, without promoting lower ranks. Referee-owned entries are marked as baselines at registration and remain excluded for that entry even after transfer; entries whose current owner is the current referee are also excluded. They stay visible in rankings. Missing/baseline shares roll over. Duplicate nonempty IDs, unscored entries and old-season entries revert. Every BEM transfer must succeed or settlement rolls back atomically. 空位与庄家基准不领奖、不顺延名次，份额留池；重复、未评分及过期报名不能结算；转账失败整体回滚。

**Validation / 验证.** Run `arena/.venv/bin/python arena/test_arena_v3.py` from `dlgn_ctrl`, then `arena/.venv/bin/python arena/test_v3_drafts.py`. Official CPU/Witness bytecode runs locally in PyEVM; BEM is a local mock. Reports, gas and traces are in `test_results_v3.json` and `traces/local_v3_*.json`. Gas figures are local test measurements, not live BSC quotes. 本地测试覆盖两赛道、连续状态、每季清零、重新缴费、空位、庄家排除及结转算术，不部署主网。

**Unsigned tools / 未发送工具.** Without `--yes`, v3 commands below create offline drafts. The recorded deployment address is used unless `--arena` overrides it. Paid entry/drive requires BEM allowance. A second deployment is refused when the existing deployment record is present. 不带 `--yes` 时仅生成未签名数据，默认使用已记录的部署地址；付费报名及驾驶需要 BEM 授权。已有部署记录时拒绝重复部署。

```sh
arena/.venv/bin/python arena/build.py --v3
arena/.venv/bin/python arena/deploy_arena.py --v3
arena/.venv/bin/python arena/arena_tx.py --v3 enter --cpu 0x6Fb4089e7Cbaa9660Fd11056274Cbd8117EE5B38 --cid 280 --track v2b
arena/.venv/bin/python arena/referee.py --track v2b --cpu 0x6Fb4089e7Cbaa9660Fd11056274Cbd8117EE5B38 --cid 280 --entry 1
arena/.venv/bin/python arena/arena_tx.py --v3 drive --entry 0 --inputs ff7f
arena/.venv/bin/python arena/arena_tx.py --v3 report --entry 1 --trace arena/traces/0x6fb4089e7cbaa9660fd11056274cbd8117ee5b38_280_v2b.json
arena/.venv/bin/python arena/arena_tx.py --v3 settle --ids 0,max,max
```

The referee command alone reads chain state: it checks **16 random state/input transitions** for v2b (64 inputs for v1), writes a full trace JSON and a sibling `_report_calldata.txt`. Example entry ID 0 is a placeholder; use the actual season entry ID when preparing a real report. 裁判命令只读链，v2b 比较 16 组状态转移，生成完整轨迹及报告 calldata；示例 entryId 0 不是已报名的声明。
