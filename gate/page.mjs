// 门电路大脑页面（index.html 的脚本）。面向「什么都不懂的人」：每一步说清在干什么、还要多久、能做什么；
// 借鉴 BOAR（github.com/rferrari/boar-app）的做法：离线标记、实时速度、每条回答的实测数字、出错可自救（清缓存 / 重试）、
// 本机测速与公开速度榜、验收证据摊开、提问灵感卡片、赞踩复制、「继续」。
import { createGateBrain, precheck, MEMORY_ESTIMATE } from './gate-brain.mjs';

const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const q = new URLSearchParams(location.search);
const C = q.get('C') === '512' ? 512 : 128;
const SYSTEM = { role: 'system', content: 'You are a helpful assistant.' }, MIN_ANSWER = 48;
const NAND_PER_TOKEN = 282106356845;   // C128 每拍（含 K6 工具旁路，count_all.mjs 实测；RoPE 查表改选择树后 +3,293 万）：原 1,440,324,606,564；等价替换单元见 cells/*.json
const REPO_ISSUES = 'https://github.com/JogJohgoeg/nand-driver/issues/new';

// ---------- 文字 ----------
let lang = 'zh';
try { const s = localStorage.getItem('bench-lang'); if (s === 'en' || s === 'zh') lang = s; else if (!/^zh/i.test(navigator.language || '')) lang = 'en'; } catch { }
const EN_ = () => lang === 'en';
const L = (zh, en) => EN_() ? en : zh;
const dur = ms => { if (ms == null) return '—'; const s = Math.max(1, Math.round(ms / 1000)); if (s < 60) return L(`${s} 秒`, `${s} s`); const m = Math.floor(s / 60), r = s % 60; return L(`${m} 分${r ? ' ' + r + ' 秒' : '钟'}`, `${m} min${r ? ' ' + r + ' s' : ''}`); };
const sup = n => n.toExponential(1).replace(/e\+(\d+)/, (_, x) => ' × 10' + [...x].map(d => '⁰¹²³⁴⁵⁶⁷⁸⁹'[d]).join(''));
const D = {
  title: ['门电路大脑', 'Gate brain'], back: ['← 工作台', '← Workbench'],
  lead: ['这是一个能回答问题的小型 AI（BitCPM4-1B）。特别的地方是：它被拆成了几千亿个最简单的电子开关，就在你电脑的显卡上一个开关一个开关地算出每个字，算出来的回答和原版模型一字不差。准备好一次之后，断网也能用，你的问题不会发到任何服务器。',
    'A small AI that answers questions (BitCPM4-1B). What makes it unusual: it has been broken down into hundreds of billions of the simplest electronic switches, and your computer’s graphics chip works out every word switch by switch — the answers match the original model word for word. Once it is set up, it works offline too, and your questions never go to any server.'],
  f1v: ['2,821 亿次', '282 billion'], f1: ['每写一个字要拨动的开关次数', 'switch flips to write one word'],
  f2v: ['1.09 亿个', '109 million'], f2: ['记住上下文用的「记忆开关」', '“memory switches” holding the conversation'],
  f3: ['一次对话最多多少个词（问题 + 回答）', 'words per conversation at most (question + answer)'],
  f4v: ['580 MB', '580 MB'], f4: ['只在第一次下载，之后断网也能用', 'downloaded once; works offline afterwards'],
  stepLabel: ['第 1 步', 'Step 1'], s_dev: ['准备（只有第一次要等几分钟）', 'Get ready (only the first time takes a few minutes)'], start: ['开始准备', 'Get ready'], pre_sum: ['查看具体检查了哪些项', 'See what was checked'],
  go: ['提问', 'Ask'], stop: ['停下', 'Stop'], cont: ['继续说', 'Keep going'],
  setLabel: ['设置', 'Settings'], s_set: ['本机数据、测速与记录', 'Local data, speed test and history'],
  st_data: ['存在这台电脑里的东西', 'What is stored on this computer'], clear: ['删除存好的电路…', 'Delete the saved circuit…'],
  st_bench: ['测一测你的电脑', 'Test your computer'], bench_help: ['让它回答一个固定的小问题，量出你的电脑第一个字要等多久、之后每个字多快。结果可以复制，或者提交到下面的速度榜。', 'It answers one fixed short question and measures how long the first word takes and how fast each word comes after. You can copy the result or submit it to the speed board below.'],
  bench_go: ['开始测速（约 1–2 分钟）', 'Run the speed test (about 1–2 min)'],
  st_log: ['执行记录', 'Run history'], log_help: ['每次回答的实测数字（只存在你的浏览器里，不会上传）。', 'Measured numbers for each answer (kept only in your browser, never uploaded).'], tel_clear: ['清空记录', 'Clear history'],
  st_long: ['长回答模式', 'Long mode'], long_help: ['一次对话能装约 512 个词，但要重新准备一次，需要约 7.6 GB 内存，每个字也更慢。', 'Holds about 512 words per conversation, but it has to get ready again, needs about 7.6 GB of memory, and each word is slower.'],
  long: ['换成长回答模式', 'Switch to long mode'],
  tools_sum: ['给开发者：让它按格式调用工具（一般用不到）', 'For developers: have it produce a tool call (you can ignore this)'],
  tools_help: ['填入 OpenAI function 格式的 JSON 数组；它会生成一次工具调用，页面只显示，不会真的去执行。', 'Paste a JSON array in OpenAI function format; it produces one tool call, which the page only shows and never runs.'],
  tool_ex: ['填入一个例子', 'Insert an example'],
  boardLabel: ['实测', 'Measured'], s_board: ['在各种电脑上有多快', 'How fast it is on different computers'],
  board_help: ['都是真机实测，不是估算。用「设置 → 测一测你的电脑」量出你的数字，点「提交到速度榜」就能加进来。', 'All measured on real machines, not estimated. Use “Settings → Test your computer” to measure yours and press “Submit to the speed board” to add it.'],
  proofLabel: ['证据', 'Evidence'], s_proof: ['怎么知道它算得对？', 'How do we know it computes correctly?'],
  s_how: ['它是怎么做到的？（想了解再看）', 'How does it work? (optional reading)'],
  h1: ['电脑和手机里的芯片，归根结底都是由大量「与非门」组成的——这是最简单的一种电子开关：两个输入都是 1 时输出 0，否则输出 1。我们把整个 AI 模型拆成了这样的开关网络，每写一个字要拨动约 2,821 亿次开关。', 'The chips in computers and phones are ultimately made of huge numbers of “NAND gates” — the simplest electronic switch: if both inputs are 1 the output is 0, otherwise 1. We turned the whole AI model into a network of such switches; writing one word takes about 282 billion switch flips.'],
  h2: ['你的浏览器先下载模型的参数（约 580 MB），在你电脑上把开关网络搭出来并存下，再交给显卡去算。每一步都按固定的规则计算，所以回答和原版模型一字不差，任何人都可以重复验证。', 'Your browser downloads the model’s numbers (about 580 MB), builds the switch network on your computer and saves it, then hands it to the graphics chip. Every step follows fixed rules, so the answer matches the original model word for word and anyone can check it.'],
  h3: ['为什么准备好之后断网也能用：搭好的电路存在浏览器的本机存储里，页面本身也会存一份；下次打开（包括开着飞行模式）直接从这台电脑读出来。', 'Why it works offline once set up: the built circuit is saved in the browser’s local storage and the page keeps a copy of itself; next time (even in airplane mode) everything is read from this computer.'],
  h4: ['文字和编号之间的转换是页面自己做的，不算在开关里。', 'Turning text into numbers and back is done by the page itself and is not part of the switches.'],
  l_prov: ['技术出处', 'Technical provenance'], model_card: ['模型说明（OpenBMB BitCPM4-1B）', 'Model card (OpenBMB BitCPM4-1B)'], plain: ['精简版页面', 'Plain page'],
};
const T = k => (D[k] ? D[k][EN_() ? 1 : 0] : k);
const TIP = { newChat: ['新对话', 'New conversation'], settings: ['设置', 'Settings'] };
const WHAT = { 'WebGPU 适配器': ['浏览器能用显卡来计算', 'Browser can compute on the graphics chip'], '单个存储缓冲绑定上限': ['显卡一次能读的内存', 'Graphics memory readable at once'], '单个缓冲大小上限': ['显卡单块内存的大小', 'Size of one graphics memory block'], '每阶段存储缓冲数': ['显卡同时能用的内存块数', 'Graphics memory blocks usable at once'], '工作组共享内存': ['显卡里的高速小内存', 'Fast on-chip graphics memory'], '内存': ['电脑内存', 'Computer memory'], '本机缓存空间': ['能用来存电路的硬盘空间', 'Disk space to save the circuit'] };
const DETAIL_EN = [
  [/（需要 ≥ ([^）]+)）/g, ' (need ≥ $1)'], [/ 字节/g, ' bytes'],
  [/^浏览器报告 ≥ (\d+) GB（浏览器最多报 8）。$/, 'Browser reports ≥ $1 GB (browsers report at most 8).'],
  [/^浏览器报告 ≥ (\d+) GB（浏览器最多报 8）——.*$/, 'Browser reports $1 GB — this device may not have enough memory; the page may be killed by the system or browser.'],
  [/^浏览器不报告内存大小。.*$/, 'The browser does not report memory size. Peak for this mode: about 6–7.6 GB of browser memory plus 4.3–6.4 GB of graphics memory.'],
  [/^可用约 ([\d.]+) GB（缓存需要约 ([\d.]+) GB）$/, 'About $1 GB free (the saved circuit needs about $2 GB)'],
  [/^可用约 ([\d.]+) GB（缓存需要约 ([\d.]+) GB，.*$/, 'About $1 GB free (needs about $2 GB) — not enough; the circuit will be rebuilt on every visit'],
  [/^无法查询；.*$/, 'Cannot query; runs fine, just without saving'],
];
const detailEn = d => { for (const [re, to] of DETAIL_EN) d = d.replace(re, to); return d; };
const STAGE = {
  cache: () => L('看看你电脑里有没有存好的电路……', 'Looking for a saved circuit on your computer…'),
  upload: () => L('正在读出你电脑里存好的电路……', 'Loading the circuit saved on your computer…'),
  download: (e, eta) => L(`正在下载模型：${(e.done / 1e6).toFixed(0)} / ${(e.total / 1e6).toFixed(0)} MB${eta ? `，大约还要 ${eta}` : ''}`, `Downloading the model: ${(e.done / 1e6).toFixed(0)} / ${(e.total / 1e6).toFixed(0)} MB${eta ? `, about ${eta} left` : ''}`),
  generate: (e, eta) => e.total ? L(`正在你的电脑上搭电路：已搭好 ${e.done} / ${e.total} 层${eta ? `，大约还要 ${eta}` : ''}`, `Building the circuit on your computer: ${e.done} / ${e.total} layers done${eta ? `, about ${eta} left` : ''}`) : L('正在你的电脑上搭电路（开头的部分）……', 'Building the circuit on your computer (first parts)…'),
};
const HINT = { download: ['下载的同时已经开始在你电脑上搭电路了。别关这个页面。', 'It is already building the circuit while downloading. Keep this page open.'], generate: ['最费时间的一步，完全在你的电脑上进行，网速不影响它。别关这个页面。', 'The longest step; it happens entirely on your computer, so internet speed does not matter. Keep this page open.'], upload: ['马上就好。', 'Almost there.'] };
const STOPR = { eos: ['回答完了', 'Finished'], max_tokens: ['到了长度上限，没写完', 'Hit the length limit before finishing'], capacity: ['对话装满了，没写完', 'The conversation filled up before finishing'], stopped: ['你让它停下了', 'You stopped it'], tool_truncated: ['工具调用被截断了', 'Tool call was cut off'], tool_aborted: ['工具调用中止了', 'Tool call was aborted'] };
const ERR = {
  no_adapter: ['你的浏览器没法用显卡来计算。请换用最新版的 Chrome 或 Edge 电脑版再试。', 'Your browser cannot use the graphics chip for computing. Please try the latest desktop Chrome or Edge.'],
  weights_fetch: ['模型下载失败了，可能是网络断了。第一次准备需要联网；请检查网络后重试。', 'Downloading the model failed, maybe the connection dropped. The first setup needs internet; check it and retry.'],
  chunk_sha: ['下载到的模型文件和原版对不上（可能损坏或被改过），为了安全已经停下，没有使用它。请重试。', 'A downloaded model file does not match the original (damaged or altered), so it stopped for safety and did not use it. Please retry.'],
  weights_mismatch: ['网站正在更新，模型文件和页面暂时对不上。请过几分钟再试。', 'The site is being updated and the model files do not match the page yet. Please try again in a few minutes.'],
  prompt_too_long: ['这句话太长了，装不下。请说短一点，或者点右上角「＋」开一个新对话。', 'This message is too long to fit. Please shorten it, or press “＋” at the top to start a new conversation.'],
  gpu_lost: ['显卡中途出错了（常见原因是内存不够或显卡驱动重启）。请关掉其他占内存的页面，然后重试。', 'The graphics chip failed partway (usually not enough memory or a driver restart). Close other heavy tabs and retry.'],
  long_mode_unavailable: ['这台电脑的内存不够开长回答模式。请把问题改短一点再问。', 'This computer does not have enough memory for long mode. Please ask a shorter question.'],
};
const IDEAS = [
  ['常识', 'Facts', 'What is the capital of France?', 'What is the capital of France?'],
  ['解释', 'Explain', 'Why is the sky blue? Answer in one sentence.', 'Why is the sky blue? Answer in one sentence.'],
  ['写作', 'Write', 'Write a haiku about logic gates.', 'Write a haiku about logic gates.'],
  ['中文', 'Chinese', '用一句话介绍你自己。', '用一句话介绍你自己。'],
  ['比较', 'Compare', 'Cats or dogs: which is easier to keep in a small flat? One sentence.', 'Cats or dogs: which is easier to keep in a small flat? One sentence.'],
  ['算一算', 'Math', '1+1 等于几？', 'What is 1+1?'],
];
const EXAMPLE_TOOLS = [{ type: 'function', function: { name: 'get_weather', description: 'Get the current weather for a city', parameters: { type: 'object', properties: { city: { type: 'string', description: 'City name' } }, required: ['city'] } } }];

