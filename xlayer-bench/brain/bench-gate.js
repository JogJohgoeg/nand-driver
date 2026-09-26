// 门电路大脑视图：在工作台里直接用 BitCPM4-1B 的门电路版（/gate/ 同一份代码与权重）对话。
// 它不接 Pi 代理：Pi 的系统提示约 2,560 token，而这颗电路的容量是 127 token（C128，提示 + 回答）。
// 带上文：装不下时先缩短之前的回答、再只留问题、最后才丢最早的轮次（fitTurns），并在消息下注明。
// 代码从本站 ../gate/ 加载（Cloudflare 主站与 Pages 镜像都有），权重走 gate-brain.mjs 的默认地址。
// 语言取 <html lang>（bench-i18n.js 切换时设置）；不静态导入它，免得它加载失败时连带整个工作台起不来
const L = (zh, en) => document.documentElement.lang === 'en' ? en : zh;
const $ = id => document.getElementById(id);
const GATE = new URL('../../gate/gate-brain.mjs', import.meta.url).href;
const NAND_PER_TOKEN = 282073428885;   // 与 /gate/ 页面相同：C128 每拍 NAND（count_all.mjs 实测）
const SYSTEM = { role: 'system', content: 'You are a helpful assistant.' }, MIN_ANSWER = 48;
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
// 面向新手的说法（不出现 C128、token、现场生成等术语）
const STAGE = { cache: ['检查本机有没有之前搭好的电路', 'Looking for a circuit built earlier on this computer'], download: ['下载模型数据', 'Downloading model data'], generate: ['在你的电脑上搭电路', 'Building the circuit on your computer'], upload: ['从本机缓存装入电路', 'Loading the saved circuit'] };
const STOP = { eos: ['回答完毕', 'Done'], max_tokens: ['到了长度上限', 'Reached the length limit'], capacity: ['写满了长度上限', 'Filled the length limit'], stopped: ['已停止', 'Stopped'], tool_truncated: ['工具调用截断', 'Tool call cut off'], tool_aborted: ['工具调用中止', 'Tool call aborted'] };
const dur = ms => { const t = Math.round(ms / 1000); return t < 60 ? L(`${t} 秒`, `${t} s`) : L(`${Math.floor(t / 60)} 分 ${t % 60} 秒`, `${Math.floor(t / 60)} min ${t % 60} s`); };
const big = n => n >= 1e12 ? L(`${(n / 1e12).toFixed(0)} 万亿`, `${(n / 1e12).toFixed(0)} trillion`) : L(`${(n / 1e8).toFixed(0)} 亿`, `${(n / 1e9).toFixed(0)} billion`);
const WHAT_EN = { 'WebGPU 适配器': 'WebGPU adapter', '单个存储缓冲绑定上限': 'Max storage buffer binding', '单个缓冲大小上限': 'Max buffer size', '每阶段存储缓冲数': 'Storage buffers per stage', '工作组共享内存': 'Workgroup shared memory', '内存': 'Memory', '本机缓存空间': 'Local cache space' };
const detailEn = d => d.replace(/（需要 ≥ ([^）]+)）/g, ' (need ≥ $1)').replace(/ 字节/g, ' bytes').replace(/^浏览器报告 ≥ (\d+) GB（浏览器最多报 8）。$/, 'Browser reports ≥ $1 GB (browsers report at most 8).').replace(/^可用约 ([\d.]+) GB（缓存需要约 ([\d.]+) GB）$/, 'About $1 GB free (cache needs about $2 GB)');

let mod = null, brain = null, ctrl = null, started = false, stageT0 = 0, stageD0 = 0, stageName = '', lastRows = null;
// 动态文字登记：切换语言时按新语言重新生成（否则页面的片段翻译器会把中文拆开乱译，如「本机有之前Generation的电路缓存」）
const live = new Map();
const setLive = (id, fn) => { live.set(id, fn); $(id).textContent = fn(); };
window.addEventListener('bench-lang', () => { for (const [id, fn] of live) $(id).textContent = fn(); if (lastRows) renderChecks(lastRows); if (visible()) setStatus(); });
const history = [];   // {role, content}
const queued = [];    // 准备期间先发的问题：{ text, out, info }，就绪后依次回答

async function gateModule() {
  if (mod) return mod;
  try { mod = await import(GATE); return mod; }
  catch (e) {
    $('gate-stage').innerHTML = esc(L('这个托管处没有门电路大脑的代码。', 'This host does not carry the gate-brain code.')) + ' <a href="https://nand.aihashrate.stream/gate/" target="_blank" rel="noopener">' + esc(L('去门电路大脑页面 ↗', 'Open the gate-brain page ↗')) + '</a>';
    $('gate-load').hidden = true; throw e;
  }
}

