// Page-level language switch. Our own code keeps writing Chinese; this module
// rewrites visible UI text in the DOM. English mode maps Chinese to English;
// Chinese mode maps the pinned upstream English UI to Chinese.
// Never touches the terminal, model/tool output, user input or netlist data.
const SKIP = '.xterm,pre,code,script,style,textarea,select,.cm-editor,[data-no-i18n]';
const ATTRS = ['placeholder', 'aria-label', 'title'];
const CJK = /[一-鿿]/;

// [中文, English]. Whole-string matches first; longer strings also act as
// fragments for text our code assembles at runtime (longest first).
const PAIRS = [
  // Sidebar
  ['大脑与会话导航', 'Brains and sessions'], ['Pi 工作台', 'Pi Workbench'], ['关闭导航', 'Close navigation'],
  ['搜索大脑与会话', 'Search brains and sessions'], ['搜索大脑或会话', 'Search brains or sessions'],
  ['换入网表', 'Load a netlist'], ['可选大脑', 'Available brains'], ['语言网表 · 链下', 'Language netlist · off-chain'],
  ['本次加载时间', 'Loaded at'], ['本次选择时间', 'Selected at'], ['默认大脑', 'Default brain'],
  ['记忆电路', 'Recall circuit'], ['工具摘要机', 'Tool summarizer'], ['工具摘要', 'Tool summarizer'],
  ['当前网表', 'Current netlist'], ['本地或 URL', 'Local file or URL'], ['会话', 'Sessions'],
  ['当前对话', 'Current chat'], ['开始于 ', 'Started '], ['更多', 'More'], ['大脑', 'Brains'],
  // Tabs & top bar
  ['工作台主区', 'Workbench'], ['打开的视图', 'Open views'], ['打开导航', 'Open navigation'],
  ['对话', 'Chat'], ['工具', 'Tools'], ['新对话', 'New chat'], ['切换信息面板', 'Toggle info panel'],
  ['切换为英文', 'Switch to Chinese'],
  // Intro
  ['可换脑工作台', 'Swappable-brain workbench'],
  ['一颗 4,850,702 个晶体管的门级语言大脑（4,850,059 NAND + 643 LATCH），在你的浏览器里逐门运行。',
    'A gate-level language brain of 4,850,702 transistors (4,850,059 NAND + 643 LATCH), evaluated gate by gate in your browser.'],
  ['晶体管池规划发行在 X Layer 上的 TapeOut 处理器（待部署）；你也可以换上自己设计的网表。',
    'Its transistor pool is planned for a TapeOut processor on X Layer (not deployed yet), and you can swap in a netlist of your own.'],
  ['默认大脑只会调用 nand_step 工具，不会自由问答，工具参数也可能不准确。想直接问问题，换左侧的「门电路大脑 · BitCPM4-1B」。',
    'The default brain only calls the nand_step tool; it cannot answer free-form questions, and tool arguments may be wrong. To ask questions, switch to “Gate brain · BitCPM4-1B” on the left.'],
  ['这是恢复的上次对话：其中有工具在运行途中被中断，显示的 Running… 不会再结束。点「新对话」可以清空。',
    'This is your previous chat, restored: a tool was interrupted mid-run, so its Running… will not finish. Click “New chat” to clear it.'],
  ['这是恢复的上次对话。点「新对话」可以清空。', 'This is your previous chat, restored. Click “New chat” to clear it.'],
  ['位电路按位求值 · 不理解自然语言', 'Bit circuit, evaluated bit by bit · does not understand language'],
  ['当前大脑是记忆电路：138 NAND + 6 LATCH 的逐拍位电路。', 'Current brain: the recall circuit, a per-tick bit circuit of 138 NAND + 6 LATCH.'],
  ['当前大脑是工具摘要机：9,583 NAND + 558 LATCH 的逐拍位电路，也是本次准备流片的组件。', 'Current brain: the tool summarizer, a per-tick bit circuit of 9,583 NAND + 558 LATCH, and the component we are taping out.'],
  ['当前大脑是自定义的逐拍位电路。', 'Current brain: a custom per-tick bit circuit.'],
  ['运行记忆电路', 'Run recall circuit'], ['运行工具摘要', 'Run tool summarizer'], ['运行位电路', 'Run bit circuit'],
  ['加载大脑', 'Load brain'], ['约 21 MB', 'about 21 MB'], ['加载中…', 'Loading…'], ['已就绪', 'Ready'],
  ['读清单…', 'Reading manifest…'], ['读取网表…', 'Reading netlist…'], ['校验网表…', 'Verifying…'], ['准备分词器…', 'Preparing tokenizer…'],
  ['加载当前大脑并发送', 'Load brain & send'], ['加载链下网表', 'Load off-chain netlist'],
  ['大脑已在此页面内就绪；刷新后的读取由浏览器缓存决定。', 'Brain is ready in this page; after a refresh the browser cache decides what is re-read.'],
  ['试试这些（默认大脑能跑通的工具调用）：', 'Try these (tool calls the default brain can do):'],
  ['点一下填入输入框，再按 Enter 发送。', 'Click to fill the input, then press Enter.'],
  ['先试上方工具示例；自由问答尚不可靠。', 'Try the tool examples above first; free-form chat is unreliable.'],
  ['试试 nand_step 工具示例。', 'Try the nand_step tool example.'],
  // Tool view
  ['工具与工作区', 'Tools and workspace'], ['示例只填入真实终端，不自动执行。', 'Examples only fill the real terminal; nothing runs automatically.'],
  ['工具示例', 'Tool examples'], ['填入后按 Enter 发送', 'Fill in, then press Enter to send'], ['填入示例', 'Fill example'],
  ['适用于默认大脑；只填入，不自动执行。', 'For the default brain; fills the input only, nothing runs automatically.'],
  ['本次工具返回', 'Latest tool result'], ['工作区文件与 Shell', 'Workspace files and shell'], ['工作区文件', 'Workspace files'],
  ['导入文本', 'Import text'],
  // Inspector
  ['网表及链上信息', 'Netlist and on-chain info'], ['关闭信息面板', 'Close info panel'],
  ['加载大脑后显示网表信息。', 'Netlist details appear after the brain loads.'],
  ['元件', 'Gates'], ['来源', 'Source'], ['待加载', 'not loaded'], ['清单未声明', 'not declared in manifest'], ['未声明', 'not declared'],
  ['来自当前清单；就绪后运行时校验。不是链上证明。', 'From the current manifest, verified at runtime once ready. Not an on-chain proof.'],
  ['无法读取清单：', 'Cannot read manifest: '], ['本地 · ', 'Local · '],
  ['门级状态', 'Gate state'], ['真实门级观测', 'Measured gate state'], ['尚未求值', 'No samples yet'],
  ['NAND + LATCH 元件总数', 'Total NAND + LATCH gates'], ['门', 'Gates'], ['求值与状态采样耗时', 'Evaluation + state sampling time'],
  ['本轮实际生成采样速率；不含预填充和JS包装token', 'Measured generation rate this run; excludes prefill and JS wrapper tokens'],
  ['本拍翻转位数 / 全部LATCH', 'Bits flipped this tick / all LATCHes'],
  ['真实LATCH状态图；文本等价见下面的状态详情', 'Measured LATCH state map; text equivalent in the details below'],
  ['观测说明与真实数据', 'Notes and raw data'],
  ['真实测量，不模拟闪烁。生成逐拍；预填充每64拍采样。速率=本轮网表采样token/生成耗时，不含预填充和JS包装token；ms仅为求值+状态采样，不含差分统计/分词/渲染。',
    'Measured, not animated. Generation is sampled every tick; prefill every 64 ticks. Rate = sampled tokens / generation time, excluding prefill and JS wrapper tokens; ms covers evaluation + state sampling only, not diffing, tokenizing or rendering.'],
  ['门级观测', 'Gate inspector'], ['预填充采样', 'Prefill sample'], ['生成', 'Generation'], ['逐拍回看', 'Recorded tick'],
  ['无状态求值', 'Stateless'], ['已停，保留最后一次实测', 'Stopped · last measured sample'],
  ['正文色=1，灰色=0，强调色=本拍翻转', 'text color = 1, gray = 0, accent = flipped this tick'], [' · 显示 ', ' · showing '], [' · 输出 ', ' · output '],
  ['尺寸待加载', 'Size not loaded'], ['自定义大脑', 'Custom brain'],
  ['当前是位电路，不是聊天模型。打开换大脑面板运行逐拍演示。', 'This is a bit circuit, not a chat model. Open the brain panel to run a tick-by-tick demo.'],
  // Chain identity
  ['链上身份', 'On-chain identity'], ['待部署，未发出 X Layer RPC', 'Pending deployment · no X Layer RPC sent'],
  ['网络', 'Network'], ['处理器', 'Processor'], ['待用户部署', 'pending deployment'], ['电路编号', 'Circuit ID'], ['待用户填写', 'pending'],
  ['规划共池', 'Planned shared pool'], ['NAND/LATCH 不分配额', 'NAND/LATCH share one pool'], ['链上上限', 'On-chain cap'], ['未读取', 'not read'],
  ['累计已铸', 'Minted so far'], ['待部署，未读链', 'pending deployment, not read'], ['只读刷新', 'Read-only refresh'],
  ['仅用 eth_call 等只读方法，不连接钱包、不签名。读数固定在同一区块；合约可升级，快照不是审计。规划共池不代表已经铸造。',
    'Uses read-only calls such as eth_call; no wallet connection, no signing. All reads are pinned to one block; the contract is upgradeable, so a snapshot is not an audit. The planned pool is not the amount minted.'],
  ['把你的大脑流片到这颗处理器', 'Tape out your own brain to this processor'],
  ['先用「换大脑」验证格式、逐拍状态和功能；任意网表不等于会聊天。', 'Use the brain switcher first to check format, per-tick state and behavior; an arbitrary netlist does not mean it can chat.'],
  ['准备 NAND/LATCH 变长字节、nIn/nOut、SHA-256 及独立对拍结果；工具摘要机示例与本次准备流片的组件字节一致。',
    'Prepare the variable-length NAND/LATCH bytes, nIn/nOut, SHA-256 and an independent cross-check; the tool-summarizer example is byte-identical to the component we are taping out.'],
  ['等待真实处理器部署，核对链 196、地址、价格、剩余共池与自己余额；只按需铸造。我们本次摘要机需要 10,141 个，不自铸满、不刷量。',
    'Once the processor is deployed, check chain 196, address, price, remaining pool and your balance; mint only what you need. Our summarizer needs 10,141, and we do not self-mint the pool or inflate volume.'],
  ['由你用兼容的 TapeOut 工具针对这个', 'Use a compatible TapeOut tool to run staticCall and estimateGas against this '],
  ['已有处理器', 'existing processor'],
  ['执行 staticCall 与 estimateGas。本站不是第三方通用流片签名器，不要用创建处理器向导冒充此入口。',
    '. This site is not a general tapeout signer; do not use a create-processor wizard in its place.'],
  ['费用、余额、权限、gas 与区块上限确认后，由你在钱包中签名；真实电路编号只从回执取。大脑分段必须单独设计验证，不能把“60多笔”量级粗估当成方案。',
    'After confirming fees, balance, permissions, gas and block limits, sign in your wallet; take the real circuit ID from the receipt. Splitting the brain needs its own design and verification; the "60-odd transactions" figure is a rough estimate, not a plan.'],
  ['公布真实回执与字节哈希，独立只读复验；工作台语言脑仍默认链下运行。', 'Publish the real receipt and byte hashes for independent read-only verification; the workbench language brain still runs off-chain by default.'],
  ['制作大脑与格式', 'Build a brain: format'], ['下载摘要机网表', 'Download summarizer netlist'], ['部署配置说明', 'Deployment config'],
  ['只改 brain/bench-deployment.json 的真实 processor 和 circuitId 后重建。已配置核验过的 supplyCap()=0x8f770ad0、minted()=0x4f02c420；后者为 NAND/LATCH 合计累计铸造，不是余额或烧毁后现存量。未部署不请求，读失败不伪造 0。',
    'Set the real processor and circuitId in brain/bench-deployment.json and rebuild. Verified getters: supplyCap()=0x8f770ad0, minted()=0x4f02c420; the latter is cumulative NAND+LATCH minted, not a balance or post-burn supply. Nothing is requested before deployment, and a failed read never shows 0.'],
  ['待读取 minted()', 'minted() not read yet'], ['用户提供的身份，尚未读链核验', 'User-provided identity, not yet verified on-chain'],
  ['配置读取失败，未发送 RPC', 'Could not read config; no RPC sent'], ['读取中', 'reading'], ['与规划一致', 'matches plan'], ['与规划不符', 'differs from plan'],
  ['RPC 区块 ', 'RPC block '], ['电路尺寸 ', 'circuit size '], ['（入/出/锁存/记录）', ' (in/out/latch/records)'], ['电路号待填写', 'circuit ID pending'],
  [' · 累计已铸读取失败', ' · minted() read failed'], ['minted() 读取失败', 'minted() read failed'],
  ['读取失败，请检查 RPC 与部署配置', 'Read failed; check the RPC and deployment config'], ['未核验', 'not verified'],
  // Status bar
  ['运行状态', 'Status'], ['大脑未加载', 'Brain not loaded'], ['正在加载大脑', 'Loading brain'], ['大脑已就绪', 'Brain ready'],
  ['位电路已选', 'Bit circuit selected'], ['已就绪 · 本次操作失败', 'Ready · last action failed'], ['加载失败', 'Load failed'],
  ['X Layer · 未读链', 'X Layer · not read'], ['X Layer · 只读已核验', 'X Layer · verified (read-only)'], ['X Layer · 读取失败', 'X Layer · read failed'],
  ['X Layer · 未部署 / 无 RPC', 'X Layer · not deployed / no RPC'], ['X Layer · 已配置，未核验', 'X Layer · configured, not verified'],
  [' 元件', ' gates'],
  // More / loading
  ['大脑加载状态', 'Brain loading status'], ['加载详情', 'Loading details'],
  ['首次约 21 MB，在本机解压、校验、准备分词器。', 'About 21 MB the first time; unpacked, verified and tokenized on this device.'],
  ['当前资源读取进度', 'Download progress'], ['只读网表，不需要钱包。刷新后的读取由浏览器缓存决定。', 'Read-only netlist, no wallet needed. After a refresh the browser cache decides what is re-read.'],
  ['重新加载', 'Retry'], ['范围、证据与署名', 'Scope, evidence and credits'], ['制作大脑与依赖说明', 'Build a brain · dependencies'],
  ['范围、来源与旧工具验证（不代表 X Layer 部署）', 'Scope, sources and earlier tool verification (not an X Layer deployment)'],
  ['派生工作台；语言网表在链下，浏览器按门求值；这里只发布页面和一个小电路。', ' derivative workbench. The language netlist is off-chain and evaluated gate by gate in the browser; only this page and one small circuit are published.'],
  ['默认核心为 4,850,059 NAND + 643 LATCH。工具摘要是结构化捕获/回放，不是自然语言理解。', 'The default core is 4,850,059 NAND + 643 LATCH. The tool summary is structured capture/replay, not natural-language understanding.'],
  ['现有核心不保证相关回答；生成长度上限不等于模型自行停止。', 'The current core does not guarantee relevant answers; hitting the length cap is not the model choosing to stop.'],
  ['是已有的 386 NAND 导航工具；其链上交叉检查仍在 BNB，不能算作 X Layer 流片证据。', ' is the existing 386-NAND navigation tool; its on-chain cross-check is on BNB and is not X Layer tapeout evidence.'],
  ['原始工作台及依赖署名见 NOTICE / licenses。', 'Credits for the original workbench and dependencies are in NOTICE / licenses.'],
  ['开始读取当前大脑 · 清单 → 网表下载/解压 → 校验 → 分词器', 'Loading the current brain · manifest → download/unpack netlist → verify → tokenizer'],
  ['大脑已就绪 · 网表采样 token 在本浏览器逐门计算', 'Brain ready · tokens are sampled by evaluating the netlist gate by gate in this browser'],
  [' · 可以填入示例，按 Enter 发送。', ' · Fill an example and press Enter to send.'],
  ['加载已结束但尚未就绪 · 可重试或换本地文件', 'Loading ended without a ready brain · retry or choose local files'],
  ['大脑数据没能完整读取。请检查网络后重试，或在「换大脑」选择下载好的本地文件。', 'The brain data could not be read completely. Check your network and retry, or pick downloaded local files in the brain switcher.'],
  ['这次操作没有完成。可按下面的原因修正，或在「换大脑」恢复默认。', 'This action did not complete. Fix the cause below, or restore the default brain in the brain switcher.'],
  ['\n原因：', '\nCause: '], ['实际执行：', 'Executed: '], ['未成功，请查看返回原因', 'failed; see the returned reason'], ['已返回', 'returned'],
  ['。这不等于理解了自然语言参数。', '. This does not mean the natural-language arguments were understood.'],
  ['当前正在运行，请先停止或等待结束，再填入示例。', 'Still running. Stop it or wait until it ends before filling an example.'],
  ['示例已填入终端，按 Enter 发送。不会自动执行，也不会替换真实返回。', 'Example filled in; press Enter to send. Nothing runs automatically, and real results are never replaced.'],
  ['新对话 · 选择示例后按 Enter，等待本次实际结果。', 'New chat · pick an example, press Enter and wait for the real result.'],
  ['读取网表清单', 'Reading netlist manifest'], ['读取并解压网表', 'Downloading and unpacking netlist'], ['校验格式、线号与声明哈希', 'Checking format, wire indices and declared hash'],
  ['准备分词器与映射', 'Preparing tokenizer and mapping'], ['准备大脑', 'Preparing brain'], ['累计读取 ', 'Read '], ['本文件 ', 'this file '],
  ['总量未知', 'total unknown'], ['（读取量含压缩数据，不是解压后的网表大小）', ' (counts compressed bytes, not the unpacked netlist size)'],
  // Gate brain view
  ['整个 10 亿参数的 BitCPM4-1B 被编译成每个 token 约 2,821 亿次 NAND 求值（另有 1.09 亿个 LATCH 状态位），在你的显卡上用 WebGPU 一位一位地执行；每个 token 都与参照实现逐位一致。',
    'The whole 1B-parameter BitCPM4-1B is compiled into about 282 billion NAND evaluations per token (plus 109 million LATCH state bits), executed bit by bit on your GPU with WebGPU; every token matches the reference implementation bit for bit.'],
  ['它能直接问答，默认大脑不能。代价是慢，而且不接 Pi 代理：首次下载约 580 MB，在本机生成电路约 3–5 分钟；独立显卡每个 token 约 0.6 秒，笔记本集成显卡约 1.5 秒。一问一答合计最多 128 个 token（大约一百来个汉字），太长的上文会自动精简。',
    'It answers questions directly, which the default brain cannot. The cost is speed, and it is not wired to the Pi agent: first download is about 580 MB and building the circuit locally takes 3–5 minutes; about 0.6 s per token on a discrete GPU, about 1.5 s on a laptop integrated GPU. A question plus its answer is at most 128 tokens (roughly 100 words); longer context is trimmed automatically.'],
  ['门电路大脑 · BitCPM4-1B', 'Gate brain · BitCPM4-1B'], ['BitCPM4-1B · 显卡逐位', 'BitCPM4-1B · bit by bit on GPU'], ['门电路大脑', 'Gate brain'],
  ['下载并生成电路（约 580 MB）', 'Download & build circuit (about 580 MB)'], ['下载并生成电路', 'Download & build circuit'], ['设备检查中…', 'Checking device…'], ['设备预检', 'Device checks'], ['门电路大脑准备进度', 'Gate brain preparation progress'],
  ['问点什么，例如：用一句话介绍你自己。', 'Ask something, e.g. Introduce yourself in one sentence.'], ['给门电路大脑的消息', 'Message to the gate brain'],
  ['用一句话介绍你自己。', 'Introduce yourself in one sentence.'], ['1+1 等于几？', 'What is 1+1?'],
  // Brain switcher
  ['换大脑', 'Switch brain'], ['门电路大脑 · BitCPM4-1B：整个 10 亿参数模型编译成 NAND/LATCH，在显卡上逐位执行 ↗', 'Gate brain · BitCPM4-1B: the whole 1B-parameter model compiled to NAND/LATCH, executed bit by bit on your GPU ↗'], ['内置大脑', 'Built-in brains'], ['记忆电路 · 144', 'Recall circuit · 144'], ['工具摘要 · 10,141', 'Tool summarizer · 10,141'],
  ['这里换推理网表，不是导入工作区文本。', 'This swaps the inference netlist; it does not import workspace text. '],
  ['做自己的大脑：格式与教程 ↗', 'Build your own brain: format and tutorial ↗'], ['下载最小记忆电路', 'Download the minimal recall circuit'],
  ['只保存在本浏览器，不上传。校验通过后仍需确认重载；请先保存编辑内容并停止生成。坏文件不会替换原大脑。',
    'Stored only in this browser, never uploaded. After verification you still confirm the reload; save your edits and stop generation first. A bad file never replaces the current brain.'],
  ['从本地文件切换', 'Switch from local files'], ['网表及配套文件（可多选）', 'Netlist and companion files (multiple allowed)'],
  ['recall_latch.json 可单选；聊天大脑请同时选 netlist.json、records、tokenizer.json、tokenizer_config.json 和 top 映射。',
    'recall_latch.json can be chosen alone; for a chat brain select netlist.json, records, tokenizer.json, tokenizer_config.json and the top mapping together.'],
  ['从 URL 切换', 'Switch from URL'], ['netlist.json 的完整地址', 'Full URL of netlist.json'],
  ['地址需允许跨源读取；网络不通可下载后改选本地文件。', 'The URL must allow cross-origin reads; if it fails, download the files and choose them locally.'],
  ['校验 URL 并切换', 'Verify URL and switch'], ['恢复默认大脑', 'Restore default brain'],
  ['逐拍门级输入（十进制整数，每个数一拍；LSB-first）', 'Per-tick gate input (decimal integers, one per tick; LSB-first)'],
  ['位电路不是聊天模型。换入最小记忆电路后，示例输入的输出应为 0 0 0 0 9；14=MARK，15=QUERY。',
    'A bit circuit is not a chat model. With the minimal recall circuit, the sample input should output 0 0 0 0 9; 14 = MARK, 15 = QUERY.'],
  ['输入序列', 'Input sequence'], ['从零状态运行', 'Run from zero state'], ['运行112拍捕获/回放', 'Run 112-tick capture/replay'],
  ['回看真实拍', 'Inspect recorded tick'], ['查看本拍状态图', 'Show this tick\'s state'],
  ['还没有逐拍结果。先选择电路，再运行输入序列。', 'No tick results yet. Choose a circuit, then run an input sequence.'],
  ['当前：本地网表 ', 'Current: local netlist '], ['（刷新后保留）', ' (kept after refresh)'], ['当前：', 'Current: '],
  ['原大脑保持不变，直到新文件校验通过并确认切换。', 'The current brain stays until a new one passes verification and you confirm.'],
  ['按“从零状态运行”：14标记、9写入、15查询，应输出0/0/0/0/9。', 'Press "Run from zero state": 14 marks, 9 writes, 15 queries; expect 0/0/0/0/9.'],
  ['结构化fixture先捕获，再用本电路输出回馈90拍。不是自然语言理解；低17位为token ID、bit17为生成控制。',
    'A structured fixture is captured first, then the circuit\'s own output is fed back for 90 ticks. Not language understanding; the low 17 bits are the token ID and bit 17 is the generation flag.'],
  ['未完成操作，原大脑未变。', 'Not completed; the current brain is unchanged. '],
  ['。请按教程检查文件格式/配套文件，或重试网络；修正后可重新选择。', '. Check the file format and companion files against the tutorial, or retry the network, then choose again.'],
  ['请先停止生成或等待加载完成，再换大脑', 'Stop generation or wait for loading to finish before switching brains'],
  ['请先停止生成或等待加载完成', 'Stop generation or wait for loading to finish'],
  ['正在校验网表、线号和分词器…', 'Verifying netlist, wire indices and tokenizer…'],
  ['校验通过。切换大脑会重载页面，未保存的编辑内容会丢失。', 'Verified. Switching brains reloads the page; unsaved edits will be lost.'],
  ['恢复默认大脑会重载页面，未保存的编辑内容会丢失。', 'Restoring the default brain reloads the page; unsaved edits will be lost.'],
  ['输入区已有草稿，用这个示例替换吗？不会发送消息。', 'The input already has a draft. Replace it with this example? Nothing will be sent.'],
  ['切换并重载', 'Switch and reload'], ['替换', 'Replace'], ['取消', 'Cancel'], ['已取消切换', 'Switch cancelled'],
  ['多文件请选择名为 netlist.json 的清单', 'With multiple files, include a manifest named netlist.json'],
  ['一次最多输入 256 拍', 'At most 256 ticks at a time'], ['逐拍输入请输入非负十进制整数，以空格分隔', 'Enter non-negative decimal integers separated by spaces'],
  ['逐拍完成：', 'Ticks done: '], [' 拍', ' ticks'], ['不是本次摘要机', 'Wrong circuit'],
  ['摘要机112拍完成；在回看选择器查看捕获与回放', '112 real ticks recorded; inspect capture and replay in the tick picker'],
  // Errors from netlist loading
  ['重复文件名：', 'Duplicate file name: '], ['请输入完整的 http(s) 网表 JSON 地址', 'Enter a full http(s) URL to a netlist JSON'],
  ['网表 URL 只支持 http(s)', 'Netlist URLs must be http(s)'], ['本地网表只支持同目录文件名', 'Local netlists can only reference files in the same folder'],
  ['缺少文件 ', 'Missing file '], ['：请同时选择 netlist.json、records 和分词器文件', ': select netlist.json, records and tokenizer files together'],
  [' 超过 128 MiB 加载上限', ' exceeds the 128 MiB load limit'], ['资源 URL 只支持 http(s)', 'Resource URLs must be http(s)'],
  ['无法读取 ', 'Cannot read '], ['：可能是 CORS / 容器限制；请下载后选本地文件', ': possibly CORS or a container limit; download and choose local files'],
  ['；可改选本地文件', '; you can choose local files instead'], [' 解压后超过 128 MiB 加载上限', ' exceeds the 128 MiB limit after unpacking'],
  [' 不是有效 JSON', ' is not valid JSON'], ['网表 JSON 必须是对象', 'Netlist JSON must be an object'],
  ['换脑入口支持 raw 变长 records，不支持压缩编码 nlz1（可用 .bin.gz）', 'Only raw variable-length records are supported, not nlz1 compression (.bin.gz is fine)'],
  ['不符，文件可能损坏或版本不匹配', ' mismatch; the file may be corrupt or a different version'],
  ['未知 outputMode：支持 bits / top-index / escape18 / token-id', 'Unknown outputMode: supported are bits / top-index / escape18 / token-id'],
  ['模式的 tokenizer 必须是', ' mode requires tokenizer '], ['聊天输出位数无效；escape18 必须为 18 位', 'Invalid chat output width; escape18 must be 18 bits'],
  ['聊天输入布局不支持：递归 tokenBits + 最多 8 控制/随机位；无状态为 6×17 位 + 随机位', 'Unsupported chat input layout: recurrent tokenBits + up to 8 control/random bits; stateless is 6×17 bits + random bits'],
  ['必须在 1..512', ' must be in 1..512'], ['分词器格式错误：需要 HuggingFace tokenizer JSON 和 config', 'Bad tokenizer: HuggingFace tokenizer JSON and config are required'],
  ['映射必须包含 ', ' mapping must contain '], [' 个非负 token ID', ' non-negative token IDs'],
  [' 必须是非负整数', ' must be a non-negative integer'], ['网表尺寸无效：输出必须来自末尾元件，线号不得超过 24 位', 'Invalid netlist size: outputs must come from the last gates and wire indices must fit in 24 bits'],
  ['缺少 records 文件或 nl_hex', 'Missing records file or nl_hex'], [' 必须是完整的十六进制字节', ' must be whole hex bytes'],
  ['长度不符：NAND 7 字节，LATCH 4 字节（文件可能截断）', 'Length mismatch: NAND is 7 bytes, LATCH 4 bytes (file may be truncated)'],
  ['第 ', 'byte '], [' 字节操作码 ', ' opcode '], [' 无效（只能是 0/1）', ' is invalid (must be 0/1)'], ['截断或元件数不符', 'truncated or gate count mismatch'],
  ['元件数与元数据不符', 'gate count does not match metadata'], [' 引用了未来线号', ' references a later wire'], [' 的 D 线号越界', ' D wire out of range'],
  ['输入或状态长度不符', 'Input or state length mismatch'],
  ['这是逐拍电路，不是聊天模型；请使用「换大脑」里的逐拍输入。', 'This is a per-tick circuit, not a chat model; use the per-tick input in the brain switcher.'],
  ['输入 ', 'input '], [' 超出 ', ' exceeds '], [' 位范围', ' bits'],
  // Tool-loop guard + dialog
  ['已自动停止：', 'Stopped automatically: '], ['连续两次调用了完全相同的工具', 'the same tool call was repeated'],
  ['工具调用已达 ', 'tool calls reached '], [' 轮上限', ' rounds'],
  ['。这颗大脑还不会在工具返回后自己作答，结果见上方。', '. This brain does not yet answer on its own after a tool returns; the result is shown above.'],
  ['发送 ↑', 'Send ↑'], ['停止', 'Stop'], ['确认', 'Confirm'], ['语言', 'Language'], ['关闭', 'Close'],
];

