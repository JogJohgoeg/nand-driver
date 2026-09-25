// 门电路大脑视图：在工作台里直接用 BitCPM4-1B 的门电路版（/gate/ 同一份代码与权重）对话。
// 它不接 Pi 代理：Pi 的系统提示约 2,560 token，而这颗电路的容量是 127 token（C128，提示 + 回答）。
// 这里是一问一答；装得下就带上前几轮，装不下就从最早的一轮开始丢，并在消息下注明。
// 代码从本站 ../gate/ 加载（Cloudflare 主站与 Pages 镜像都有），权重走 gate-brain.mjs 的默认地址。
// 语言取 <html lang>（bench-i18n.js 切换时设置）；不静态导入它，免得它加载失败时连带整个工作台起不来
const L = (zh, en) => document.documentElement.lang === 'en' ? en : zh;
const $ = id => document.getElementById(id);
const GATE = new URL('../../gate/gate-brain.mjs', import.meta.url).href;
const NAND_PER_TOKEN = 282853973242;   // 与 /gate/ 页面相同：C128 每拍 NAND（count_all.mjs 实测）
const SYSTEM = { role: 'system', content: 'You are a helpful assistant.' };
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const STAGE = { cache: ['检查本机缓存', 'Checking local cache'], download: ['下载并校验权重', 'Downloading & verifying weights'], generate: ['现场生成电路', 'Building circuit'], upload: ['从缓存上传', 'Uploading from cache'] };
const STOP = { eos: ['模型结束', 'model finished'], max_tokens: ['达到 token 上限', 'token limit reached'], capacity: ['容量已满', 'capacity full'], stopped: ['已停止', 'stopped'], tool_truncated: ['工具调用截断', 'tool call truncated'], tool_aborted: ['工具调用中止', 'tool call aborted'] };
const WHAT_EN = { 'WebGPU 适配器': 'WebGPU adapter', '单个存储缓冲绑定上限': 'Max storage buffer binding', '单个缓冲大小上限': 'Max buffer size', '每阶段存储缓冲数': 'Storage buffers per stage', '工作组共享内存': 'Workgroup shared memory', '内存': 'Memory', '本机缓存空间': 'Local cache space' };
const detailEn = d => d.replace(/（需要 ≥ ([^）]+)）/g, ' (need ≥ $1)').replace(/ 字节/g, ' bytes').replace(/^浏览器报告 ≥ (\d+) GB（浏览器最多报 8）。$/, 'Browser reports ≥ $1 GB (browsers report at most 8).').replace(/^可用约 ([\d.]+) GB（缓存需要约 ([\d.]+) GB）$/, 'About $1 GB free (cache needs about $2 GB)');

let mod = null, brain = null, ctrl = null, started = false;
const history = [];   // {role, content}

async function gateModule() {
  if (mod) return mod;
  try { mod = await import(GATE); return mod; }
  catch (e) {
    $('gate-stage').innerHTML = esc(L('这个托管处没有门电路大脑的代码。', 'This host does not carry the gate-brain code.')) + ' <a href="https://nand.aihashrate.stream/gate/" target="_blank" rel="noopener">' + esc(L('去门电路大脑页面 ↗', 'Open the gate-brain page ↗')) + '</a>';
    $('gate-load').hidden = true; throw e;
  }
}

function renderChecks(rows) {
  $('gate-checks').innerHTML = rows.map(r => {
    const mark = r.ok === true ? '✓' : r.ok === 'warn' ? '!' : '✗';
    return `<li class="${r.ok === true ? 'ok' : r.ok === 'warn' ? 'warn' : 'bad'}"><span>${mark}</span> ${esc(L(r.what, WHAT_EN[r.what] || r.what))}<small>${esc(L(r.detail, detailEn(r.detail)))}</small></li>`;
  }).join('');
}

const visible = () => !$('gate-view').hidden;
function setStatus() {
  if (!visible()) return;
  $('status-brain').textContent = brain?.capabilities ? L('● 门电路大脑已就绪', '● Gate brain ready') : started ? L('◌ 门电路大脑准备中', '◌ Gate brain preparing') : L('○ 门电路大脑未加载', '○ Gate brain not loaded');
  $('status-gates').textContent = '2.83 × 10¹¹ NAND / token';
  $('status-flips').textContent = 'Δ —';
}

function onEvent(e) {
  if (e.type === 'precheck') renderChecks(e.rows);
  else if (e.type === 'progress' && e.stage !== 'prompt') {
    const detail = e.total ? (e.stage === 'download' ? `${(e.done / 1e6).toFixed(0)} / ${(e.total / 1e6).toFixed(0)} MB` : `${e.done} / ${e.total}`) : (e.unit || e.tag || '');
    $('gate-stage').textContent = (STAGE[e.stage] ? L(...STAGE[e.stage]) : e.stage) + (detail ? '：' + detail : '');
    const bar = $('gate-progress'); bar.hidden = false;
    if (e.total) { bar.max = e.total; bar.value = e.done; } else bar.removeAttribute('value');
    setStatus();
  }
  else if (e.type === 'progress') $('gate-run').textContent = L('读入提示', 'Reading prompt') + `: ${e.done} / ${e.total}`;
  else if (e.type === 'ready') {
    $('gate-progress').hidden = true;
    $('gate-stage').textContent = L(`就绪（C${e.C}，${e.warm ? '本机缓存' : '现场生成'}，${(e.prepMs / 1e3).toFixed(0)} s）`, `Ready (C${e.C}, ${e.warm ? 'from local cache' : 'freshly built'}, ${(e.prepMs / 1e3).toFixed(0)} s)`);
    $('gate-form').hidden = false; $('gate-send').disabled = false; $('gate-load').hidden = true; $('gate-checks').hidden = true; $('gate-input').focus();
    document.querySelector('[data-gate-brain] .status-dot')?.classList.add('active');
    setStatus();
  }
  else if (e.type === 'warning') $('gate-note').textContent = e.message;
  else if (e.type === 'error') { $('gate-stage').textContent = e.message; $('gate-load').hidden = false; $('gate-load').disabled = false; started = false; }
}