// 动态文字登记成渲染函数，切换语言时整体重画
const live = new Map();
const setLive = (id, f, cls) => { live.set(id, [f, cls]); const el = $(id); if (!el) return; el.innerHTML = f(); if (cls !== undefined) el.className = cls; };
const redraws = new Set();   // 其它需要随语言重画的部件（消息元信息等）

// ---------- 状态 ----------
let rateMs = null, brain = null, ready = false, curC = C, running = false, ctrl = null, history = [], lastPre = null, readyInfo = null;
let stageName = '', stageT0 = 0, stageD0 = 0, sawLayers = false, promptCb = null, cacheSaved = false, swOK = false, prepFailed = null;
const TELKEY = 'gate-telemetry';
const telLoad = () => { try { return JSON.parse(localStorage.getItem(TELKEY) || '[]'); } catch { return []; } };
const telSave = a => { try { localStorage.setItem(TELKEY, JSON.stringify(a.slice(-50))); } catch { } };

// ---------- 静态文字 ----------
function applyLang() {
  document.documentElement.lang = EN_() ? 'en' : 'zh';
  document.title = L('门电路大脑 · BitCPM4-1B', 'Gate brain · BitCPM4-1B');
  for (const el of document.querySelectorAll('[data-t]')) el.textContent = T(el.dataset.t);
  for (const el of document.querySelectorAll('[data-tip]')) { const t = TIP[el.dataset.tip]; el.title = t[EN_() ? 1 : 0]; el.setAttribute('aria-label', el.title); }
  $('lang').textContent = EN_() ? '中文' : 'EN';
  $('fC').textContent = String(curC);
  $('sub').textContent = L(`BitCPM4-1B · 每字 2,821 亿次开关 · 一次最多 ${curC} 词`, `BitCPM4-1B · 282B switch flips per word · up to ${curC} words`);
  $('msg').placeholder = ready ? L('问它点什么……（Enter 发送，Shift+Enter 换行）', 'Ask it something… (Enter to send, Shift+Enter for a new line)') : L('准备好之后就能在这里提问', 'You can ask here once it is ready');
  if (lastPre) renderPre(lastPre);
  renderIdeas(); renderPill(); renderBoard(); renderProof(); renderTelemetry(); renderData();
  for (const [id, [f, cls]] of live) { const el = $(id); if (el) { el.innerHTML = f(); if (cls !== undefined) el.className = cls; } }
  for (const f of redraws) f();
  if (rateMs != null) setRate(rateMs);
  cHint();
}
$('lang').onclick = () => { lang = EN_() ? 'zh' : 'en'; try { localStorage.setItem('bench-lang', lang); } catch { } applyLang(); };

