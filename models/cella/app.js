// SPDX-License-Identifier: CC0-1.0
// Page script: only shows what the two background threads report. Nothing here computes the model.
// Every time shown is measured here, on this machine, in this run.
let PIN = document.getElementById('pin').textContent.trim();   // the pinned model root is written once, in index.html
const CHAIN_NOTE = { sha: 'b1507f55d3bd80bbc55f9e06dc656d81e049138827c97ec7fe640d7bfa2ce0b7', date: '2026-11-15 04:31 UTC', block: '75,948,049' };
const $ = id => document.getElementById(id);
const fmtMs = ms => (ms == null ? '' : ms < 1000 ? Math.round(ms) + ' 毫秒' : (ms / 1000).toFixed(1) + ' 秒');
const secs = t0 => ((performance.now() - t0) / 1000).toFixed(1) + ' 秒';
const STEPS = [['manifest', '清单'], ['root', '模型根'], ['segS', '结构段 S'], ['segT', '常数表段 T'], ['segW', '权重段 W'], ['segD', '说明段 D'], ['segN', '叶子副本段 N'], ['struct', '结构和范围'], ['leaf', '叶子自检'], ['fast', '点积模块自检'], ['tshort', '短测试向量'], ['tfull', '整窗口测试向量']];
const stepName = id => STEPS.find(s => s[0] === id)[1];
const rows = {};
for (const [id] of STEPS) rows[id] = document.querySelector(`#steps tr[data-step="${id}"]`);   // the rows are in index.html from the first frame
const resCell = id => rows[id].cells[2].firstElementChild;
// state: files checked by the continuation thread (genReady); test vectors: 'run' | 'ok' | 'fail'; short ones: 'run' | 'ok'
let BASE = 'model/', HOST = null;
let pending = 0, genReady = false, tests = 'run', testsShort = 'run', working = false, demo = false, voided = false, leaves = [], win = { size: 0, drop: 0 };
let demoWait = false;                // demonstration: the altered file's test vectors start only after a few pieces were written
let genTimes = [], genN = 0, filesMs = null, perToken = [], warmLog = [], verified = 0;
const T = window.__timing = {};
const clock = {};                     // step id -> start time, while that row is running (its time cell counts up)
let vecT0 = 0, subBase = '';                    // first-screen line about the test vectors, without the running time
const G = { phase: null };            // what the continuation thread is doing now: null | 'step' | 'warm'
const setRow = (id, state, text, ms) => {
  const c = rows[id].cells;
  c[1].textContent = state === 'ok' ? '过' : state === 'run' ? '在做' : state === 'cut' ? '中断' : '没过'; c[1].className = state === 'ok' ? 'ok' : state === 'run' ? 'run' : state === 'cut' ? 'mut' : 'bad';
  resCell(id).textContent = text; c[2].className = '';
  if (state !== 'run') delete clock[id];
  if (ms != null) c[3].textContent = fmtMs(ms);
};
const refresh = () => {
  const usable = genReady && tests !== 'fail' && !voided;
  $('go').disabled = !usable || working; $('leafgo').disabled = !usable || working; $('verify').disabled = working;
  document.querySelectorAll('[data-neg]').forEach(x => { x.disabled = !usable || working; });
  $('demo').disabled = !(usable && testsShort === 'ok' && !working && !demo);
  if (genReady && $('go').textContent !== '续写') { $('go').textContent = '续写'; $('out').textContent = '（点「续写」）'; $('negout').textContent = '（点上面任一个按钮）'; }
};
// the line under the buttons: what is being computed now, with the time it has taken so far
const renderProg = () => {
  if (voided) return;
  if (G.stopping) { $('genprog').textContent = `${G.stopText} 点「停」后已过 ${secs(G.stopT0)}`; return; }   // keeps moving until the thread has really stopped
  if (!G.phase) return;
  if (G.phase === 'step') $('genprog').textContent = `正在算第 ${G.n} 个词片（上下文 ${G.window} 个词片）· 这一步已用 ${secs(G.t0)}`;
  else {
    const head = G.why === 'drop' ? `窗口满了：上下文到了 ${win.size} 个词片，丢掉最早的 ${win.drop} 个，正在把剩下的 ${G.positions} 个从位置 0 重算。已重算` : `上下文有 ${G.positions} 个词片还没算过，正在从位置 ${G.from} 算起。已算到`;
    $('genprog').textContent = `${head} ${G.done} / ${G.positions} 个位置 · 已用 ${secs(G.t0)} · 可以点「停」`;
  }
};
setInterval(() => {
  renderProg();
  for (const id in clock) rows[id].cells[3].textContent = secs(clock[id]);
  // first screen: while a test vector is being computed, its time so far counts up there too
  const running = clock.tfull ? 'tfull' : clock.tshort ? 'tshort' : null;
  if (running && subBase && tests === 'run' && !demo) $('t-sub').textContent = `${subBase} · 这一个已用 ${secs(vecT0)}`;
}, 100);
const voidOutput = why => {
  voided = true; G.phase = null; gen.postMessage({ cmd: 'stop' });
  $('out').className = 'void'; $('voidnote').hidden = false; $('voidnote').textContent = '核对没过，不作数：' + why + '。续写已停，上面划掉的字不是这份文件核对通过后算出来的。';
  $('stop').disabled = true; $('stop').textContent = '停'; $('genprog').textContent = '已停'; refresh();
};
const median = a => { const s = a.slice().sort((x, y) => x - y); return s.length ? s[s.length >> 1] : null; };

