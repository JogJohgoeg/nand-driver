# 一步模型 v0 — 链上最小语言模型（One-step LM）

**主信息**：一个纯组合 TapeOut 网表，输入 = 最近 K 个字符，输出 = 下一字符；一次 `step()` 出一个字符，无 latch，门数塞进一笔交易。目标：成为第一个在链上一步可达、gas 可接受的语言模型。
**关联上下文**：计费 52k + 1,921·NAND + 6,705·LATCH，深度免费、calldata 输入便宜（16 gas/字节）。区块上限约 29,800 NAND；理想 ≤ 4,300 NAND（≈8M gas）。权重必须固化进拓扑（DLGN），不能进 latch。MiniCPM 与此无关，仍走乐观结算。
**下一步判断**：先出一个能实测 gas 的 v0（哪怕质量只到 3–4-gram 水平），再用同一流程放大到区块上限，比较"质量 vs gas"曲线，用户据此定档。

## 接口（冻结）
- 字母表 64 符号（6 位）：空格、a–z、A–Z 折叠为小写、数字、`.,;:!?'"-()\n` 及若干保留位；映射表写在 `alphabet.json`。
- 输入 nIn = K×6，K = 32（192 位），最旧字符在低位；不足 K 时前补空格。
- 输出 nOut = 6：下一字符的 argmax（贪心）。v0 不采样、不输出分布。
- latch = 0。编码用 SEMANTICS.md 的官方 7 字节 NAND 记录，last_outs 约定。

## 训练（m64，RTX 4080）
- 模型：可微逻辑门网络（difflogic / dlgn_llm 里已有的实现），输入 192 位，若干层每层 N 个二输入门，末端每个输出位一个 group-sum 或直接用 6 个独立分类头再做 argmax 的逻辑化版本；目标门数 ≤ 20k（编译后 NAND 会再变，先看比例）。
- 语料：TinyShakespeare 或同量级英文文本（约 1 MB），90/10 切分。
- 指标：held-out 下一字符 top-1 准确率；与 bigram/trigram 基线比较。基线本身也可编译成网表作为最小对照。

## 编译与验证
1. DLGN → NAND：复用 dlgn_ctrl/dlgn_llm 的 compile 流程，再走 `tt/netlist/rtl_to_netlist.py` 同款 `yosys_nand.synth + abc -g NAND`；无关项精确最小化只在输入域受限时可用，这里输入域是全空间，主要靠综合。
2. 位精确：Python 参考模型（训练后的离散 DLGN）与网表在 ≥10⁶ 随机上下文 + 全部 held-out 上下文上逐位一致（`golden.Netlist`）。
3. gas：`estimateGas` 只读，针对用户 CPU 0x6Fb4089e7Cbaa9660Fd11056274Cbd8117EE5B38；报 NAND 数、模型 gas（拟合）与实测 gas。不发交易。
4. 演示：用 Python 参考模型生成 200 字符样本（贪心），附在报告里。

## 交付
`onestep_lm/{alphabet.json, train.py, model_v0.json, netlist_v0.json, verify.json, gas.json, REPORT.md}`；REPORT 按三问骨架。bd：tp-2ea.11（训练）、tp-2ea.12（编译/验证/gas）。

## 不做
- 不做多步、不做 latch 状态（v1 再加可塑快权重）。
- 不碰 tt/ 冻结目录、不改演示页（Claude 维护）。

## 台阶（用户定位 2026-09-14：一步模型是目标；先证明"足够多门的网表可以一步出结果"，链的进化会让它可负担）
- v0 ≤ 4,300 NAND：可挖，≈8M gas/步（tp-2ea.11/.12）。
- v1 ≤ 29,800 NAND：单笔交易上限，给出质量–门数–gas 曲线。
- v2 10⁵–10⁶ NAND：不可挖，但用 `eth_call`（本地节点或放宽 gas cap 的 RPC）真实执行一次拿到结果，证明一步可达性与区块上限无关；同一网表在链进化后自动可挖。质量目标在这一级才开始像样。
每级交付同一套：netlist、verify、gas（拟合 + 实测或 eth_call 记录）、REPORT。
