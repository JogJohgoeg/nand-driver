# INT-C16 独立复核（claude-h3b，2026-10-06 UTC）

复核对象（SHA-256，开始与结束时一致）：`INT_SPEC.md 36f1572f…`、`int_model.c c87b344f…`、`int_reference.py 682cfc95…`、`int_demo.js a38676b5…`、`int_estimate.py 099ee45c…`、`evidence/integer/model.bin 5a841573…`、`evidence/integer/chip.json`（本次读到的版本）、离线页 `nand-llama-research/docs/index.html 3bfb3377…`。开始时的完整清单见 `sha256_start.txt`。复核期间 H 重新生成了 `evidence/integer/c*_prompt*.json`（23:40 EDT）。下面的对拍针对重生成后的文件，它们的 `c_sha256` 现在都是 `c87b344f`。`int_demo.html` 在复核期间也改过（b89adafd→4f263f79），但已发布页的内嵌引擎与 `int_demo.js` 逐字节相同。

## 结论

**中文。** 我只读了 INT_SPEC.md，另外参考了 model.json 和 int_export.py 里的 blob 布局，然后写了净室 Python 实现 `cleanroom.py`。整数运算用 Python int，三值点积用 numpy int64，全程不用浮点。第一次运行就与 H 的 C 逐位一致：18 组前向（11 组 H fixture，外加 7 组新输入：随机、PAD、EOS、32 个相同 token）的全部 logits 和 6 段层状态 trace 都相同；C16 生成 6 条（贪心和 T=0.8 top-40 各 3 条提示词）全长与 H 的证据相同；6000 次 pick 中 C 与净室结果一致，其中包括大量并列 logit 和超出 exp 表截断的情形；5 种把尺度改到极值的压力 blob 下，饱和路径和饱和计数也相同。规范的**数值规则**足以重建出逐位相同的模型。不过有一批**结构信息只能从 exporter 或 C 推断**（P2），要让门级网表只依赖规范，必须把它们写进规范。另外发现 1 处规范与 C 在极端边界上不一致（P1）。现有数据上它触发不到：512 篇故事中饱和前的最大值是 237626，远小于 524287，所以不影响已报告的结果。状态复算 94,800 LATCH 与 H 完全一致。cycles 复算 182.2M/token，H 是 187.7M，多出的 3% 来自 A8 次数按 6×128 估算，方向偏保守。演示页确实离线、自校验真实有效，390 px 宽度下没有横向溢出，生成文本与 C 证据相同。

**English.** Using only INT_SPEC.md (plus the blob layout from model.json/int_export.py), I wrote a clean-room integer Python engine. It matched H's C bit for bit on the first run. Coverage: 18 forward cases (logits plus all 6 layer-state traces), 6 full-length C16 generations (greedy and sampled), 6,000 pick() cases (including ties), and 5 saturation-stress blobs. The numeric contract is complete enough to reproduce the model. Structural facts (blob layout, block order, matrix order, norm indexing, window/RNG conventions) are only implicit and must be added before a netlist can depend on the spec alone. One spec≠C edge exists: C does not saturate KV dequantization. It is unreachable on the shipped weights and data (max pre-saturation 237,626). State recount matches H exactly (94,800 bits). My cycle recount is 182.2M vs H's 187.7M per C16 token; H is about 3% conservative. The offline page has no external subresources, its load-time self-check is real, it works at 390 px width, and its generations match C.

## 问题清单（按严重度）