function renderPre(rows) {
  lastPre = rows;
  $('pre').innerHTML = '<table>' + rows.map(r => {
    const cls = r.ok === true ? 'ok' : r.ok === 'warn' ? 'warn' : 'bad', mark = r.ok === true ? '✓' : r.ok === 'warn' ? '!' : '✗', w = WHAT[r.what];
    return `<tr><td class="${cls}" style="width:1.5em">${mark}</td><td>${esc(w ? w[EN_() ? 1 : 0] : r.what)}</td><td class="mute">${esc(EN_() ? detailEn(r.detail) : r.detail)}</td></tr>`;
  }).join('') + '</table>';
}

// ---------- 离线标记 ----------
async function hasSavedCircuit() {
  try { const root = await navigator.storage.getDirectory();
    for await (const [n, h] of root.entries()) if (n.startsWith('gatesim-') && h.kind === 'directory') { try { await h.getFileHandle('_complete.pack'); return true; } catch { } } } catch { }
  return false;
}
function renderPill() {
  const off = !navigator.onLine, el = $('pill');
  let cls = 'pill', txt;
  if (off && (cacheSaved || ready)) { cls += ' on'; txt = L('离线 · 用存好的电路', 'Offline · saved circuit'); }
  else if (off) { cls += ' off'; txt = L('离线 · 第一次需要联网', 'Offline · first setup needs internet'); }
  else if (ready && cacheSaved && swOK) { cls += ' on'; txt = L('断网也能用', 'Works offline'); }
  else if (cacheSaved) { txt = L('存过电路', 'Circuit saved'); }
  else txt = L('第一次准备需要联网', 'First setup needs internet');
  el.className = cls; $('pillT').textContent = txt;
}
addEventListener('online', renderPill); addEventListener('offline', renderPill);