function renderChecks(rows) {
  lastRows = rows;
  // 默认折叠成一句结论；术语细节点开才看（新手只需要知道能不能跑）
  const bad = rows.filter(r => r.ok !== true && r.ok !== 'warn').length, warn = rows.filter(r => r.ok === 'warn').length;
  $('gate-checks-sum').textContent = bad ? L(`设备检查：${bad} 项不满足（点开看原因）`, `Device check: ${bad} requirement(s) not met (open for details)`)
    : warn ? L(`设备检查：可以运行，${warn} 项需留意（点开看）`, `Device check: can run, ${warn} item(s) to note (open for details)`)
    : L(`设备检查：${rows.length} 项全部通过`, `Device check: all ${rows.length} items passed`);
  $('gate-checks-box').open = bad > 0;
  $('gate-checks').innerHTML = rows.map(r => {
    const mark = r.ok === true ? '✓' : r.ok === 'warn' ? '!' : '✗';
    return `<li class="${r.ok === true ? 'ok' : r.ok === 'warn' ? 'warn' : 'bad'}"><span>${mark}</span> ${esc(L(r.what, WHAT_EN[r.what] || r.what))}<small>${esc(L(r.detail, detailEn(r.detail)))}</small></li>`;
  }).join('');
}

const visible = () => !$('gate-view').hidden;
function setStatus() {
  if (!visible()) return;
  $('status-brain').textContent = brain?.capabilities ? L('● 门电路大脑已就绪', '● Gate brain ready') : started ? L('◌ 门电路大脑准备中', '◌ Gate brain preparing') : L('○ 门电路大脑未加载', '○ Gate brain not loaded');
  $('status-gates').textContent = L('每个字约 2,821 亿次门运算', 'about 282 billion gate ops per token');
  $('status-flips').textContent = 'Δ —';
}

function onEvent(e) {
  if (e.type === 'precheck') renderChecks(e.rows);
  else if (e.type === 'progress' && e.stage !== 'prompt') {
    if (e.stage !== stageName) { stageName = e.stage; stageT0 = performance.now(); stageD0 = e.done || 0; }   // 边下边生成：切到生成阶段时已有若干层完成，速率按本阶段新增的计
    const detailF = () => e.total ? (e.stage === 'download' ? `${(e.done / 1e6).toFixed(0)} / ${(e.total / 1e6).toFixed(0)} MB` : e.stage === 'generate' ? L(`第 ${e.done} / ${e.total} 层`, `layer ${e.done} / ${e.total}`) : `${e.done} / ${e.total}`) : '';
    // 预计剩余：按本阶段已用时间与进度线性估计；下载阶段另加搭电路的大致时间
    const el = performance.now() - stageT0, dd = (e.done || 0) - (e.stage === 'download' ? 0 : stageD0), rest = e.total && dd > 0 && el > 3000 ? el * (e.total - e.done) / dd : null;
    const etaF = () => rest === null ? '' : e.stage === 'download' ? L(`，还要约 ${dur(rest)}（边下边在本机搭电路，下完后再等约 1–2 分钟）`, `, about ${dur(rest)} left (building while downloading; about 1–2 min more after)`) : L(`，还要约 ${dur(rest)}`, `, about ${dur(rest)} left`);
    setLive('gate-stage', () => { const d = detailF(); return (STAGE[e.stage] ? L(...STAGE[e.stage]) : L('准备中', 'Preparing')) + (d ? L('：', ': ') + d : '') + etaF(); });
    const bar = $('gate-progress'); bar.hidden = false;
    if (e.total) { bar.max = e.total; bar.value = e.done; } else bar.removeAttribute('value');
    setStatus();
  }
  else if (e.type === 'progress') {                                   // 读提示进度直接显示在回答气泡里（新手不会去看角落的小字）
    const txt = L(`正在读你的问题：${e.done} / ${e.total}（读完才开始回答）`, `Reading your question: ${e.done} / ${e.total} (the answer starts after this)`);
    $('gate-run').textContent = txt; const w = document.querySelector('#gate-log .gate-msg.assistant:last-of-type .gate-wait'); if (w) w.textContent = txt; }
  else if (e.type === 'ready') {
    $('gate-progress').hidden = true;
    setLive('gate-stage', () => e.warm ? L(`准备好了（用了本机缓存，${dur(e.prepMs)}）。`, `Ready (loaded the saved circuit in ${dur(e.prepMs)}).`)
      : L(`准备好了（用时 ${dur(e.prepMs)}）。下次在这台电脑上打开会快很多（约十几秒）。`, `Ready (took ${dur(e.prepMs)}). Next time on this computer it starts in seconds.`));
    $('gate-form').hidden = false; $('gate-send').disabled = false; $('gate-load').hidden = true; $('gate-checks-box').hidden = true; $('gate-input').focus();
    runQueued();
    document.querySelector('[data-gate-brain] .status-dot')?.classList.add('active');
    setStatus();
  }
  else if (e.type === 'warning') { live.delete('gate-note'); $('gate-note').textContent = e.message; }
  else if (e.type === 'error') { live.delete('gate-stage'); $('gate-stage').textContent = e.message; $('gate-load').hidden = false; $('gate-load').disabled = false; setLive('gate-load', () => L('重试', 'Retry')); started = false; }
}