// Upstream (pinned MiniCPM Pi workspace) English UI → Chinese, whole strings only.
const UPSTREAM = [
  ['↵ Newline', '↵ 换行'], ['Insert a newline (Shift+Enter)', '换行（Shift+Enter）'], ['Idle', '空闲'],
  ['Preparing…', '准备中…'], ['Loading…', '加载中…'], ['Unavailable', '不可用'], ['Reading prompt…', '读取提示…'],
  ['Generating…', '生成中…'], ['Running tool…', '运行工具…'], ['Stopping…', '停止中…'],
  ['Files and chat are saved on this device.', '文件与对话保存在本设备。'], ['Your files are saved in this browser.', '文件保存在本浏览器。'],
  ['Open workspace in a new tab ↗', '在新标签页打开工作区 ↗'], ['Enter a shell command…', '输入 Shell 命令…'],
  ['Run', '运行'], ['Clear', '清空'], ['Enter to run · Shift+Enter for newline', 'Enter 运行 · Shift+Enter 换行'], ['history', '历史'],
  ['Bash, text tools, and a virtual filesystem. Node.js, Python, and network commands are unavailable.', 'Bash、文本工具与虚拟文件系统。Node.js、Python 与网络命令不可用。'],
  ['Ready in your workspace', '工作区已就绪'], ['+ File', '+ 文件'], ['Export', '导出'], ['Save', '保存'],
  ['File contents', '文件内容'], ['Shell command', 'Shell 命令'], ['↑↓ history', '↑↓ 历史'], ['Powered by', '技术栈'],
  ['Transformers.js documentation (opens in a new tab)', 'Transformers.js 文档（新标签页打开）'],
  ['ONNX Runtime documentation (opens in a new tab)', 'ONNX Runtime 文档（新标签页打开）'],
  ['Pi agent toolkit (opens in a new tab)', 'Pi 代理工具包（新标签页打开）'],
  ['just-bash browser shell (opens in a new tab)', 'just-bash 浏览器 Shell（新标签页打开）'], ['Agent conversation', '对话'], ['Pi terminal', 'Pi 终端'],
  ['Model loads when you send a message. Inference and tools run in this browser.', '发送消息时加载大脑；推理与工具都在本浏览器运行。'],
  ['Model and tools run in your browser', '模型与工具在你的浏览器里运行'], ['Open the scope note', '打开范围说明'],
  ['About 21 MB of compressed netlist and tokenizer, loaded off-chain (or choose local files).', '约 21 MB 压缩网表与分词器，从链下读取（也可选本地文件）。'],
];