// ---------- 提问灵感 ----------
function renderIdeas() {
  const box = $('ideas'); box.hidden = history.length > 0 || $('log').children.length > 0;
  box.innerHTML = IDEAS.map((x, i) => `<button type="button" class="idea" data-i="${i}"><span class="label">${esc(EN_() ? x[1] : x[0])}</span>${esc(EN_() ? x[3] : x[2])}</button>`).join('');
  for (const b of box.children) b.onclick = () => { const x = IDEAS[+b.dataset.i]; $('msg').value = EN_() ? x[3] : x[2]; autoGrow(); if (ready) send(); else $('msg').focus(); };
}

// ---------- 速度榜与证据 ----------
let BOARD = null;
fetch('./bench.json').then(r => r.json()).then(j => { BOARD = j; renderBoard(); }).catch(() => { });
const pick = v => v && typeof v === 'object' && ('zh' in v) ? v[EN_() ? 'en' : 'zh'] : v;
function renderBoard() {
  if (!BOARD) { $('board').innerHTML = `<span class="mute">${esc(L('读取中……', 'Loading…'))}</span>`; return; }
  const s = n => n == null ? '—' : L(`${n} 秒`, `${n} s`);
  $('board').innerHTML = `<table><tr><th>${esc(L('电脑', 'Computer'))}</th><th>${esc(L('第一次打开', 'First open'))}</th><th>${esc(L('再次打开', 'Reopen'))}</th><th>${esc(L('第一个字', 'First word'))}</th><th>${esc(L('之后每个字', 'Per word after'))}</th><th>${esc(L('长回答每个字', 'Per word (long)'))}</th></tr>` +
    BOARD.rows.map(r => `<tr><td><b>${esc(pick(r.device))}</b><br><span class="mute">${esc(pick(r.gpu))} · ${esc(r.ram)} · ${esc(r.browser)}</span>${r.note ? `<br><span class="mute">${esc(pick(r.note))}</span>` : ''}${r.evidence ? ` · <a href="./${esc(r.evidence)}">${esc(L('原始记录', 'raw record'))}</a>` : ''}</td>` +
      `<td class="mono">${s(r.c128?.cold)}</td><td class="mono">${s(r.c128?.warm)}</td><td class="mono">${s(r.c128?.firstWord)}</td><td class="mono">${s(r.c128?.perWord)}</td><td class="mono">${s(r.c512?.perWord)}</td></tr>`).join('') + '</table>' +
    `<p class="note">${esc(L(`更新于 ${BOARD.updated}。第一个字：一句二三十个词的短问题，先要读完整个问题。`, `Updated ${BOARD.updated}. First word: a short question of 20–30 words, which is read in full first.`))}</p>`;
}
function renderProof() {
  const ev = './evidence/2026-09-26-b28/';
  $('proof').innerHTML = `<ul style="margin:0;padding-left:1.2em;font-size:14px">
<li>${L('用三道标准测试题（两道问答、一道工具调用）对照参考实现：<b>每一个字的编号都相同</b>，第一次打开和再次打开各测一遍。', 'Three standard test questions (two Q&amp;A, one tool call) against the reference implementation: <b>every single word id matches</b>, both on first open and on reopening.')}
 <a href="${ev}check-cold.json">${L('第一次打开', 'first open')}</a> · <a href="${ev}check-warm.json">${L('再次打开', 'reopen')}</a></li>
<li>${L('故意改坏一块模型文件：页面发现对不上，<b>拒绝运行</b>，一个字也不会用坏数据算。', 'One model file deliberately corrupted: the page detects the mismatch and <b>refuses to run</b> — nothing is computed from bad data.')} <a href="${ev}check-tamper.json">${L('记录', 'record')}</a></li>
<li>${L('每次改动电路（换更小的等价单元、改执行方式）都先做形式等价证明或穷举验证，再跑上面的对照；做不到逐位相同的改动一律不上线。', 'Every change to the circuit (smaller equivalent cells, new execution tricks) is first proven equivalent formally or checked exhaustively, then run through the comparison above; anything not bit-for-bit identical is never shipped.')}</li>
<li>${L('这台电脑上的每次回答都有实测记录（设置 → 执行记录），数字是量出来的，不是估的。', 'Every answer on this computer has a measured record (Settings → Run history): the numbers are measured, not estimated.')}</li></ul>`;
}

