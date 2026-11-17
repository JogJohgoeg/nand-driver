# TapeBoot 规范

> TapeBoot 规定设备怎么从 tape 容器取回固件：链上路径、频道指针、manifest 字段、签名和校验顺序。草案 v0.3。

## 链上路径

全部放在设备持有人的 tape 容器里，是 SiteRegistry 的普通文件。

| 路径 | 内容 |
|---|---|
| `tapeboot/<board>/channel/<channel>.json` | 频道指针 |
| `tapeboot/<board>/<seq>/manifest.json` | manifest，签过名 |
| `tapeboot/<board>/<seq>/<file>` | 文件；超过 8,400,000 字节的拆成 `<file>.p0`、`<file>.p1` … |
| `tapeboot/<board>/rollback/<seq>.json` | 回滚指令，可选，签过名 |

| 名字 | 规则 |
|---|---|
| `<board>` | `[a-z0-9][a-z0-9-]{0,31}`，如 `mm-gw2a18` |
| `<seq>` | 十进制正整数，无前导零 |
| `<channel>` | `[a-z][a-z0-9-]{0,15}` |
| 所有路径 | ≤ 200 字符，不以 `/` 开头，不含 `\ ? # :`，没有空段、`.`、`..` |

单个链上文件最多 350 块 × 24,000 字节 = 8,400,000 字节。更大的文件拆成分段，除最后一段外每段长度是 24,000 的倍数。

## 频道指针

```json
{"tapeboot":1,"board":"mm-gw2a18","channel":"stable","seq":7,"manifest":"tapeboot/mm-gw2a18/7/manifest.json","manifest_sha256":"0x…"}
```

| 字段 | 说明 |
|---|---|
| `tapeboot` | `1` |
| `board` | 板子名 |
| `channel` | 频道名，如 `stable`、`beta` |
| `seq` | 指向的版本 |
| `manifest` | manifest 路径 |
| `manifest_sha256` | manifest 文件的 sha256，`0x` + 64 位小写十六进制 |

- 严格 JSON，≤ 4,096 字节，存规范化形式。
- **不签名**。信任来自 manifest 的签名和 `seq ≥ min_seq`。
- 取回 manifest 后先比 `manifest_sha256`，不一致就当没读成。

## manifest

- 路径 `tapeboot/<board>/<seq>/manifest.json`，≤ 65,536 字节。
- UTF-8 严格 JSON：不许重复键、BOM、孤立代理项；嵌套 ≤ 32 层；顶层是对象。
- 数字只能是 0 到 2^53−1 的整数。
- 链上存的就是规范化形式（含 `sig`），不是规范化形式的一律拒绝。
- 它同时是一份合法的 tapemule 应用清单：`name`、`version`、`tapeout.v = 1` 必填，`tapeout.files` 列出每个链上分段的路径和 sha256。不认识 TapeBoot 的工具也能把它当普通站点核对。

### `tapeboot` 成员

| 字段 | 类型 | 规则 |
|---|---|---|
| `v` | 整数 | 必须是 `1` |
| `board` | 字符串 | 等于设备固化的 board |
| `seq` | 整数 | ≥ 1，单调递增，等于路径里的 `<seq>` |
| `version` | 字符串 | semver，只给人看；新旧只看 `seq` |
| `created` | 字符串 | RFC 3339 UTC，如 `2026-10-22T08:00:00Z`；只给人看 |
| `prev` | 字符串 | 上一版 manifest 的 sha256；`seq = 1` 时为 64 个 0 |
| `min_loader` | 字符串 | 引导固件最低 semver，低于它就拒绝 |
| `owner` | 对象 | `{chain_id, registry, container, holder}` |
| `files` | 数组 | 1–16 项 |
| `sig` | 字符串 | 签名，见下 |

`owner` 里的地址是 `0x` + 40 位十六进制，比较时不分大小写。设备拿它和固化的信任根逐项比，任何一项不同整份拒绝。

### `files[]` 每一项