async function precheckOnly() {
  const m = await gateModule();
  const pc = await m.precheck({ C: 128 });
  renderChecks(pc.rows);
  if (pc.hard) { setLive('gate-stage', () => L('这台设备跑不动它，没有下载任何东西。它需要一台显卡较新、内存 8 GB 以上的电脑（手机和平板一般不行）；具体哪一项不满足，点上面的「设备检查」看。', 'This device cannot run it; nothing was downloaded. It needs a computer with a recent GPU and 8 GB+ of memory (phones and tablets usually cannot); open “Device check” above to see which requirement failed.')); $('gate-load').disabled = true; return; }
  // 不自动开始：本机缓存可能是旧版本代码生成的（用不上，会重新下载），下载几百兆须由用户点按钮
  try { const root = await navigator.storage.getDirectory(); for await (const [n] of root.entries()) if (n.startsWith('gatesim-')) {
    setLive('gate-note', () => L('这台电脑上有之前搭好的电路：版本没变会直接启动（十几秒），否则重新下载并搭建。', 'A circuit built earlier is saved on this computer: if the version matches it starts in seconds, otherwise it is downloaded and rebuilt.')); break; } } catch { }
}

async function start() {
  if (started) return; started = true;
  const m = await gateModule();
  $('gate-load').disabled = true; setLive('gate-load', () => L('准备中…', 'Preparing…')); live.delete('gate-note'); $('gate-note').textContent = '';
  // 准备期间就能提问：先排队，电路好了自动回答（首次准备要几分钟，不必干等）
  $('gate-form').hidden = false; $('gate-send').disabled = false; const ph = () => { $('gate-input').placeholder = L('可以先把问题写好发出，电路准备好后会自动回答。', 'You can send your question now; it will be answered as soon as the circuit is ready.'); }; ph(); window.addEventListener('bench-lang', ph);
  brain = m.createGateBrain({ C: 128, onEvent });
  brain.ready.catch(() => { });
  setStatus();
}

// 新消息后把视图滚到底：输入区是 sticky 贴底，scrollIntoView 停在中间时会被它挡住
const toBottom = () => { const v = $('gate-view'); v.scrollTop = v.scrollHeight; };
function bubble(role, html) {
  const div = document.createElement('div'); div.className = 'gate-msg ' + role; div.innerHTML = html;
  $('gate-log').append(div); toBottom(); return div;
}

// 上文取舍（电路一问一答合计 128 token，给回答至少留 MIN_ANSWER 个）：先把之前的回答缩成开头，再只留之前的问题，
// 最后才从最早一轮整轮丢掉；每一步都用 promptTokens 实测。返回 { turns, note }。
function fitTurns(text) {
  const fits = t => brain.promptTokens([SYSTEM, ...t, { role: 'user', content: text }]) <= 128 - MIN_ANSWER;
  const cut = (t, n) => t.map(m => m.role === 'assistant' && m.content.length > n ? { ...m, content: m.content.slice(0, n) + '…' } : m);
  if (!brain.promptTokens || fits(history)) return { turns: history.slice(), note: '' };
  for (const n of [40, 20, 10]) { const t = cut(history, n); if (fits(t)) return { turns: t, note: L('为装进长度上限，之前的回答只带了开头', 'to fit the length limit, earlier answers were shortened') }; }
  let t = cut(history, 0); if (fits(t)) return { turns: t, note: L('为装进长度上限，只带了你之前的问题，没带之前的回答', 'to fit the length limit, only your earlier questions were kept') };
  let dropped = 0; while (t.length && !fits(t)) { t = t.slice(2); dropped++; }
  return { turns: t, note: L(`为装进长度上限，最早的 ${dropped} 轮对话没带`, `to fit the length limit, the earliest ${dropped} turn(s) were left out`) };
}