// ---------- 本机数据 ----------
async function renderData() {
  let txt = '';
  try { const e = await navigator.storage.estimate(); txt = L(`这个网站在你电脑上用了约 ${(e.usage / 1e9).toFixed(2)} GB（浏览器允许最多约 ${(e.quota / 1e9).toFixed(0)} GB）。`, `This site uses about ${(e.usage / 1e9).toFixed(2)} GB on your computer (the browser allows up to about ${(e.quota / 1e9).toFixed(0)} GB).`); } catch { }
  txt += cacheSaved ? L('其中主要是存好的电路：删掉后下次打开要重新下载、重新搭（几分钟）。', ' Most of it is the saved circuit: if you delete it, the next visit downloads and rebuilds it (a few minutes).') : L('现在没有存好的电路。', ' No saved circuit right now.');
  txt += swOK ? L('页面本身也存了一份，断网时能打开。', ' The page itself is also saved, so it opens offline.') : '';
  $('dataInfo').textContent = txt;
}
$('clear').onclick = () => {
  setLive('clearRow', () => `<span class="warn">${esc(L('确定删除？删除后下次要重新下载并搭电路。', 'Delete it? The next visit will download and rebuild the circuit.'))}</span> <button id="clearYes" type="button" class="danger">${esc(L('确定删除', 'Delete'))}</button> <button id="clearNo" type="button">${esc(L('取消', 'Cancel'))}</button>`, 'row');
  bindClear();
};
function bindClear() {
  const y = $('clearYes'), n = $('clearNo'); if (!y) return;
  n.onclick = () => { live.delete('clearRow'); $('clearRow').innerHTML = `<button id="clear" type="button" class="danger">${esc(T('clear'))}</button>`; rebindClearBtn(); };
  y.onclick = async () => {
    y.disabled = n.disabled = true;
    try { brain?.dispose(); } catch { } brain = null; ready = false;
    try { const root = await navigator.storage.getDirectory(); const names = []; for await (const [nm] of root.entries()) if (nm.startsWith('gatesim-')) names.push(nm); for (const nm of names) await root.removeEntry(nm, { recursive: true }); } catch { }
    cacheSaved = false; live.delete('clearRow');
    $('clearRow').innerHTML = `<span class="ok">${esc(L('已删除。刷新页面后可以重新准备。', 'Deleted. Reload the page to set it up again.'))}</span> <button type="button" onclick="location.reload()">${esc(L('刷新页面', 'Reload'))}</button>`;
    renderPill(); renderData(); $('go').disabled = true;
  };
}
function rebindClearBtn() { $('clear').onclick = () => { setLive('clearRow', () => `<span class="warn">${esc(L('确定删除？删除后下次要重新下载并搭电路。', 'Delete it? The next visit will download and rebuild the circuit.'))}</span> <button id="clearYes" type="button" class="danger">${esc(L('确定删除', 'Delete'))}</button> <button id="clearNo" type="button">${esc(L('取消', 'Cancel'))}</button>`, 'row'); bindClear(); }; }
rebindClearBtn();

// ---------- 执行记录 ----------
function renderTelemetry() {
  const a = telLoad().slice().reverse();
  if (!a.length) { $('telemetry').innerHTML = `<p class="note" style="margin:0">${esc(L('还没有记录。', 'No records yet.'))}</p>`; return; }
  const fb = x => x === 1 ? '👍' : x === -1 ? '👎' : '';
  $('telemetry').innerHTML = `<table><tr><th>${esc(L('时间', 'Time'))}</th><th>${esc(L('问题', 'Question'))}</th><th>${esc(L('第一个字', 'First word'))}</th><th>${esc(L('每个字', 'Per word'))}</th><th>${esc(L('字数', 'Words'))}</th><th>${esc(L('结果', 'Result'))}</th><th></th></tr>` +
    a.slice(0, 20).map(r => `<tr><td class="mono">${esc(new Date(r.at).toLocaleTimeString())}</td><td>${esc(r.q)}</td><td class="mono">${esc(dur(r.first))}</td><td class="mono">${r.per ? (r.per / 1e3).toFixed(2) + L(' 秒', ' s') : '—'}</td><td class="mono">${r.n}</td><td>${esc(STOPR[r.stop] ? STOPR[r.stop][EN_() ? 1 : 0] : r.stop)}${r.bench ? ' · ' + esc(L('测速', 'speed test')) : ''}</td><td>${fb(r.fb)}</td></tr>`).join('') + '</table>';
}
$('telClear').onclick = () => { telSave([]); renderTelemetry(); };

// ---------- 设置面板 ----------
$('gear').onclick = () => { const s = $('secSettings'); s.hidden = !s.hidden; if (!s.hidden) { renderData(); renderTelemetry(); s.scrollIntoView({ behavior: 'smooth', block: 'start' }); } };
$('toolEx').onclick = () => { $('tools').value = JSON.stringify(EXAMPLE_TOOLS, null, 1); $('msg').value = EN_() ? "What's the weather in Paris?" : '巴黎现在天气怎么样？'; autoGrow(); };