| 字段 | 类型 | 规则 |
|---|---|---|
| `name` | 字符串 | `[A-Za-z0-9._-]{1,64}`，同一份 manifest 里不重复 |
| `role` | 字符串 | `bitstream` / `runtime` / `os` / `model` / `config` |
| `size` | 整数 | 文件总字节数，≥ 1 |
| `sha256` | 字符串 | 整个文件（各段按顺序拼起来）的 sha256 |
| `chunk` | 整数 | 必须是 `24000` |
| `chunk_sha256` | 数组 | 块数 ≤ 256 时用：第 i 项是第 i 块的 sha256，共 `ceil(size/24000)` 项 |
| `chunk_list` | 对象 | 块数 > 256 时用；和 `chunk_sha256` 恰好给一个 |
| `parts` | 数组 | 按顺序的链上分段 `{path, size, sha256}`，`size` 之和等于文件 `size` |
| `load` | 字符串 | `fpga`、`sd`，或 `ddr:0x` 加 8 位十六进制（如 `ddr:0x81000000`） |
| `compress` | 字符串 | v1 只有 `none`，别的值整份拒绝 |

- 块哈希按整个文件编号，跨段连续。段长是 24,000 的倍数，所以一块不会跨两段。
- `parts[].path` 一般放在 `tapeboot/<board>/<seq>/` 下，也可以引用同一容器里已有的文件。路径在签名范围里，节点换不掉。

### `chunk_list`（大文件）

```json
"chunk_list": {"path":"tapeboot/<board>/<seq>/<name>.chunks","size":<32 × 块数>,"sha256":"0x…","chunk_sha256":["0x…", …]}
```

| 字段 | 说明 |
|---|---|
| `path` | 列表文件路径，也要列进 `tapeout.files` |
| `size` | 32 × `ceil(文件 size / 24000)`，≤ 8,400,000 |
| `sha256` | 整个列表文件的 sha256 |
| `chunk_sha256` | 列表文件本身每 24,000 字节一块的哈希；一块装 750 个块哈希 |

- 列表文件的内容：每个数据块 sha256 的 32 字节原值，按顺序拼起来。
- 信任链：签名 → 列表文件的块哈希 → 数据块的哈希 → 数据字节。
- 一个文件最多 16 段，约 134 MB。

## 签名

规范化（把对象写成字节串 C）的规则：

- 键按 UTF-16 码元升序（ASCII 键下就是字节序）；
- 没有任何空白；
- 字符串只转义 `"`、`\` 和 U+0000–U+001F，一律写成 `\u00XX`（小写十六进制），其余按 UTF-8 原样；
- 整数用十进制，无前导零、无 `+`。

步骤：

1. 删掉 `tapeboot.sig`，按上面的规则规范化，得到 C。
2. 摘要 `D = sha256(C)`，32 字节。
3. `sig` 是持有人对 D 做 EIP-191 `personal_sign`：消息是 `"\x19Ethereum Signed Message:\n32"` 接 D，再 keccak256。
4. `sig` 写成 `0x` + 130 位十六进制：r、s、v 依次拼接，v 是 27 或 28。
5. 验证：从 `sig` 恢复出地址，等于固化的 `holder`（不分大小写）。s 必须在曲线阶的下半部分，否则拒绝。

链上存的已经是规范化形式，所以板端不用建解析树：把原文里 `,"sig":"0x…"` 这一段去掉再算 sha256，结果和上面相同。

## 校验顺序

设备全部做完才算这份 manifest 可用：

| 步 | 核什么 |
|---|---|
| 1 | 频道指针的 `manifest_sha256` = 取到的 manifest 的 sha256 |
| 2 | 能解析；`v = 1`；`board`、`seq` 和路径一致；`compress` 都是 `none`；`min_loader` ≤ 本机版本 |
| 3 | `owner` 四项 = 固化的信任根 |
| 4 | 签名恢复出的地址 = 固化的 `holder` |
| 5 | `seq ≥ min_seq`（microSD 上记的最近一次成功启动的 seq） |
| 6 | 本地有上一版 manifest 时，`prev` = 它的 sha256；没有（新装、跳版本）时只做 1–5 |
| 7 | 每一块按 `chunk_sha256` 核，每个分段、每个文件按 `sha256` 核 |

- 有多个来源时，第 1–6 步对每个来源整套做。一个来源不过就换下一个。
- 任何一步不过，这份 manifest 当没读成，继续用当前槽。部分通过的文件不写进槽。
- 整个文件通过之前，一个字节都不交给写入目标。

## 两种读法

| 读法 | 谁用 | 规则 |
|---|---|---|
| 完整方式 | 主机、网页、打包工具 | 钉在已终局块，验 `eth_chainId`，至少 2 个独立运营方完全一致，只发只读方法；另外用链上登记的 `fileInfo.sha256Hash` 和 `parts[].sha256` 对账 |
| 设备方式 | 板子 | 可以只连一个节点、不钉块、不投票。签名加逐块哈希使节点只能造成失败或受控降级。应配 2 个以上节点 |

取字节：先 `fileInfo(container, path)` 拿大小，再 `readRange(container, path, offset, len)`。`offset` 和 `len` 是 24,000 的倍数（最后一块除外）。兜底走 `https://<tape 名>.tapekit.org/<path>` 网关，只能用在设备方式下。

