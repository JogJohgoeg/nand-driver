# 从链上取固件

> 模型机开机时从 tape 容器取回运行时和模型：先验签名，再逐块核哈希，核不上就退回上一个能用的版本。

## 为什么不用信节点

- 持有人对一份 manifest 签名。manifest 里写着每个文件、每 24,000 字节一块的 sha256。
- 设备只收这样的字节：签名对得上固化的持有人地址，序号不回退，每一块哈希都对得上。
- 给数据的节点或网关撒谎，最多让下载失败，不能让设备收下错字节或没签过名的版本。

## 设备里固化什么

| 项 | 用途 |
|---|---|
| `chain_id`、`registry`、`container` | 去哪条链、哪个容器读 |
| `holder` | 持有人地址，只认它签的 manifest |
| `board` | 板子名字，如 `mm-tang20k` |
| `min_seq` | 记在 microSD 上：最近一次成功启动的序号 |

## 链上放在哪

```text
tapeboot/<board>/channel/<channel>.json   频道指针（stable、beta …）
tapeboot/<board>/<seq>/manifest.json      manifest（签过名）
tapeboot/<board>/<seq>/<file>             文件；超过 8,400,000 字节的拆成 <file>.p0、<file>.p1 …
```

## 1. 取回

1. 读频道指针，得到 `seq`、manifest 路径和 `manifest_sha256`。频道指针不签名，只是「建议读哪一份」。
2. 取 manifest，算它的 sha256，和频道指针里的比。对不上就当没读成。
3. 对照 microSD 上的块缓存，列出缺的块。缓存里已有的块不再取，所以升级只取改过的块，断电后再开机接着取。
4. 用 `fileInfo` 拿大小，用 `readRange` 按块取。偏移和长度都是 24,000 的倍数（最后一块除外）。

节点读不成就换下一个。最后兜底走 `https://<tape 名>.tapekit.org/` 网关，网关给的字节一样要核哈希。

## 2. 验签名

1. manifest 能解析，`board`、`seq` 和路径一致，引导固件版本不低于 `min_loader`。
2. manifest 里的 `owner` 四项（链、registry、容器、持有人）和固化的一致。
3. 从 `sig` 恢复出地址，等于固化的 `holder`。签名方法见 [TapeBoot 规范](../reference/tapeboot.md#签名)。
4. `seq` 不小于 `min_seq`。
5. 本地有上一版 manifest 时，`prev` 等于它的 sha256。

## 3. 核哈希

1. 每收到一块，先和 `chunk_sha256[i]` 比。对不上就丢掉，换节点重读。
2. 收齐后再核每个分段、每个文件的 sha256。
3. 整个文件通过之前，一个字节都不写进槽、FPGA 或 DDR3。

每个分段的结论和 tapemule 一样四种，只有 `verified` 能用：

| 结论 | 含义 |
|---|---|
| `verified` | 字节的 sha256 和 manifest 写的一致 |
| `unverified` | 链上没登记指纹 |
| `incomplete` | 长度或哈希对不上，或者某块没读成 |
| `missing` | 链上没有这个路径 |

## 4. A/B 槽和回滚

1. microSD 上有两个槽 `slot/a/`、`slot/b/`，`state.json` 记 `{active, pending, min_seq}`。
2. 新版装进不在用的那个槽，标 `pending`，重启试运行。
3. 60 秒内收到软核的心跳：提交。`active` 改成新槽，`min_seq` 改成新 seq。
4. 没收到：回到旧槽，新 seq 记为坏版本，不再自动尝试。
5. 没网时直接从 `active` 槽启动。

想主动退回旧版本：频道指针指向更旧的 seq 就行，但不能低于 `min_seq`。要退到 `min_seq` 以下，持有人另签一份回滚指令。

## 已知限制

- 设备只连一个节点时，节点能把设备指向更旧、签过名、且不低于 `min_seq` 的版本。配多个节点可以缓解。
- 持有人私钥丢了或容器转手，设备就不再认新版本，要重新烧引导固件。这是有意的：不留后门。
- 单份 manifest 的块哈希最多管约 48 MB。
- v1 不压缩。

## 在小电脑上

没有 FPGA 的 ARM 小电脑上，TapeBoot 是一个 Linux 程序，取回、校验、A/B 槽都同上：

- 文件都装到本地存储，比特流和操作系统类文件跳过。
- 运行时每秒往管道写 1 字节代替邮箱心跳。
- 运行时起来后先上报「设备身份、本次启动 ID、操作 ID」，三样都对才提交，否则回滚。
- 同一个 seq 已经成功或失败过，再下发也不重做；做到一半的接着做。

> 规范是草案 v0.3。参考实现（TS）、板端 C 客户端和测试向量还没放进公开仓库。