async function precheckOnly() {
  const m = await gateModule();
  const pc = await m.precheck({ C: 128 });
  renderChecks(pc.rows);
  if (pc.hard) { $('gate-stage').textContent = L('这台设备不满足硬性条件，未开始下载。', 'This device does not meet the hard requirements; nothing was downloaded.'); $('gate-load').disabled = true; return; }
  // 有本机缓存（/gate/ 或这里之前生成过）就直接启动，不必再点
  try { const root = await navigator.storage.getDirectory(); for await (const [n] of root.entries()) if (n.startsWith('gatesim-')) { start(); return; } } catch { }
}

async function start() {
  if (started) return; started = true;
  const m = await gateModule();
  $('gate-load').disabled = true; $('gate-note').textContent = '';
  brain = m.createGateBrain({ C: 128, onEvent });
  brain.ready.catch(() => { });
  setStatus();
}

function bubble(role, html) {
  const div = document.createElement('div'); div.className = 'gate-msg ' + role; div.innerHTML = html;
  $('gate-log').append(div); div.scrollIntoView({ block: 'end' }); return div;
}

async function ask(text) {
  if (!brain?.capabilities || !text.trim()) return;
  $('gate-send').disabled = true; $('gate-stop').disabled = false; $('gate-input').value = '';
  bubble('user', esc(text));
  const out = bubble('assistant', '<span class="gate-wait">' + esc(L('读入提示…', 'Reading prompt…')) + '</span>'), info = document.createElement('p');
  info.className = 'gate-info'; out.after(info);
  ctrl = new AbortController();
  // 电路容量 127 token：先带上全部历史，超了就从最早的一轮丢起（提示过长会在求值前直接报错，不浪费时间）
  let turns = history.slice(), dropped = 0, r = null;
  try {
    for (;;) {
      try {
        r = await brain.ask([SYSTEM, ...turns, { role: 'user', content: text }], null, {
          signal: ctrl.signal, maxTokens: 256,
          onToken: tk => { out.textContent = tk.text.replace(/<\|im_end\|>$/, ''); out.scrollIntoView({ block: 'end' }); },
        });
        break;
      } catch (e) {
        if (e.code === 'prompt_too_long' && turns.length) { turns = turns.slice(2); dropped += 1; continue; }
        throw e;
      }
    }
    history.push({ role: 'user', content: text }, { role: 'assistant', content: r.text });
    const n = ((r.promptIds?.length || 0) + (r.ids?.length || 0)) * NAND_PER_TOKEN;
    const stop = STOP[r.stop] ? L(...STOP[r.stop]) : r.stop, per = r.msPerToken ? (r.msPerToken / 1e3).toFixed(2) + ' s' : '—', nn = n.toExponential(2).replace('e+', ' × 10^');
    info.textContent = L(`结束：${stop}；首 token ${(r.firstTokenMs / 1e3).toFixed(1)} s，每 token ${per}；本次约 ${nn} 次 NAND 求值`,
      `Done: ${stop}; first token ${(r.firstTokenMs / 1e3).toFixed(1)} s, ${per} per token; ≈ ${nn} NAND evaluations`);
    if (dropped) info.textContent += L(`；为装进 127 token 容量，没带最早的 ${dropped} 轮对话`, `; to fit the 127-token capacity, the earliest ${dropped} turn(s) were left out`);
    if (r.stop === 'capacity') info.textContent += L('。回答写满了电路容量（提示 + 回答 ≤ 128 token）；点「新对话」清空上文再问，能留出更多回答空间。', '. The reply filled the circuit capacity (prompt + reply ≤ 128 tokens); click “New chat” to clear context and leave more room.');
    if (r.msPerToken && visible()) $('status-rate').textContent = `${(1000 / r.msPerToken).toFixed(2)} tok/s`;
  } catch (e) {
    if (e.name === 'AbortError' || ctrl.signal.aborted) info.textContent = L('已停止。', 'Stopped.');
    else if (e.code === 'prompt_too_long') info.textContent = L('这句话本身就超过了电路容量（127 token），请说短一点。', 'This message alone exceeds the circuit capacity (127 tokens); please shorten it.');
    else info.textContent = e.message;
  }
  $('gate-run').textContent = ''; info.scrollIntoView({ block: 'end' });
  $('gate-send').disabled = false; $('gate-stop').disabled = true; $('gate-input').focus();
}

$('gate-load').onclick = start;
$('gate-form').onsubmit = e => { e.preventDefault(); ask($('gate-input').value); };
$('gate-input').addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); if (!$('gate-send').disabled) ask($('gate-input').value); } });
$('gate-stop').onclick = () => { ctrl?.abort(); brain?.stop(); };
$('gate-new').onclick = () => { if (!$('gate-stop').disabled) return; history.length = 0; $('gate-log').innerHTML = ''; };
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