## 槽和回滚

| 项 | 规则 |
|---|---|
| 块缓存 | microSD 上 `cache/<chunk_sha256 去掉 0x>`；同一块跨文件、跨版本复用 |
| 槽 | `slot/a/`、`slot/b/`，各存一份完整的 manifest 和文件 |
| 状态 | `state.json`：`{active, pending, min_seq}` |
| 提交 | 新版装进不在用的槽、标 `pending`、试运行；60 秒内有心跳就 `active` = 新槽，`min_seq` = 新 seq |
| 回滚 | 没心跳就回旧槽，新 seq 记为坏版本，不再自动尝试 |
| 主动回滚 | 频道指针可以指更旧的 seq，但不能低于 `min_seq` |
| 回滚指令 | 退到 `min_seq` 以下要持有人另签 `rollback/<seq>.json`，见下 |

```json
{"tapeboot":1,"board":"…","kind":"rollback","to_seq":5,"new_min_seq":5,"nonce":<seq 的下一个值>,"sig":"0x…"}
```

签法同 manifest。验签通过、`nonce` 大于见过的最大 seq，就把 `min_seq` 降到 `new_min_seq`。v1 的板端客户端可以不实现这一条。

## 客户端 API

| 函数 | 做什么 |
|---|---|
| `tb_init(cfg)` | 固化信任根、节点列表、网关、缓存目录 |
| `tb_resolve(channel)` | 读频道 → 取 manifest → 校验第 1–6 步 |
| `tb_plan(manifest)` | 对照缓存列出缺的块 |
| `tb_fetch(manifest, file, sink, progress_cb)` | 按块取回、核哈希、写缓存；整个文件通过后才按顺序交给写入目标 |
| `tb_stage(manifest)` | 全部文件取完后写进待装槽、标 `pending` |
| `tb_commit(manifest)` | 启动成功后提交 |
| `tb_rollback()` | 回到旧槽 |
| `tb_status()` | `{seq, slot, pending, min_seq, last_error}` |

错误种类：`transport`、`not-found`、`bad-manifest`、`wrong-owner`、`bad-sig`、`old-seq`、`bad-prev`、`loader-too-old`、`chunk-mismatch`、`file-mismatch`、`no-space`。

## 已知限制

1. 设备方式下，一个节点能把设备指向更旧、签过名、且不低于 `min_seq` 的版本。
2. 持有人私钥丢了或容器转手，设备不再认新版本，要重新烧引导固件。
3. 单份 manifest 的块哈希最多管约 48 MB。
4. `created`、`version` 只给人看，不参与新旧判断。
5. v1 不压缩。

> 怎么一步步用，见[从链上取固件](../machine/tapeboot.md)。