const toEn = new Map(PAIRS), toZh = new Map(UPSTREAM);
const fragments = PAIRS.filter(([zh]) => zh.length >= 2 || zh === '门').sort((a, b) => b[0].length - a[0].length);
let lang = 'zh';
const done = new WeakMap(); // node -> {attr -> {from, to}}

function translate(text) {
  const m = /^(\s*)([\s\S]*?)(\s*)$/.exec(text), core = m[2];
  if (!core) return null;
  if (lang === 'zh') { const zh = toZh.get(core); return zh ? m[1] + zh + m[3] : null; }
  if (!CJK.test(core)) return null;
  let out = toEn.get(core);
  if (out == null) {
    out = core;
    for (const [zh, en] of fragments) if (out.includes(zh)) out = out.split(zh).join(en);
    if (out === core) return null;
  }
  return m[1] + out + m[3];
}
function record(node, key, from, to) {
  let r = done.get(node); if (!r) done.set(node, r = {});
  r[key] = { from, to };
}
function applyNode(node) {
  if (node.nodeType === 3) {
    if (node.parentElement?.closest(SKIP)) return;
    const t = translate(node.data);
    if (t != null && t !== node.data) { record(node, '#', node.data, t); node.data = t; }
    return;
  }
  if (node.nodeType !== 1 || node.closest(SKIP)) return;
  for (const el of [node, ...node.querySelectorAll('*')]) {
    if (el.closest(SKIP)) continue;
    for (const a of ATTRS) {
      const v = el.getAttribute(a); if (!v) continue;
      const t = translate(v);
      if (t != null && t !== v) { record(el, a, v, t); el.setAttribute(a, t); }
    }
  }
  const w = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
  for (let n; (n = w.nextNode());) applyNode(n);
}
// Undo only what we changed and nobody has overwritten since.
function restore(node) {
  const r = done.get(node); if (!r) return;
  for (const [k, { from, to }] of Object.entries(r)) {
    if (k === '#') { if (node.data === to) node.data = from; }
    else if (node.getAttribute(k) === to) node.setAttribute(k, from);
  }
  done.delete(node);
}
function restoreAll(root) {
  restore(root);
  for (const el of root.querySelectorAll('*')) restore(el);
  const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let n; (n = w.nextNode());) restore(n);
}

