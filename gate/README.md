# 门电路版 BitCPM4-1B（浏览器 WebGPU 生产包）

浏览器下载权重后，在本机现场生成整个 BitCPM4-1B 的 NAND / LATCH 门电路网表，并用 WebGPU 逐位执行它来对话。每个 token 约需 1.4 × 10¹² 次 NAND。
- 带工具定义时，工具调用由门内的 K6 摘要机生成（工具不执行）。
- 文字 ↔ 编号由原 tokenizer 在宿主完成。

## 部署
1. **代码**：把本目录（`gate-brain.mjs`、`exec/`、`core/`、`gen_ir/`、`tok/`、`demo.html`）原样放在**与页面同源**的位置。生成与缓存用 module worker，worker 脚本必须与页面同源。
2. **权重**：把权重目录（`manifest.json`、`chunk-000.bin` … `chunk-035.bin`、`SHA256SUMS`）上传到 `https://nand.aihashrate.stream/gate-weights/`，共 38 个文件、约 748 MB，每个 ≤ 20 MiB。
   - 如果从别的来源（如 Pages 镜像）读取，托管端要返回 `Access-Control-Allow-Origin`；
   - `.bin` 用 `application/octet-stream`；
   - 建议 `Cache-Control: public, max-age=31536000, immutable`：内容由 SHA 钉住，改版会换清单。
3. **打开**：`demo.html`。可选地址参数：`?w=<权重基址>`、`?C=512`。

## 接口
```js
import { createGateBrain, precheck } from './gate-brain.mjs';
const brain = createGateBrain({
  weightsBase,          // 默认 https://nand.aihashrate.stream/gate-weights/
  C: 128,               // 128（默认）或 512（长回答模式）
  workers: 2,           // 生成 worker 数；1 更省内存、冷启动慢约 90 s
  cache: true,          // 本机缓存（OPFS）；空间不足时自动不用
  confirmLong: false,   // 浏览器不报告内存时，是否允许开长回答模式
  onEvent,              // 见下
});
await brain.ready;                                                   // 失败时 reject 一个 GateError（有 code 与人话 message）
const r = await brain.ask(messages, tools, { onToken, signal, maxTokens: 256 });
// r = { text, rawText, ids, promptIds, stop, toolCall, firstTokenMs, msPerToken }
//   stop：'eos' | 'max_tokens' | 'capacity' | 'tool_truncated' | 'tool_aborted' | 'stopped'
//   toolCall：{ name, arguments, xml } 或 null
brain.stop();                 // 中止当前回答（下一拍前生效；也可用 AbortSignal）
await brain.switchToLong();   // 释放 C128、加载 C512（长回答模式），之后用同一 messages 重问
brain.capabilities;           // { C, maxPromptTokens, maxNewTokens, tools, longMode, memoryEstimate, warm }
brain.dispose();              // 释放 GPU
```
- **messages**：`[{ role, content }]`，照官方对话模板渲染（不加 BOS）。
- **tools**：OpenAI function 格式数组，照 R64 的格式写进 system 消息的 `<tools>` 块；没有 system 消息时须自己加一条。
- **onToken**：`{ id, text, tool }`，其中 text 是到目前为止的完整解码。

**事件**（`onEvent(e)`）：

| type | 字段 | 含义 |
|---|---|---|
| `precheck` | `rows[]`（ok、what、detail）、`hard`、`longMode` | 设备检查（人话） |
| `progress` | `stage`：`cache` / `download` / `generate` / `upload` / `prompt`，`done`、`total` | 准备与读提示进度 |
| `ready` | `C`、`warm`、`prepMs` | 可以提问 |
| `token` | `id`、`text`、`tool` | 逐 token |
| `capacity` | `C`、`canSwitchLong`、`message` | C128 写满：提示用户，可一键 `switchToLong()` 后重问 |
| `warning` | `code`（`cache_invalid` / `cache_failed` / `cache_write_failed`）、`message` | 缓存问题已自动回退，本次不受影响 |
| `error` | `code`、`message` | 见下表 |

**错误码**：