// ---------- 准备 ----------
function onEvent(e) {
  if (e.type === 'precheck') renderPre(e.rows);
  else if (e.type === 'progress' && e.stage === 'prompt') { if (promptCb) promptCb(e); }
  else if (e.type === 'progress') {
    if (e.stage === 'generate' && e.total) sawLayers = true; else if (e.stage === 'generate' && sawLayers) return;
    if (e.stage !== stageName) { stageName = e.stage; stageT0 = performance.now(); stageD0 = e.done || 0; }
    const el = performance.now() - stageT0, dd = (e.done || 0) - (e.stage === 'download' ? 0 : stageD0);
    const rest = e.total && dd > 0 && el > 4000 ? el * (e.total - e.done) / dd : null;
    setLive('st', () => esc((STAGE[e.stage] || (() => ''))(e, rest === null ? '' : dur(rest))), 'mute');
    setLive('stHint', () => esc(HINT[e.stage] ? HINT[e.stage][EN_() ? 1 : 0] : ''), 'note');
    if (e.total) $('bar').style.width = (100 * e.done / e.total).toFixed(1) + '%';
  }
  else if (e.type === 'ready') onReady(e);
  else if (e.type === 'warning') setLive('startNote', () => `<span class="warn">${esc(e.message)}</span>`, 'note');
  else if (e.type === 'error') { if (ready && e.code !== 'gpu_lost') return; showPrepError(e); }
  else if (e.type === 'capacity') { $('long').hidden = !e.canSwitchLong; }
}
function showPrepError(e) {
  prepFailed = e; live.delete('stHint'); $('stHint').textContent = ''; live.delete('st'); $('st').textContent = '';
  const f = ERR[e.code];
  setLive('errBox', () => `<div class="errcard"><b class="bad">${esc(L('没能准备好', 'Could not get ready'))}</b><p style="margin:6px 0">${esc(f ? f[EN_() ? 1 : 0] : e.message)}</p>
<div class="row" style="margin-top:4px"><button type="button" class="primary" id="eRetry">${esc(L('重试', 'Retry'))}</button><button type="button" id="eClear">${esc(L('删除存好的电路后重试', 'Delete the saved circuit and retry'))}</button></div>
<details style="margin-top:8px"><summary>${esc(L('技术细节', 'Technical details'))}</summary><pre>${esc((e.code || '') + ': ' + (e.message || ''))}</pre></details></div>`);
  $('eRetry').onclick = () => location.reload();
  $('eClear').onclick = async () => { try { brain?.dispose(); } catch { } try { const root = await navigator.storage.getDirectory(); const ns = []; for await (const [n] of root.entries()) if (n.startsWith('gatesim-')) ns.push(n); for (const n of ns) await root.removeEntry(n, { recursive: true }); } catch { } location.reload(); };
}
function onReady(e) {
  ready = true; readyInfo = e; curC = e.C; cacheSaved = true; $('bar').style.width = '100%';
  setLive('st', () => esc(e.warm ? L(`✓ 准备好了（用了存好的电路，${dur(e.prepMs)}）。在下面输入问题。`, `✓ Ready (used the saved circuit, ${dur(e.prepMs)}). Type a question below.`) : L(`✓ 准备好了（这次用了 ${dur(e.prepMs)}；电路已存进这台电脑，下次打开只要十几秒，断网也行）。在下面输入问题。`, `✓ Ready (took ${dur(e.prepMs)}; the circuit is now saved on this computer, so next time takes seconds, even offline). Type a question below.`)), 'ok');
  live.delete('stHint'); $('stHint').textContent = ''; $('barBox').hidden = true; $('preBox').hidden = true;
  $('go').disabled = false; $('bench').disabled = false; $('newChat').hidden = false; $('long').hidden = curC === 512;
  applyLang(); hasSavedCircuit().then(v => { cacheSaved = v || cacheSaved; renderPill(); renderData(); });
  $('msg').focus({ preventScroll: true });
}
function boot() {
  $('barBox').hidden = false; $('start').hidden = true; live.delete('startNote'); $('startNote').textContent = '';
  setLive('st', () => esc(STAGE.cache()), 'mute');
  brain = createGateBrain({ weightsBase: q.get('w') || undefined, C, confirmLong: false, onEvent });
  brain.ready.catch(() => { });
}
(async () => {
  applyLang();
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').then(() => navigator.serviceWorker.ready).then(() => { swOK = true; renderPill(); renderData(); }).catch(() => { });
  cacheSaved = await hasSavedCircuit(); renderPill();
  setLive('st', () => esc(L('正在检查你的电脑能不能运行……', 'Checking whether your computer can run it…')), 'mute');
  const pc = await precheck({ C });
  renderPre(pc.rows);
  const warnAny = pc.rows.some(r => r.ok === 'warn');
  if (pc.hard) { setLive('verdict', () => esc(L('✗ 这台设备跑不动它，所以什么都没有下载。它需要一台显卡比较新、内存 8 GB 以上的电脑，手机和平板一般不行。', '✗ This device cannot run it, so nothing was downloaded. It needs a computer with a fairly recent graphics chip and 8 GB+ of memory; phones and tablets usually cannot.')), 'bad'); live.delete('st'); $('st').textContent = ''; $('preBox').open = true; return; }
  setLive('verdict', () => esc(warnAny ? L('! 你的电脑大概可以运行，但有一项不太够（见下面的检查），可能会慢或者中途失败。', '! Your computer can probably run it, but one item is borderline (see the checks below); it may be slow or fail partway.') : L('✓ 你的电脑可以运行它。', '✓ Your computer can run it.')), warnAny ? 'warn' : 'ok');
  live.delete('st'); $('st').textContent = '';
  if (q.has('auto')) { boot(); return; }
  const est = MEMORY_ESTIMATE[C];
  $('start').hidden = false;
  setLive('startNote', () => esc(cacheSaved ? L('这台电脑上存过之前搭好的电路：点「开始准备」，十几秒就好（断网也行）。如果网站更新过，会重新下载、重新搭（几分钟）。', 'A circuit built earlier is saved on this computer: press “Get ready” and it takes seconds (offline too). If the site was updated, it downloads and rebuilds (a few minutes).')
    : !navigator.onLine ? L('现在没有网络。第一次准备需要联网下载约 580 MB；联网后再点「开始准备」。', 'You are offline. The first setup needs internet to download about 580 MB; connect and then press “Get ready”.')
    : L(`第一次要下载约 580 MB，然后在你的电脑上把电路搭起来，一般 2–8 分钟（电脑越新越快）。准备期间请别关这个页面。准备好之后电路会存在你电脑里，下次打开十几秒就能用，断网也行。会用掉约 ${est.ramGB} GB 内存、${est.cacheGB} GB 硬盘。`, `The first time, it downloads about 580 MB and builds the circuit on your computer — usually 2–8 minutes (faster on newer computers). Please keep this page open meanwhile. The circuit is then saved on your computer, so next time it starts in seconds, even offline. Uses about ${est.ramGB} GB of memory and ${est.cacheGB} GB of disk.`)), 'note');
  $('start').onclick = boot;
})();

// ---------- 对话 ----------
function bubble(role) {
  const d = document.createElement('div'); d.className = 'msg ' + (role === 'user' ? 'you' : 'bot');
  d.innerHTML = `<div class="who label">${role === 'user' ? esc(L('你', 'You')) : esc(L('门电路大脑', 'Gate brain'))}</div><div class="txt"></div>`;
  const who = d.firstChild; redraws.add(() => { who.textContent = role === 'user' ? L('你', 'You') : L('门电路大脑', 'Gate brain'); });
  $('log').append(d); $('ideas').hidden = true; return d;
}
const nearBottom = () => innerHeight + scrollY >= document.body.scrollHeight - 160;
const toBottom = force => { if (force || nearBottom()) scrollTo({ top: document.body.scrollHeight }); };
function fitTurns(text) {
  const fits = t => brain.promptTokens([SYSTEM, ...t, { role: 'user', content: text }]) <= curC - MIN_ANSWER;
  const cut = (t, n) => t.map(m => m.role === 'assistant' && m.content.length > n ? { ...m, content: m.content.slice(0, n) + '…' } : m);
  if (fits(history)) return { turns: history.slice(), note: null };
  for (const n of [40, 20, 10]) { const t = cut(history, n); if (fits(t)) return { turns: t, note: ['为装进长度上限，之前的回答只带了开头', 'to fit the length limit, earlier answers were shortened'] }; }
  let t = cut(history, 0); if (fits(t)) return { turns: t, note: ['为装进长度上限，只带了你之前的问题', 'to fit the length limit, only your earlier questions were kept'] };
  while (t.length && !fits(t)) t = t.slice(2);
  return { turns: t, note: ['为装进长度上限，最早的几轮对话没带', 'to fit the length limit, the earliest turns were left out'] };
}
function setRate(ms) { rateMs = ms; const r = $('rate'); r.hidden = ms == null; r.textContent = ms == null ? '' : '● ' + L(`${(ms / 1e3).toFixed(1)} 秒/字`, `${(ms / 1e3).toFixed(1)} s/word`); }
function cHint() { $('cHint').textContent = ready ? (history.length ? L(`对话里有 ${history.length / 2} 轮；装不下时会自动缩短之前的内容。右上角「＋」开新对话。`, `${history.length / 2} turn(s) so far; earlier parts are shortened automatically when needed. “＋” at the top starts over.`) : L('每个字都由显卡上的开关逐个算出来：第一个字要先读完你的问题，通常等半分钟到一分钟。', 'Every word is computed switch by switch on your graphics chip: the first word comes after it reads your whole question, usually 30–60 s.')) : ''; }