| # | 严重度 | 位置 | 问题 | 复现 |
|---|---|---|---|---|
| P1 | 中（潜在的规范与 C 不一致，现有数据触发不到） | `int_model.c:100`、`int_model.c:108`；对照 `INT_SPEC.md:34`、`int_reference.py:57`、`int_demo.js:34` | 规范要求 KV 反量化为 `S(R(q*m,127))`，Python 和 JS 都做了饱和，C 只做 `int_rne(q*m,127)`。当同一头内的 m=524288（有一个值是 −524288）且另一个值 ≥522224 时，q=127，反量化得 524288，大于 524287。此时 C 与另外两个引擎不同。512 篇故事饱和次数为 0，最大值 237626，所以触发不到。但如果门级网表照规范实现，与 C 就不在全输入域上等价。建议 C 加上 `sat()`，并补一个 K/V 饱和向量的 golden。 | 算术：`R(127*524288,127)=524288`。阅读 `int_model.c:100`。压力 blob 也没触发：`python3 stress.py` |
| P2 | 中（规范缺项，网表只依赖规范时会卡住） | `INT_SPEC.md:20-41, 49-62` | 以下信息只能从 exporter、model.json 或 C 得到：①blob 格式（magic `TC16I001`、字段顺序、偏移、小端；三值码 0→0、1→1、2→−1、3 非法，每字节 4 个、低位在前）；②矩阵顺序 q,k,v,o,gate,up,down，`[out][in]` 行主序；alpha 每矩阵一个，共 35 个；③norm 行号：第 l 层 n1=2l、n2=2l+1，最终层=10；cos/sin 下标为 `[pos][pair]`，pair i 对应 (i, i+16)；④块结构：pre-norm；Q/K/V 共用 n1 的同一个 A8；Q 只做 RoPE、不量化；注意力输出对整条 D 向量做 A8 再接 O；ff 对整条 F 向量做 A8 再接 down；最后 RMSNorm 后接共享头；⑤每头取 32 维连续片段，h*32…h*32+31。我是按常规 Llama 写法猜对的，没有逐条写进规范。 | 读 `INT_SPEC.md`，对照 `int_export.py:31-52` |
| P3 | 低到中（规范缺项，影响生成与 PPL 复现） | `INT_SPEC.md:57, 66-73` | ①采样权重写的是“R(5*(max-logit),4) followed by EXP”，没说明 EXP 是完整的指数算子（还要再做 `R(·,64)` 和 j>1024→0），还是直接用表下标。C 和 JS 用的是前者。②xorshift 是先更新再使用（用更新后的状态），种子 260500+prompt_id，这些只写在 `int_run.py:100` 和页面里。③累积选取的比较方式是 `at < w_i`（严格小于），即累积和严格大于 target 的第一个，规范没写。④生成窗口是 `ids[-C:]`（BOS 会滑出窗口），评分窗口是 `ptq.windows`（首窗口为 C，之后步长 C/2，并有 skip），规范只说“sliding-window convention”。 | `python3 compare.py gen 200 1 0,1,2` 复现时必须照这些约定实现 |
| P4 | 低 | `int_model.c:46-63`、`int_run.py:33`；对照 `INT_SPEC.md:25` | 规范说“integer inference accepts only the hashed exported artifact”，但 C 的 `int_init` 只检查长度、magic、三值码和尺度范围，不校验 SHA-256，`int_run.py` 加载时也不校验，只有浏览器页面校验。我的压力测试正是利用这一点把改过的 blob 喂给了 C。建议在规范里写明校验由谁负责，或在 C 的 harness 中校验。 | `python3 stress.py`（改过的 blob 被 C 接受） |
| P5 | 低（cycles 偏保守） | `int_estimate.py:58` | `quant_inputs=5*t*(6*128+336)`。按规范每个“层×位置”最少需要 4 次 D 向量 A8（KV 阶段 n1、查询阶段 n1、注意力输出、n2）加 1 次 F 向量 A8。C 实际做了 5 次 D 向量 A8，因为 KV 阶段的 K 和 V 各量化一次。H 多估了 5.47M cycles（C16 约 3%），方向保守，不是错误。 | `python3 review_estimate.py` → `cycles_parts.dynamic_a8` |
| P6 | 低（状态清单缺一项） | `int_estimate.py:96-98` | 采样所需的 top-40 列表（40×(32 位 logit + 8 位 id)，若同时缓存权重再加 40×17 位）没有单列。只用 2048 位的 misc_workspace 不够（2280 位）。但输出头阶段 KV 阵列已经不用了（32768 位），可以复用，所以总 LATCH 不必增加。建议在调度里写明这一复用。 | `estimate_recount.json` → `state_mine.misc_remaining=-264` |
| P7 | 信息（优化机会，不是错误） | `INT_SPEC.md:34`、`int_estimate.py:68-70` | 规范要求“每次读取时反量化”，于是每个（查询，键）对、每头 32 维都要多做一次乘法和一次除法，C16 下约 45.96M cycles，占 187.7M 的 24%。这是 LATCH 最省的做法：若改存 20 位反量化值，要多约 49K 位。降低方法是专用的 `/127` 常数除法，或在 v2 合同里改成 `R(m*Σ Q·q,127)`。后者会改变数值，需要重测质量。 | `estimate_recount.json` → `dequant_on_read_cycles_C16` |
| P8 | 信息（证据流程） | `int_browser_check.js:22`、`int_browser_check.js:35` | H 的 Node 生成核对只比对前 24 个 token。`sampling.json` 如果不存在，pick 检查会被静默跳过（这次文件存在）。我用页内引擎补做了全长核对，12 条全部相同。 | `node review_browser.js gen16`；gen32 见下面的说明 |

我的实现中没有发现自身错误：首次对拍即全部一致，没有需要按“我实现错”归类的差异。

## 净室对拍结果

- `parity_logits.json`：18/18 组 logits 和 trace 与 C 相等，其中 11 组 H fixture 也与其记录值相等；6000/6000 次 pick 与 C 相同。
- `parity_gen_s0_p0/p1/p2.json`、`parity_gen_s1_p012.json`：C16 贪心生成 200/113/200 个 token，采样生成 69/20/89 个 token（遇 EOS 停止），与 `evidence/integer/c16_prompt*_*.json` 全长相同；同一份 logits 上 C 的 `int_pick` 与净室结果一致。
- `parity_stress.json`：alpha、escale、norm 分别取最大值、norm 取最小值，以及三者同时取最大值，共 5 种 blob。饱和计数分别为 8029、0、2151、2488、30766，C 与净室完全相同，logits 和 trace 也全部相同。