const dead = e => { $('t-step').textContent = '后台线程没起来'; $('t-pass').textContent = '没过'; $('t-pass').className = 'big bad'; $('t-sub').textContent = (e && e.message) || ''; };
const ask = o => { pending++; working = true; refresh(); gen.postMessage(o); };   // every command to the continuation thread ends with one 'idle'

// ---- the thread that checks the files and then runs the test vectors
const onVer = e => {
  const o = e.data;
  if (demo && o.ev === 'step') {          // first screen now describes the altered file, step by step
    $('t-step').textContent = '改过的那份文件：' + stepName(o.id) + (o.state === 'ok' ? '核完' : '在核'); $('t-sub').textContent = o.text; demoSay(o.id, '核测试向量前先核文件：' + stepName(o.id) + (o.state === 'ok' ? '核完' : '在核') + '：' + o.text, o.text, o.state !== 'ok');
  } else if (demo && o.ev === 'files') {
    $('t-step').textContent = '改过的那份文件：文件自己的哈希对得上，测试向量在跑';
    $('t-pass').textContent = '改过的文件：哈希自洽，但没有对钉住的模型根；测试向量还在跑'; $('t-pass').className = 'big run';
    $('t-time').textContent = `改过的文件：取文件加核对 ${fmtMs(o.loadVerifyMs)}`;
  } else if (o.ev === 'step' && !demo) {
    setRow(o.id, o.state, o.text, o.ms);
    if (o.state === 'run' && !clock[o.id]) clock[o.id] = performance.now();
    if (o.id === 'tshort' && o.state === 'ok') {
      testsShort = 'ok'; T.testsShortMs = o.ms;
      if (tests === 'run') { $('t-step').textContent = '短测试向量过了，整窗口的在后台跑'; $('t-pass').textContent = '文件对得上，短测试向量过了；整窗口测试向量还在跑'; }
      refresh();
    } else if (o.id === 'tfull' && o.state === 'ok') T.testsFullMs = o.ms;
    else if (!genReady && testsShort === 'run') { $('t-step').textContent = stepName(o.id); $('t-sub').textContent = o.text; }
  } else if (o.ev === 'model' && !demo) {
    leaves = o.leaves; win = o.desc.window;
    if ($('t-bytes')) { $('t-bytes').textContent = o.bytes.toLocaleString(); $('t-chunks').textContent = o.chunks; }
    $('w-size').textContent = win.size; $('w-drop').textContent = win.drop; $('w-words').textContent = o.desc.words;
    for (const lf of leaves) {
      const tr = document.createElement('tr');
      tr.innerHTML = `<td>${lf.name}</td><td class="n">${lf.nand.toLocaleString()}</td><td class="n">${lf.latch}</td><td class="n">${lf.beats}</td><td class="mono">${lf.sha}</td><td>${lf.taped ? '<span class="ok">已流片</span>' : '<span class="mut">没流片</span>'}</td><td id="lc${lf.i}" class="mut">…</td>`;
      $('leaves').tBodies[0].appendChild(tr);
      const op = document.createElement('option'); op.value = lf.i; op.textContent = lf.name; $('leafsel').appendChild(op);
    }
    $('self').textContent = `${leaves.length} 颗叶子的网表副本都在文件里，每颗的 sha256 等于结构段里记的值（本页刚才现场核的）。这只说明文件自己对得上。`;
    const t = leaves.filter(l => l.taped), d = t[0];
    $('chain').innerHTML = d && d.sha === CHAIN_NOTE.sha
      ? `${leaves.length} 颗里 ${t.length} 颗已流片：<code>${d.name}</code>，链号 ${d.chainId}、处理器合约 <code>0x${d.cpu}</code>、电路编号 ${d.cid}。${CHAIN_NOTE.date} 用一次只读调用在块 ${CHAIN_NOTE.block} 上读回它的网表，sha256 和上表相符。<b>这是那天核的，不是本页现场核的</b>；本页不连链。其余 ${leaves.length - t.length} 颗没有流片。`
      : '这份文件的叶子没有读回核过的链上记录，不能说它们在链上。';
  } else if (o.ev === 'leafcheck' && !demo && o.auto) {
    const r = o.r, cell = $('lc' + o.i);
    cell.textContent = `${r.samples.toLocaleString()} / ${r.mismatches}` + (r.skipped ? `（域外跳过 ${r.skipped}）` : ''); cell.className = r.mismatches === 0 ? 'ok' : 'bad';
  } else if (o.ev === 'files' && !demo) {
    filesMs = o.loadVerifyMs; T.loadVerifyMs = o.loadVerifyMs;
    $('t-step').textContent = '文件核完，测试向量在后台跑'; $('t-sub').textContent = `${o.tests} 个测试向量，短的先跑`; $('t-pass').textContent = '文件对得上，可以先用；测试向量还没跑完';
    $('t-time').textContent = `取文件加核对 ${fmtMs(filesMs)}`;
  } else if (o.ev === 'tests') {
    if (o.demo) { $('demoout').lastChild.textContent = `改过的文件：测试向量 ${o.done} / ${o.n} 已相符，还在跑…`; $('t-sub').textContent = `改过的文件：测试向量 ${o.done} / ${o.n} 已相符，还在跑`; return; }
    if (o.done < o.n) {
      const id = 't' + o.id;
      setRow(id, 'run', `${o.partN} 个里已过 ${o.partDone} 个；正在算一个 ${o.len} 个词片的` + (o.id === 'full' ? '（整份模型算一遍）' : ''));
      if (!clock[id]) clock[id] = performance.now();
      vecT0 = performance.now();
      subBase = `测试向量 ${o.done} / ${o.n} 已过，正在算一个 ${o.len} 个词片的`; $('t-sub').textContent = subBase;
    }
  } else if (o.ev === 'tv' && !o.demo) {
    (T.vectors = T.vectors || []).push({ index: o.index, pieces: o.len, full: o.full, ms: o.ms, ok: o.ok });
  } else if (o.ev === 'prog' && !o.demo && tests === 'run' && rows[o.what]) {
    resCell(o.what).textContent = resCell(o.what).textContent.split('｜')[0] + '｜叶子求值 ' + o.calls.toLocaleString() + (o.total ? ' / ' + o.total.toLocaleString() : '');
  } else if (o.ev === 'ready' && !o.demo) {
    tests = 'ok'; T.testsMs = o.testsMs; T.totalMs = o.totalMs;
    $('t-step').textContent = '全部核完'; $('t-sub').textContent = `文件和 ${o.n} 个测试向量（${o.scores.toLocaleString()} 个输出分数）都对得上`;
    $('t-pass').textContent = '过了'; $('t-pass').className = 'big ok';
    $('t-time').textContent = `取文件加核对 ${fmtMs(filesMs)}；测试向量 ${fmtMs(o.testsMs)}；合计 ${fmtMs(o.totalMs)}`;
    refresh();
  } else if (o.ev === 'testfail') {
    if (o.demo) {
      const written = genN; voidOutput('改过的文件' + o.text);
      $('t-step').textContent = '改过的那份文件停在：测试向量'; $('t-sub').textContent = o.text; $('t-pass').textContent = '核对没过'; $('t-pass').className = 'big bad'; $('t-time').textContent = '这是内存里改过的那份文件的结论；原文件要点「回到原文件」重新核';
      const p = document.createElement('div'); p.className = 'ok'; p.textContent = `测试向量拦下了它：${o.text}（用时 ${fmtMs(o.ms)}）。这时续写已经写了 ${written} 个词片，全部标成不作数，续写停了。`;
      $('demoout').appendChild(p); $('reload').hidden = false;
      window.__demo = { stopped: true, failedAt: o.index, tokensWritten: written, voided: $('out').className === 'void', note: $('voidnote').textContent };
      return;
    }
    tests = 'fail'; setRow('t' + o.id, 'bad', o.text, o.ms);
    $('t-pass').textContent = '没过'; $('t-pass').className = 'big bad'; $('t-step').textContent = '停在：测试向量'; $('t-sub').textContent = o.text;
    voidOutput(o.text);
  } else if (o.ev === 'error') {
    if (o.demo) { $('t-step').textContent = '改过的那份文件停在：' + o.check; $('t-sub').textContent = o.message; $('t-pass').textContent = '核对没过'; $('t-pass').className = 'big bad'; const p = document.createElement('div'); p.className = 'bad'; p.textContent = '演示没按预期走：' + o.message; $('demoout').appendChild(p); $('reload').hidden = false; window.__demo = { stopped: false, error: o.message }; return; }
    tests = 'fail'; $('t-pass').textContent = '没过'; $('t-pass').className = 'big bad'; $('t-step').textContent = '停在：' + o.check; $('t-sub').textContent = o.message;
    for (const id in rows) if (rows[id].cells[1].textContent === '在做') setRow(id, 'bad', o.message);
    voidOutput(o.message);
  } else if (o.ev === 'ready' && o.demo) {
    $('t-step').textContent = '改过的那份文件：测试向量全部相符'; $('t-pass').textContent = '改过的文件没有被测试向量拦下（不该这样）'; $('t-pass').className = 'big bad';
    const p = document.createElement('div'); p.className = 'bad'; p.textContent = `改过的文件 ${o.n} 个测试向量居然都相符（不该这样）`; $('demoout').appendChild(p); $('reload').hidden = false; window.__demo = { stopped: false };
  }
};
const mkVer = () => { const w = new Worker('worker.js', { type: 'module' }); w.onerror = dead; w.onmessage = onVer; return w; };
let ver = mkVer();
const gen = new Worker('worker.js', { type: 'module' });
gen.onerror = dead;