function ask(text) {
  if (!text.trim() || !started) return;
  $('gate-input').value = '';
  bubble('user', esc(text));
  const out = bubble('assistant', ''), info = document.createElement('p'); info.className = 'gate-info'; out.after(info);
  if (!brain?.capabilities || running) {  // 还在准备或正在回答上一个：排队
    out.innerHTML = '<span class="gate-wait">' + esc(!brain?.capabilities ? L('电路还在准备，好了会自动开始回答。', 'The circuit is still being prepared; the answer will start automatically.') : L('排队中：答完上一个问题就开始。', 'Queued: starts after the current answer.')) + '</span>';
    queued.push({ text, out, info }); runQueued(); return;
  }
  queued.push({ text, out, info }); runQueued();
}
let running = false;
async function runQueued() {
  if (running || !brain?.capabilities) return; running = true;
  while (queued.length) { const q = queued.shift(); await answer(q.text, q.out, q.info); }
  running = false;
}
async function answer(text, out, info) {
  $('gate-stop').disabled = false;   // 发送键不禁用：回答进行中再发的问题排队，答完这一个接着答
  out.innerHTML = '<span class="gate-wait">' + esc(L('正在读你的问题…（门电路逐位计算，首个字通常要等半分钟到一分钟）', 'Reading your question… (computed bit by bit in gates; the first word usually takes 30–60 s)')) + '</span>';
  ctrl = new AbortController();
  let { turns, note } = fitTurns(text), r = null; const t0 = performance.now();
  try {
    for (;;) {
      try {
        r = await brain.ask([SYSTEM, ...turns, { role: 'user', content: text }], null, {
          signal: ctrl.signal, maxTokens: 256,
          onToken: tk => { out.textContent = tk.text.replace(/<\|im_end\|>$/, ''); toBottom(); },
        });
        break;
      } catch (e) {
        if (e.code === 'prompt_too_long' && turns.length) { turns = turns.slice(2); note = L('为装进长度上限，丢掉了较早的对话', 'to fit the length limit, earlier turns were left out'); continue; }
        throw e;
      }
    }
    history.push({ role: 'user', content: text }, { role: 'assistant', content: r.text });
    const n = ((r.promptIds?.length || 0) + (r.ids?.length || 0)) * NAND_PER_TOKEN;
    const stop = STOP[r.stop] ? L(...STOP[r.stop]) : r.stop, per = r.msPerToken ? L(`${(r.msPerToken / 1e3).toFixed(1)} 秒`, `${(r.msPerToken / 1e3).toFixed(1)} s`) : '—';
    info.textContent = L(`${stop}，用时 ${dur(performance.now() - t0)}（开头等了 ${dur(r.firstTokenMs)}，之后每个字约 ${per}）；这次一共做了约 ${big(n)}次门运算`,
      `${stop} in ${dur(performance.now() - t0)} (first word after ${dur(r.firstTokenMs)}, then about ${per} per word); about ${big(n)} gate operations`);
    if (note) info.textContent += L('；', '; ') + note;
    if (r.stop === 'capacity') info.textContent += L('。回答写满了这颗电路一次能处理的长度，后面没写完：可以把问题问短一点，或点「新对话」后再问。', '. The answer filled the length this circuit can handle and was cut off: ask more briefly, or click “New chat” and ask again.');
    if (r.msPerToken && visible()) $('status-rate').textContent = `${(1000 / r.msPerToken).toFixed(2)} tok/s`;
  } catch (e) {
    if (e.name === 'AbortError' || ctrl.signal.aborted) info.textContent = L('已停止。', 'Stopped.');
    else if (e.code === 'prompt_too_long') info.textContent = L('这句话太长了，超出了这颗电路一次能处理的长度，请说短一点。', 'This message is longer than the circuit can handle at once; please shorten it.');
    else info.textContent = e.message;
  }
  $('gate-run').textContent = ''; toBottom();
  $('gate-stop').disabled = true; $('gate-input').focus();
}

$('gate-load').onclick = start;
$('gate-form').onsubmit = e => { e.preventDefault(); ask($('gate-input').value); };
$('gate-input').addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); ask($('gate-input').value); } });
$('gate-stop').onclick = () => { ctrl?.abort(); brain?.stop(); };
$('gate-new').onclick = () => { if (running) return; history.length = 0; queued.length = 0; $('gate-log').innerHTML = ''; };
for (const chip of document.querySelectorAll('#gate-chips button')) chip.onclick = () => { $('gate-input').value = chip.textContent; $('gate-input').focus(); };

// 状态栏只在本视图可见时显示门电路大脑；切回对话 / 工具时恢复 Pi 大脑原来的状态
const STATUS_IDS = ['status-brain', 'status-gates', 'status-flips', 'status-rate'];
let checked = false, saved = null;
window.addEventListener('bench-view', e => {
  if (e.detail !== 'gate') { if (saved) STATUS_IDS.forEach((id, i) => { $(id).textContent = saved[i]; }); saved = null; return; }
  saved ??= STATUS_IDS.map(id => $(id).textContent);
  setStatus(); if (!brain?.capabilities) $('status-rate').textContent = '— tok/s';
  if (!checked) { checked = true; precheckOnly().catch(() => { }); }
});