| code | 情况 |
|---|---|
| `no_webgpu` / `no_adapter` / `limits` | 设备不满足；没有下载任何权重 |
| `weights_fetch` | 取不到清单或块（含跨源未配 CORS） |
| `chunk_sha` | 块 SHA 与清单不符，拒绝生成 |
| `weights_mismatch` | 权重包与代码版本不符 |
| `prompt_too_long` | 提示超过容量（C128 最多 127 个 token） |
| `long_mode_unavailable` | 设备不满足长回答模式 |
| `busy` / `not_ready` | 调用顺序问题 |
| `gpu_lost` | 显卡设备丢失（驱动重置或内存不足），需刷新 |

## 两种容量（m149：AMD Radeon 8060S 核显，Chromium，R9 / R10 实测）
| | C128（默认） | C512（长回答模式） |
|---|---|---|
| 提示 + 回答 | ≤ 128 个 token（回答另有 256 上限） | ≤ 512（回答 ≤ 256） |
| 浏览器全部进程内存 / 显存 | 约 5.4–5.9 GB / 4.3 GB | 约 7.3–7.5 GB / 6.3 GB（在同一页面由 C128 切换过来时约 7.4–7.8 GB） |
| 冷启动准备（含下载与生成） / 热启动 | 约 195–220 s / 18–25 s | 约 280–295 s / 26–31 s |
| 每 token | 约 1.17 s | 约 2.25 s |
| 本机缓存 | 约 2.1 GB | 约 3.8 GB（两种都用过时两份并存，约 5.9 GB） |

- 长回答模式只在浏览器报告内存 ≥ 8 GB 时可开。浏览器最多只报 8，所以实际规则是「报 8」；不报时需调用方传 `confirmLong: true`。
- C128 写满时 `ask` 以 `stop: 'capacity'` 结束，并发 `capacity` 事件；用 `switchToLong()` 后重问即可。

## 口径与证据范围
- **单元库是预综合的固定资产**：R61 的 36 个模板、R65 的控制器、R63 的 C512 模板、R64 的 K6 与合并选择器（机械转成本执行器的模板约定，不改门）、我方胶合 A″。它们随权重包下载、逐个钉 SHA。「按权重选单元与连线」由浏览器现场生成，与 Python 参照生成器逐字节相同（C128 364 / 364、C512 382 / 382 个文件）。
- **tokenizer 与对话模板是宿主 I/O 边界**：只做文字 ↔ 编号，不参与 embedding / logits / argmax。实现照 `tokenizer.json`，对 R62 25 题、R64 5 题的编号逐个相同。
- **逐位等价的证据**（全部在 m149 AMD RADV 上）：
  - R62 25 题逐拍（C128 20 题、C512 5 题）；
  - R64 五道工具题逐拍（K6 / 选择器每拍每位，以及核心 KV）；
  - 本生产包在新源上复验了 q06、t02、q05。
  - 其他 GPU / 驱动没有做过逐拍对拍，只有本页的预检。
- **工具支持子域**：照 R64 FORMAT，只捕获首个工具、≤ 6 个参数，名字 / 参数名 / 值各 ≤ 8 个 token；非字符串参数输出 `0`（只保证可解析）；名字或值含控制字符及 `& < >` 时不抢占。工具不执行。
- **拍序**与 R64 FORMAT 原文一致：
  - 读完提示后的第一拍是仲裁拍，核心不计算，只放出暂存的首 token 或改由 K6 抢占；
  - 不抢占时核心此后每拍照常出 token；抢占时核心冻结，直到 K6 结束。
  - 注意：K6 的 `core_enable` 只在 prefill 拍为 1，胶合 A″ 按 K6 的 owner 与「上一拍 core_enable」决定核心是否运行。

## 许可证
见 `LICENSES/`：
- BitCPM4-1B 权重与 tokenizer：Apache-2.0，OpenBMB，模型卡原文见 `LICENSES/BitCPM4-1B-README.md`，署名见 `LICENSES/NOTICE`；
- 本包代码与门电路模板：见 `LICENSES/NOTICE`。
- 包内没有第三方 JavaScript 依赖。