// ---- the thread that serves continuation, the negative controls and the leaf check
const genStat = () => {
  const drops = warmLog.filter(w => w.why === 'drop');
  $('genstat').textContent = `已写 ${genN} 个词片；最近一个 ${fmtMs(genTimes[genTimes.length - 1])}，这一篇中位 ${fmtMs(median(genTimes))}；上下文 ${G.window} 个词片`
    + (drops.length ? `；窗口满过 ${drops.length} 次，重算用时 ${drops.map(w => fmtMs(w.ms)).join('、')}` : '')
    + ($('verify').checked ? `；核对模式：已重算比对 ${verified.toLocaleString()} 个留用的结果，没有不同` : '')
    + (tests === 'run' ? '；测试向量还在后台跑，这些字要等它跑完才算数' : '');
  window.__gen = { tokens: genN, medianMs: median(genTimes), lastMs: genTimes[genTimes.length - 1], perToken, warm: warmLog, verified, testsStateWhenWritten: tests };
};
gen.onmessage = e => {
  const o = e.data;
  // demonstration: this thread loads the altered copy; show each step on the first screen as it goes, so the page
  // never sits still while the altered file is being checked (the verify thread does the same for its own load)
  if (demo && demoWait && o.ev === 'step') { const s = '改过的那份文件：' + stepName(o.id) + (o.state === 'ok' ? '核完' : '在核'); $('t-step').textContent = s; demoSay(o.id, s + '：' + o.text, o.text, o.state !== 'ok'); return; }
  if (demo && demoWait && o.ev === 'leafcheck' && o.auto) { const s = `改过的那份文件：叶子自检，已核 ${o.i + 1} / ${leaves.length || o.i + 1} 颗`; demoSay('leaf', s, s, true); return; }
  if (o.ev === 'files') {
    if (o.demo) { demoSay('gen', '改过的那份文件核完，开始续写；写出 3 个词片再核它的测试向量', '改过的那份文件核完，开始续写', true); startGen(); return; }
    // the first screen must be true at the moment the button opens: this thread has checked every hash and the model root
    if (filesMs == null && tests === 'run') { $('t-step').textContent = '文件核完，测试向量在后台跑'; $('t-sub').textContent = `${o.tests} 个测试向量，短的先跑`; $('t-pass').textContent = '文件对得上，可以先用；测试向量还没跑完'; }
    genReady = true; T.genReadyMs = performance.now(); refresh();
    T.unlock = { ms: T.genReadyMs, go_disabled: $('go').disabled, pass: $('t-pass').textContent, step: $('t-step').textContent };
  } else if (o.ev === 'tampered') {
    const p = document.createElement('div'); p.textContent = o.text; $('demoout').textContent = ''; $('demoout').className = 'small'; $('demoout').appendChild(p);
    $('demoout').appendChild(document.createElement('div')).textContent = '文件自己的哈希都对得上，所以续写放开了；先让它写出 3 个词片，再核测试向量…';
  } else if (o.ev === 'leafcheck' && !o.auto) {
    const r = o.r; $('lc' + o.i).textContent = `${r.samples.toLocaleString()} / ${r.mismatches}` + (r.skipped ? `（域外跳过 ${r.skipped}）` : '');
    $('leafres').textContent = `${r.name}：${r.samples.toLocaleString()} 组输入，逐门算的网表和本机整数例程有 ${r.mismatches} 组不同` + (r.skipped ? `；定义域外跳过 ${r.skipped} 组` : '') + `；用时 ${fmtMs(o.ms)}`;
  } else if (o.ev === 'warm') {
    if (voided) return;
    if (o.kind === 'start') Object.assign(G, { phase: 'warm', why: o.why, from: o.from, done: o.from, positions: o.positions, t0: performance.now() });
    else if (o.kind === 'at') G.done = o.done;
    else if (o.kind === 'stopped') G.done = o.done;
    else { warmLog.push({ why: o.why, positions: o.positions, ms: o.ms, evals: o.evals }); G.done = o.positions; }
    renderProg();
  } else if (o.ev === 'gen') {
    if (voided) return;
    if (o.kind === 'start') { $('out').textContent = o.text; $('out').className = ''; $('genstat').textContent = `开头分成 ${o.ids.length} 个词片：${o.ids.join(' ')}` + (o.verify ? '；核对模式开着' : ''); }
    else if (o.kind === 'refused') { G.phase = null; G.stopping = false; $('genstat').textContent = '没有续写：' + o.text; $('genprog').textContent = '已停：开头太长。'; $('stop').disabled = true; $('stop').textContent = '停'; }
    else if (o.kind === 'step') { Object.assign(G, { phase: 'step', n: o.n, window: o.window, t0: performance.now() }); renderProg(); }
    else if (o.kind === 'token') {
      genTimes.push(o.ms); genN = o.n; verified = o.verified; $('out').textContent = o.text;
      if (demoWait && o.n >= 3) startDemoTests();
      perToken.push({ n: o.n, window: o.window, ms: o.ms, evals: o.evals, dropped: o.dropped, test_vectors_running: tests === 'run' });   // the test vectors have a thread of their own; a piece timed while they run shares the machine with them
      const tr = document.createElement('tr');
      tr.innerHTML = `<td class="n">${o.n}</td><td>${o.token}</td><td class="mono"></td><td class="n">${fmtMs(o.ms)}</td><td class="n">${o.window}${o.dropped ? '（刚丢过）' : ''}</td><td class="n">${o.evals.toLocaleString()}</td><td class="n">${o.rank + 1}</td>`;
      tr.cells[2].textContent = o.piece; $('toks').tBodies[0].appendChild(tr);
      genStat();
    } else {
      const g = `${G.why === 'drop' ? '窗口满后的重算' : '这一段计算'}做到 ${G.done} / ${G.positions} 个位置，没做完`;
      G.phase = null; G.stopping = false; $('stop').textContent = '停';
      $('genstat').textContent += `；停下的原因：${o.why}`;
      $('genprog').textContent = o.why === '已停' ? (o.during === 'warm' ? `已停（你点了「停」；${g}）。已经写出的字留在下面。` : '已停（你点了「停」）。已经写出的字留在下面。') : `已停：${o.why}。已经写出的字留在下面。`;
      $('stop').disabled = true;
    }
  } else if (o.ev === 'neg') {
    const box = document.createElement('div'); box.className = 'neg';
    for (const l of o.lines) {
      const p = document.createElement('div');
      if (l.note) { p.innerHTML = '<b></b>'; p.firstChild.textContent = l.what; }
      else { p.textContent = l.what + ' → ' + l.result; p.className = l.stopped === l.expect ? (l.stopped ? 'ok' : '') : 'bad'; }
      box.appendChild(p);
    }
    const which = document.createElement('div'); which.className = 'mut'; which.textContent = '改的是内存里的一份拷贝，改完核完就丢；页面载入的仍是原文件，第一屏说的是原文件。'; box.appendChild(which);
    const f = document.createElement('div'); f.className = o.ok ? 'ok' : 'bad';
    f.textContent = (o.ok ? '和预期一致' : '和预期不一致') + `；用时 ${fmtMs(o.ms)}`; box.appendChild(f);
    $('negout').textContent = ''; $('negout').className = 'small'; $('negout').appendChild(box);
    (window.__neg = window.__neg || {})[o.which] = { ok: o.ok, lines: o.lines, ms: o.ms };
  } else if (o.ev === 'error') {
    if (o.cmd === 'load' && !o.demo) { $('t-pass').textContent = '没过'; $('t-pass').className = 'big bad'; $('t-step').textContent = '停在：' + o.check; $('t-sub').textContent = o.message; }
    else if (o.cmd === 'gen' && o.check === '核对模式') voidOutput('核对模式：' + o.message);
    else { G.phase = null; G.stopping = false; $('genstat').textContent = '出错：' + o.message; $('genprog').textContent = '已停：出错。'; $('stop').disabled = true; $('stop').textContent = '停'; }
  } else if (o.ev === 'idle') { pending = Math.max(0, pending - 1); working = pending > 0; refresh(); }
  // demonstration: until the altered file's test vectors start, the line under the demo button follows the continuation
  // (the continuation itself is shown higher up, usually out of view while the reader is at the demo button)
  if (demo && demoWait && o.ev === 'warm' && o.kind !== 'start') demoSay('gen', `改过的文件续写：开头算到 ${G.done} / ${G.positions} 个位置；写出 3 个词片再核测试向量`, '改过的文件在续写', true);
  if (demo && demoWait && o.ev === 'gen' && o.kind === 'token') demoSay('gen', `改过的文件续写：已写 ${o.n} 个词片；写出 3 个再核测试向量`, '改过的文件在续写', true);
  if (demoWait && (o.ev === 'error' || (o.ev === 'gen' && (o.kind === 'end' || o.kind === 'refused')))) startDemoTests();   // continuation ended before three pieces
};
// one line under the demo button that follows the altered file's load (the first screen may be scrolled out of view)
const demoLine = () => { let d = document.getElementById('demostep'); if (!d) { d = document.createElement('div'); d.id = 'demostep'; d.className = 'run'; $('demoout').appendChild(d); } return d; };
// while a step of the altered file is being checked, that line and the first screen count the seconds (some steps send no
// progress of their own for over half a second)
const DS = { id: null, line: '', sub: '', t0: 0, on: false };
const demoTick = () => { const x = DS.on ? `（这一步已用 ${((performance.now() - DS.t0) / 1000).toFixed(1)} 秒）` : ''; demoLine().textContent = DS.line + x; $('t-sub').textContent = DS.sub + x; };
const demoSay = (id, line, sub, running) => { if (id !== DS.id) DS.t0 = performance.now(); Object.assign(DS, { id, line, sub, on: running }); demoTick(); };
setInterval(() => { if (demo && DS.on) demoTick(); }, 100);
function startDemoTests() {
  demoWait = false; $('t-sub').textContent = `续写已经写了 ${genN} 个词片；现在核这份改过的文件的测试向量`;
  ver.postMessage({ cmd: 'load', base: BASE, pin: PIN, role: 'verify', tamper: true, host: HOST });
}