async function send(opts = {}) {
  const text = (opts.text ?? $('msg').value).trim(); if (!text || !ready || running) return;
  if (!opts.text) { $('msg').value = ''; autoGrow(); }
  running = true; $('go').disabled = true; $('stop').hidden = false; $('stop').disabled = false; $('cont').hidden = true;
  const u = bubble('user'); u.querySelector('.txt').textContent = opts.shown ?? text;
  const b = bubble('assistant'), txt = b.querySelector('.txt'); toBottom(true);
  const t0 = performance.now();
  const think = (d, t) => { const el = performance.now() - t0, rest = d > 0 && el > 3000 ? el * (t - d) / d : null;
    txt.innerHTML = `<span class="think">🧠 ${esc(d ? L(`正在读你的问题（${d} / ${t}）`, `Reading your question (${d} / ${t})`) : L('正在读你的问题', 'Reading your question'))}${esc(rest === null ? L('，一般要 30–80 秒', ', usually 30–80 s') : L(`，大约还要 ${dur(rest)}`, `, about ${dur(rest)} left`))}<span class="dots"></span></span>`; };
  let got = 0, tFirst = null, tLast = null;
  think(0, 0); promptCb = e => { if (!got) think(e.done, e.total); };
  const { turns, note } = fitTurns(text);
  let tools = null; const tt = $('tools').value.trim(); if (tt) { try { tools = JSON.parse(tt); } catch (err) { txt.innerHTML = `<span class="bad">${esc(L('工具那一栏填的不是有效的 JSON：', 'The tool box does not contain valid JSON: ') + err.message)}</span>`; done(); return; } }
  ctrl = new AbortController();
  try {
    const r = await brain.ask([SYSTEM, ...turns, { role: 'user', content: text }], tools, {
      signal: ctrl.signal, maxTokens: opts.maxTokens || 256,
      onToken: tk => { const now = performance.now(); got++; tFirst ??= now; tLast = now;
        txt.innerHTML = tk.tool ? `<span class="tool">${esc(tk.text)}</span>` : esc(tk.text.replace(/<\|im_end\|>$/, ''));
        if (got >= 2) setRate((tLast - tFirst) / (got - 1)); toBottom(); },
    });
    if (!got) txt.textContent = '';
    history.push({ role: 'user', content: text }, { role: 'assistant', content: r.text });
    const nW = (r.ids || []).length, rec = { at: Date.now(), q: (opts.shown ?? text).slice(0, 40), first: r.firstTokenMs, per: r.msPerToken, n: nW, stop: r.stop, C: curC, prompt: (r.promptIds || []).length, bench: !!opts.bench };
    const tel = telLoad(); tel.push(rec); telSave(tel); const idx = tel.length - 1;
    if (r.msPerToken) setRate(r.msPerToken);
    const flips = sup(((r.promptIds?.length || 0) + nW) * NAND_PER_TOKEN);
    const meta = document.createElement('div'); meta.className = 'meta';
    const drawMeta = () => { meta.textContent = [STOPR[r.stop] ? STOPR[r.stop][EN_() ? 1 : 0] : r.stop, L(`第一个字 ${dur(r.firstTokenMs)}`, `first word ${dur(r.firstTokenMs)}`), r.msPerToken ? L(`之后每字 ${(r.msPerToken / 1e3).toFixed(1)} 秒`, `then ${(r.msPerToken / 1e3).toFixed(1)} s/word`) : null,
      L(`${nW} 个字`, `${nW} words`), L(`拨动开关约 ${flips} 次`, `≈ ${flips} switch flips`), readyInfo?.warm ? L('用存好的电路', 'saved circuit') : L('本次现场搭建', 'built this session'), note ? note[EN_() ? 1 : 0] : null,
      r.stop === 'capacity' ? L('回答写满了一次能装的长度：可以问短一点，点「＋」开新对话，或在设置里换长回答模式', 'the answer filled the length limit: ask more briefly, press “＋” for a new conversation, or switch to long mode in Settings') : null].filter(Boolean).join(' · '); };
    drawMeta(); redraws.add(drawMeta); b.append(meta);
    if (r.toolCall) { const pre = document.createElement('pre'); pre.textContent = L('它生成的工具调用（只是显示，没有真的执行）：\n', 'Tool call it produced (only shown, not run):\n') + JSON.stringify({ name: r.toolCall.name, arguments: r.toolCall.arguments }, null, 1); b.append(pre); }
    const acts = document.createElement('div'); acts.className = 'acts';
    const mk = (lab, f) => { const x = document.createElement('button'); x.type = 'button'; x.textContent = lab; x.onclick = () => f(x); acts.append(x); return x; };
    const setFb = v => { const a = telLoad(); if (a[idx]) { a[idx].fb = a[idx].fb === v ? 0 : v; telSave(a); up.classList.toggle('sel', a[idx].fb === 1); down.classList.toggle('sel', a[idx].fb === -1); renderTelemetry(); } };
    const up = mk('👍', () => setFb(1)), down = mk('👎', () => setFb(-1));
    const cp = mk(L('复制', 'Copy'), async x => { try { await navigator.clipboard.writeText(r.text); x.textContent = L('已复制', 'Copied'); setTimeout(() => x.textContent = L('复制', 'Copy'), 1500); } catch { } });
    redraws.add(() => { cp.textContent = L('复制', 'Copy'); });
    b.append(acts);
    if (r.stop === 'max_tokens' || r.stop === 'eos') $('cont').hidden = false;
    if (opts.onDone) opts.onDone(r);
  } catch (err) {
    if (ctrl.signal.aborted) { txt.innerHTML = `<span class="mute">${esc(L('已停止。', 'Stopped.'))}</span>`; }
    else { const f = ERR[err.code]; txt.innerHTML = `<span class="bad">${esc(f ? f[EN_() ? 1 : 0] : err.message)}</span>`; if (opts.onDone) opts.onDone(null, err); }
  }
  done();
  function done() { running = false; promptCb = null; $('go').disabled = false; $('stop').hidden = true; cHint(); renderTelemetry(); renderIdeas(); $('ideas').hidden = true; toBottom(); }
}
$('composer').onsubmit = e => { e.preventDefault(); send(); };
$('msg').addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); send(); } });
const autoGrow = () => { const m = $('msg'); m.style.height = 'auto'; m.style.height = Math.min(160, m.scrollHeight + 2) + 'px'; };
$('msg').addEventListener('input', autoGrow);
$('stop').onclick = () => { ctrl?.abort(); brain?.stop(); };
$('cont').onclick = () => send({ text: 'Please continue.', shown: L('继续说', 'Keep going') });
$('newChat').onclick = () => { if (running) return; history = []; $('log').innerHTML = ''; redraws.clear(); $('cont').hidden = true; setRate(null); renderIdeas(); cHint(); };