## 状态与 cycles 复算（C16，逐层前缀重算）

LATCH 一致，共 94,800 位：前缀 X 40,960；token FIFO 128；单层 KV 码 32,768；KV 最大值 2,560；2 条 D 向量加 1 条 F 向量 11,840；scores 512；exp 272；ff 的 A8 码 2,688；misc 2,048；运算寄存器 1,024。我逐步核对了生命周期：n1 写 H 后原地 A8；K、V 依次写 A；查询阶段 Q 在 A，注意力输出写 H，O 写 A；残差直接覆盖 X[t]（本层 KV 已在此前全部生成）；gate/up 成对写入 F；down 写 A。按这个顺序，2 条 D 向量加 1 条 F 向量就够用。a8_scratch 和 exp 两项还可以原地复用，即 H 的估计偏保守。cycles 方面，13 项中有 11 项与 H 公式逐项相等，差异只在 dynamic_a8（P5）和 sampling（3.2 万，可忽略）。我把解析得到的除法次数与对净室 `R` 调用的插桩计数对照：扣除“每次读取时反量化”带来的 153,600 次之后完全吻合，见 `divisions_match_after_dequant_adjust=true`。按 H 的预算，10 MHz 下约 18.8 s/token。

## 演示页检查

- 离线：已发布页 `docs/index.html`（3bfb3377，与 INT_C16.md 声明的线上哈希相同）内嵌引擎与 `int_demo.js` 逐字节相同，内嵌 blob 与 `model.bin` 逐字节相同，内嵌的 INT_SPEC.md 也与当前版本相同。页面没有外部 script/link/img，也没有 fetch、XHR 或 WebSocket，只有两个普通超链接。我在 headless Chrome 中把所有 DNS 解析设为失败，再用 file:// 打开：2.7 s 后显示“逐位校验通过 · OFFLINE”，整个过程非本地请求数为 0（`browser_review_mobile.json`）。
- “浏览器与 C 逐位一致”确实被检查过：页面启动时用 SHA-256 核对 11 组 C golden 的 logits 和 trace，失败就禁用生成。我在 Node 中运行从页面抽出的引擎，17 组完整 logits 数组都与 C 相等，6 组新输入的 trace 也相等；6000 次 pick 相同；C16 和 C32 共 12 条生成全长相同，并包括前端分词结果与 stories.json 中的 token 相同。
- 手机宽度：通过 CDP 模拟 390×844 移动设备，`scrollWidth=390`，没有超出视口的元素。点击“开始续写”后生成 120 个 token，每步约 33 ms，文本与 C16 贪心证据的前 120 个 token 解码后完全相同。截图见 `mobile_390_cdp.png`，布局可用。小瑕疵：原 tokenizer 把换行变成 UNK，页面显示为“⁇”，页脚已有说明。注意 headless 模式下 `--window-size` 最小只能到 500 px，单纯截图会被误裁，必须用 CDP 模拟。

## 复现命令（工作目录 `h3/int_review/`）

```
cc -std=c99 -O2 -shared -fPIC -o build/int_model_review.dylib ../int_model.c
python3 compare.py logits                  # 18 组前向（约 4 s）
python3 compare.py gen 200 0 0             # 每条提示词各跑一次：0 / 1 / 2（各约 20–36 s）
python3 compare.py gen 200 1 0,1,2         # 采样生成（约 32 s）
python3 stress.py                          # 饱和压力（约 10 s）
python3 dump_c_cases.py && node review_browser.js static|forward|picks|gen16
python3 review_estimate.py
node mobile_cdp.js                         # 需要本机 Chrome；断网条件下运行
```

运行时间说明：`node review_browser.js gen32` 单次运行 92 s，超出了约 60 s 的单进程约定（只运行过一次）。以后应按文件拆开运行。`build/` 目录（10 MB 的 js_cases.json 和 dylib）可以重新生成，已用 `.gitignore` 排除，不应提交。

## 产出文件

`cleanroom.py`、`compare.py`、`stress.py`、`dump_c_cases.py`、`review_browser.js`、`mobile_cdp.js`、`review_estimate.py`；`parity_logits.json`、`parity_gen_s0_p0.json`、`parity_gen_s0_p1.json`、`parity_gen_s0_p2.json`、`parity_gen_s1_p012.json`、`parity_stress.json`、`browser_review_{static,forward,picks,gen16,gen32,mobile}.json`、`estimate_recount.json`、`mobile_390_cdp.png`、`sha256_start.txt`、`.gitignore`、`REVIEW.md`。