function startGen() {
  G.phase = null; G.stopping = false; window.__gen = null;
  $('stop').disabled = false; $('stop').textContent = '停'; genTimes = []; genN = 0; perToken = []; warmLog = []; verified = 0; $('toks').tBodies[0].textContent = '';
  $('out').textContent = $('prompt').value; $('out').className = ''; $('genstat').textContent = '正在分词…'; $('genprog').textContent = '';
  ask({ cmd: 'gen', prompt: $('prompt').value, verify: $('verify').checked, max: Math.max(1, Math.min(1000, +$('max').value || 40)) });
}
$('go').onclick = startGen;
// the answer to a press must be visible at once: the button and the line under it change in this same handler
$('stop').onclick = () => { $('stop').disabled = true; $('stop').textContent = '正在停…'; const w = G.phase === 'warm'; G.stopping = true; G.stopT0 = performance.now(); G.stopText = w ? '正在停（算完手上这一小段）…' : '正在停（算完手上这个词片）…'; $('genprog').textContent = G.stopText; gen.postMessage({ cmd: 'stop' }); };
document.querySelectorAll('[data-neg]').forEach(b => { b.onclick = () => { $('negout').textContent = '正在内存里改并重新核对：' + b.textContent + '…'; $('negout').className = 'small run'; ask({ cmd: 'neg', which: b.dataset.neg }); }; });
$('leafgo').onclick = () => { const n = Math.max(32, Math.min(50000, +$('leafn').value || 2000)); $('leafres').textContent = `正在逐门算 ${n.toLocaleString()} 组…`; ask({ cmd: 'leafcheck', i: +$('leafsel').value, n }); };
$('demo').onclick = () => {
  demo = true; $('demoout').textContent = '正在内存里改一个权重、重算全部哈希、强行载入…'; $('demoout').className = 'small run';
  // from this moment the page runs the altered copy, so the first screen must say so
  $('t-step').textContent = '现在跑的是在内存里改过的那份文件'; $('t-sub').textContent = '正在改一个权重、重算全部哈希、强行载入（不对钉住的模型根）';
  $('t-pass').textContent = '改过的文件：还在核'; $('t-pass').className = 'big run'; $('t-time').textContent = '';
  $('stepsnote').classList.add('on');   // the note has its place above the table from the first frame; only shown now
  if (tests === 'run') {                // the original file's full-window vectors are still running on that thread: cut them, and say so
    ver.terminate(); ver = mkVer();
    for (const id of ['tshort', 'tfull']) if (rows[id].cells[1].textContent !== '过') setRow(id, 'cut', '没跑完：点了演示，原文件的这一步被中断。「回到原文件」会从头再跑。');
  }
  demoWait = true;                      // the altered file's test vectors start once three pieces are written (startDemoTests)
  ask({ cmd: 'load', base: BASE, pin: PIN, role: 'gen', tamper: true, host: HOST });
};
$('reload').textContent = '回到原文件（重新核一遍）';
$('reload').onclick = () => location.reload();

// ---- start
(async () => {
  ver.postMessage({ cmd: 'load', base: BASE, pin: PIN, role: 'verify', host: HOST });
  pending++; gen.postMessage({ cmd: 'load', base: BASE, pin: PIN, role: 'gen', host: HOST });
  $('t-step').textContent = '取清单';
})();