// ---------- 测速 ----------
$('bench').onclick = () => {
  if (!ready || running) return;
  $('bench').disabled = true; $('secSettings').hidden = true;
  setLive('benchOut', () => `<p class="note">${esc(L('正在测速：它在回答一个固定的小问题（见下方对话）……', 'Testing: it is answering a fixed short question (see the conversation below)…'))}</p>`);
  const saved = history; history = [];
  send({ text: 'Count from 1 to 10, separated by commas.', maxTokens: 40, bench: true, onDone: async (r, err) => {
    history = saved; $('bench').disabled = false; $('secSettings').hidden = false;
    if (!r) { setLive('benchOut', () => `<p class="bad">${esc(err?.message || '')}</p>`); return; }
    let gpu = ''; try { const a = await navigator.gpu.requestAdapter(); const i = a.info || {}; gpu = [i.vendor, i.architecture, i.device, i.description].filter(Boolean).join(' / '); } catch { }
    const mem = navigator.deviceMemory ? `≥ ${navigator.deviceMemory} GB` : '?';
    const res = { first_word_s: +(r.firstTokenMs / 1e3).toFixed(1), per_word_s: r.msPerToken ? +(r.msPerToken / 1e3).toFixed(2) : null, words: (r.ids || []).length, prompt_words: (r.promptIds || []).length, capacity: curC,
      prepare_s: readyInfo ? Math.round(readyInfo.prepMs / 1e3) : null, prepare_kind: readyInfo?.warm ? 'saved' : 'built', gpu, memory: mem, ua: navigator.userAgent, date: new Date().toISOString().slice(0, 10) };
    const body = '```json\n' + JSON.stringify(res, null, 1) + '\n```\n', url = REPO_ISSUES + '?title=' + encodeURIComponent('[speed board] ' + (gpu || 'my computer')) + '&body=' + encodeURIComponent(L('门电路大脑测速结果：\n\n', 'Gate brain speed test result:\n\n') + body);
    setLive('benchOut', () => `<div class="errcard" style="border-color:var(--accent-line);background:var(--accent-bg)"><b>${esc(L(`你的电脑：第一个字 ${res.first_word_s} 秒，之后每个字 ${res.per_word_s ?? '—'} 秒`, `Your computer: first word ${res.first_word_s} s, then ${res.per_word_s ?? '—'} s per word`))}</b>
<p class="note">${esc(L(`显卡：${gpu || '浏览器没告诉我们'}；这次准备用了 ${res.prepare_s ?? '—'} 秒（${res.prepare_kind === 'saved' ? '用存好的电路' : '现场搭建'}）。`, `Graphics: ${gpu || 'not reported by the browser'}; setup took ${res.prepare_s ?? '—'} s (${res.prepare_kind === 'saved' ? 'saved circuit' : 'built this session'}).`))}</p>
<div class="row"><button type="button" id="bCopy">${esc(L('复制结果', 'Copy result'))}</button><a class="btn" href="${esc(url)}" target="_blank" rel="noopener">${esc(L('提交到速度榜 ↗', 'Submit to the speed board ↗'))}</a></div>
<p class="note">${esc(L('提交会打开 GitHub 的新问题页面，内容是上面的数字、显卡型号和浏览器版本，你可以先看过再决定发不发。', 'Submitting opens a new GitHub issue with the numbers above, your graphics chip and browser version; you can review it before posting.'))}</p></div>`);
    $('bCopy').onclick = async () => { try { await navigator.clipboard.writeText(JSON.stringify(res, null, 1)); $('bCopy').textContent = L('已复制', 'Copied'); } catch { } };
    $('secSettings').scrollIntoView({ behavior: 'smooth', block: 'start' });
  } });
};

// ---------- 长回答模式 ----------
$('long').onclick = async () => {
  if (running) return;
  const pc = await precheck({ C: 512 });
  if (pc.longMode.allowed === false) { setLive('benchOut', () => `<p class="bad">${esc(ERR.long_mode_unavailable[EN_() ? 1 : 0])}</p>`); return; }
  try { sessionStorage.setItem('gate-msg', $('msg').value); } catch { }
  brain?.dispose(); location.search = '?C=512&auto=1' + (q.get('w') ? '&w=' + encodeURIComponent(q.get('w')) : '');
};
try { const m = sessionStorage.getItem('gate-msg'); if (m != null) { $('msg').value = m; sessionStorage.removeItem('gate-msg'); } } catch { }