let applying = false;
const observer = new MutationObserver(list => {
  if (applying) return;
  applying = true;
  try {
    for (const m of list) {
      if (m.type === 'childList') m.addedNodes.forEach(applyNode);
      else if (m.type === 'characterData') { done.delete(m.target); applyNode(m.target); }
      else if (m.type === 'attributes') applyNode(m.target);
    }
  } finally { observer.takeRecords(); applying = false; }
});

const TITLE = ['Pi 可换脑工作台 · 浏览器里的 NAND/LATCH 大脑', 'Pi Swappable-Brain Workbench · NAND/LATCH in your browser'];
export function currentLang() { return lang; }
export function setLang(next) {
  lang = next === 'en' ? 'en' : 'zh';
  applying = true;
  try { restoreAll(document.body); applyNode(document.body); } finally { observer.takeRecords(); applying = false; }
  document.documentElement.lang = lang === 'en' ? 'en' : 'zh-CN';
  document.title = TITLE[lang === 'en' ? 1 : 0];
  const button = document.getElementById('lang-toggle');
  if (button) {
    button.setAttribute('aria-pressed', String(lang === 'en'));
    button.setAttribute('aria-label', lang === 'en' ? 'Switch to Chinese' : '切换为英文');
    button.querySelector('[data-lang="zh"]')?.classList.toggle('on', lang === 'zh');
    button.querySelector('[data-lang="en"]')?.classList.toggle('on', lang === 'en');
  }
  try { localStorage.setItem('bench-lang', lang); } catch {}
  window.dispatchEvent(new Event('bench-lang'));
}
export function t(zh) { return lang === 'en' ? (translate(zh) ?? zh) : zh; }

let saved = null;
try { saved = localStorage.getItem('bench-lang'); } catch {}
const initial = saved ?? (/^zh\b/i.test(navigator.language || '') ? 'zh' : 'en');
observer.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATTRS });
document.getElementById('lang-toggle')?.addEventListener('click', () => setLang(lang === 'en' ? 'zh' : 'en'));
setLang(initial);
