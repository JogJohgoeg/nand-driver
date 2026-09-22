# 如何做一个自己的大脑

首屏「换大脑 · URL / 本地文件」负责推理网表；工作区「导入文本」只是虚拟文件系统。文件只留在本浏览器，不上传、不上链。URL 资源必须允许 CORS；容器阻止跨来源时，把文件下载后多选即可。

## 最小例子：recall_latch

先在「换大脑」点击「下载最小记忆电路」，再选择下载到的 `recall_latch.json`（也可用仓库 `circuits/_scratch/latch_ssm/recall_latch.json`），不需要分词器。这是 `build.py` 的 `build_recall()` 生成的确定性记忆电路，144 个元件 = **138 NAND + 6 LATCH**，不是聊天模型。

在「逐拍门级输入」输入 `14 9 3 3 15`，点击「从零状态运行」，输出依次是 `0 0 0 0 9`。14 是 MARK，记住下一拍；15 是 QUERY。状态每拍同时更新。重复点击从零状态开始。这里只做短验收，不在本机跑 build.py 主程序的长扫描；重新综合/大验证要用 `tools/remote/rrun`。

也可将原文件的 `nl_hex` 转成 bytes 保存为 `records.bin`，去掉 `nl_hex`，另存 `netlist.json`：

```json
{"nIn":4,"nOut":4,"nNand":138,"nLatch":6,"records":"records.bin","recordsFormat":"raw","outputMode":"bits","tokenizer":{"type":"integer"}}
```

同时选择两个文件即可。原始 recall JSON 自带 nl_hex，所以支持单文件。

## 编码契约

- wire 0/1 为常量；输入从 wire 2 起，输入与输出都 LSB-first。
- NAND：`00 a24 b24`，7 字节，线号大端；只能引用已经计算的线。
- LATCH：`01 d24`，4 字节，吐上一拍状态；D 可以向前引用，但不可越界，整轮算完后同时采样。
- 输出是最后 nOut 个元件。元件数、完整字节、操作码、线号、哈希（可选 recordsSha256）加载前校验。
- raw 可放在 `.bin.gz`；加载后每资源最多 128 MiB，线号最多 24 位。网页不执行网表附带的 JS。任意合法位电路可逐拍运行；聊天另需匹配下述 token 协议。

## 做聊天大脑

提供 `netlist.json`、records、HuggingFace `tokenizer.json`、`tokenizer_config.json`；top-index/escape18 再提供 `top8192.json`（路径用 `top` 指定）。同目录多选；URL 从清单地址解析相对路径。分词器与 records 都是数据，JS 始终来自本站。

- `outputMode: "top-index"`：nOut 位索引，top 长度 2^nOut。
- `outputMode: "token-id"`：输出直接为 token ID。
- `outputMode: "escape18"`：18 位，bit17=1 时低17位直接是 token ID，否则低13位查 top。
- 递归输入：`tokenBits`（或 wrappedFrom.width）位 token，其后随机位、可选 wrappedFrom.extra=1 的生成控制位。控制位最高，预填充为0、生成时为1。
- 无状态兼容输入：6×17 位 token，最多8个随机位。
- 当前 Pi 适配器采用 MiniCPM 的聊天控制 token（`</think>`=9、`<|im_end|>`=130073、EOS=1）；替换词表必须保持这些控制 ID 与模板语法。可用 `chatTemplate` 指定兼容的本地 Jinja 文件；否则使用本站模板。
- 换入任意网表不意味着它会自然对话或工具调用。先用逐拍面板与 `latch_ssm/nlrun.js` 对拍，再测试聊天。现有核心的自然问答能力仍有限。

校验失败不保存选择。成功需确认重载；IndexedDB 保存 File 对象，不会把大文件塞进 localStorage。换 origin 要重新选择。本地存储被清理后回到默认 URL。

## 内置演示 / Built-in demonstrations

首屏可以直接切换默认大脑、144元件recall、10,141元件工具摘要机；仍保留重载确认，不必先下载文件。小脑都是同站点数据，不是额外脚本。摘要机的records与参赛流片产物SHA-256相同：输入22拍结构化捕获fixture，再将本电路输出回馈90拍；不是让小电路理解自然语言。输出token ID、输入整数和112拍全部可回看。

Use the preset buttons, confirm reload, then run the tick demo. Recall should return `0 0 0 0 9`. The tool summary records structured input and replays its own output for 112 ticks; it is not a chat model. Select any recorded tick to inspect its actual state transition. Return to Default for the real keyboard tool-call demonstration.

门级观测不改变求值器：耗时是一次`nl.step`，统计所有LATCH翻转，最多展示前1024位（默认643与摘要机558均完整显示）。生成每拍上报；预填充每64拍及末拍采样，不能当成每一拍的历史录像。tokens/s只计生成阶段由网表采样的非EOS token，不含预填充和JS插入的聊天控制token。浏览器计时器读数为0时显示低于计时精度；停止后不继续动画。

The gate inspector uses real before/after state, never a simulated animation. Timing covers evaluator work only. Rate excludes prefill and wrapper tokens; manual bit circuits have no token rate. No persistent model-cache or instant-second-visit guarantee is made.

## TapeOut identity

页面给出本地验证→导出字节与独立对拍→核对已部署处理器和余额→用户预检与按需铸造→用户签名→发布真实回执的步骤；本站不连接钱包，也不是面向第三方的通用签名器。默认processor/circuitId为空，累计已铸显示待部署，不发RPC或伪造0。

发布者只改`brain/bench-deployment.json`对应源文件的真实processor/circuitId并重建。只读刷新核对链196、同一区块的处理器代码、晶体管地址、上限与电路尺寸。配置已预置监督者09-22核验的`supplyCap()=0x8f770ad0`及`minted()=0x4f02c420`；后者为NAND/LATCH合计**累计铸造总数**，不是余额或烧毁后现存量。核验实现为`0x265bf10faB9ddEC0eE0A649C6B9DB845f1b9a06b`，beacon为`0x1059Ad62cAbB6a6925bb65aA617300556c60A51B`。RPC失败明确报错，不伪造0；读数不是合约审计，实际部署后仍需对本项目的真实地址复验。
