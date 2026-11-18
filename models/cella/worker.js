// SPDX-License-Identifier: CC0-1.0
// Background thread: fetches the six files from the page's own directory, verifies them, runs the model.
// It makes no request anywhere else. The page starts two of these: one checks the files and then runs the test
// vectors (short ones first); the other checks the files and then serves continuation, the negative controls
// and the leaf check.
// The executor files are the same ones the other model's page uses (tgw1.js: whole-file reference path and the
// bit-plane fast path; tgw1inc.js: compute only the rows asked for, keep what did not change).
import * as T from './tgw1.js';
import { Inc } from './tgw1inc.js';
import * as H from './hostA.js';

const KINDS = 'STWDN';
let segs = null, man = null, st = null, desc = null, ex = null, inc = null, pin = null, stopFlag = false, busy = false, last = [];
const say = (ev, o) => postMessage(Object.assign({ ev }, o));
const step = (id, state, text, extra) => say('step', Object.assign({ id, state, text }, extra || {}));
const now = () => performance.now();
const tick = () => new Promise(r => setTimeout(r, 0));
const SELF = 256;
let WARM_STEP = 3;   // positions per slice when many positions have to be computed at once (progress, stop)

async function fetchBytes(url) { const r = await fetch(url, { cache: 'no-store' }); if (!r.ok) throw new T.Reject('取文件', url + ' ' + r.status); return new Uint8Array(await r.arrayBuffer()); }

let demo = false, lastProg = 0, progBase = 0, progTotal = 0;
const evals = () => ex.calls + ex.fastCalls;
const progress = what => calls => {
  const t = now(); if (t - lastProg < 150) return; lastProg = t;
  say('prog', { what, calls: calls - progBase, total: progTotal, demo });
};
const rowBits = () => desc.io.out_cols * desc.io.out_bits;
// score rows [0, n) of a context, computed on demand
const incRows = (ctx, from, to) => inc.run(T.packInput(desc, ctx), [[from * rowBits(), to * rowBits()]]);

// role 'verify': check the files, then run the test vectors. role 'gen': check the files, then wait for commands.
// host: host rules for a test fixture whose description segment has none (never used for the pinned file).
// tamper (demonstration only): after fetching, change one number of the last normalisation row in memory,
// rebuild every hash so that the files are self-consistent, and load WITHOUT comparing to the pinned root.
async function load(base, pinned, role, tamper, host) {
  demo = !!tamper; pin = tamper ? null : pinned; const t0 = now(); let t = now();
  step('manifest', 'run', '取清单…');
  let M = await fetchBytes(base + 'M.bin');
  const raw = {};
  for (const k of KINDS) raw[k] = await fetchBytes(base + k + '.bin');
  if (tamper) {
    const dir = T.parseStructure(raw.S).tensors, tt = dir.find(x => x.name === 'norm') || dir.find(x => x.name === 'cos');
    const off = tt.byteOff + (tt.count - tt.cols) * (tt.storeBits / 8) + 1, k = tt.seg;
    raw[k] = raw[k].slice(); raw[k][off] ^= 0x10;
    M = await T.buildManifest(raw);
    say('tampered', { text: `内存里把 ${k} 段第 ${off.toLocaleString()} 字节翻了一位（张量 ${tt.name} 最后一行的第一项），清单里所有块哈希、三个根、模型根都重算成自洽；不对钉住的模型根，强行载入` });
  }
  man = await T.readManifest(M, pin);
  step('manifest', 'ok', `清单 ${M.length.toLocaleString()} 字节；列了 ${man.totalChunks} 块的哈希；三个根和模型根由块哈希重算，相符`, { ms: now() - t });
  step('root', 'ok', tamper ? `模型根 ${man.modelRoot.slice(0, 16)}…（没有和钉住的值比）` : `模型根 ${man.modelRoot.slice(0, 16)}… 等于本页钉住的值`, { ms: 0, root: man.modelRoot });
  segs = { M };
  let bytes = M.length, chunks = 1;
  for (const k of KINDS) {
    t = now(); step('seg' + k, 'run', `核 ${k} 段…`);
    const b = raw[k];
    await T.checkSegment(man, k, b, (kk, i, n) => { if (i % 4 === 3 || i === n - 1) step('seg' + k, 'run', `${k} 段：已核 ${i + 1} / ${n} 块`); });
    segs[k] = b; bytes += b.length; chunks += man.table[k].chunks;
    step('seg' + k, 'ok', `${k} 段 ${b.length.toLocaleString()} 字节，${man.table[k].chunks} 块，每块 sha256 和整段 sha256 都等于清单`, { ms: now() - t });
  }
  t = now(); step('struct', 'run', '解析结构段，核叶子副本、张量范围…');
  st = T.parseStructure(segs.S);
  await T.validate(segs, st);
  desc = JSON.parse(new TextDecoder().decode(segs.D));
  if (host) { for (const k of ['tokenizer', 'window', 'selection', 'length_cap']) if (!desc[k]) desc[k] = host[k]; if (host.warm_step) WARM_STEP = host.warm_step; }
  for (const k of ['tokenizer', 'window', 'selection', 'length_cap']) if (!desc[k]) throw new T.Reject('说明段', '没有宿主规则 ' + k);
  const nrec = st.modules.reduce((a, m) => a + m.recs.length, 0);
  step('struct', 'ok', `结构段：${st.leaves.length} 颗叶子、${st.modules.length} 个模块、${nrec} 条记录；每颗叶子副本的 sha256 等于结构段里记的值；整数都在声明的位宽内；每个张量都有记录读它`, { ms: now() - t });
  const tvs = desc.test_vectors.map((tv, i) => ({ i, tv, full: tv.ids.length === desc.io.positions })).sort((a, b) => a.tv.ids.length - b.tv.ids.length || a.i - b.i);
  const nShort = tvs.filter(x => !x.full).length, nFull = tvs.length - nShort;
  say('model', {
    leaves: st.leaves.map((lf, i) => ({ i, name: (T.NATIVE[lf.shaHex] || ['?'])[0], sha: lf.shaHex, nand: lf.nNand, latch: lf.nLatch, beats: lf.beats, taped: lf.taped, chainId: lf.chainId, cid: lf.cid, cpu: T.hex(lf.cpu) })),
    desc: { io: desc.io, window: { size: desc.window.size, drop: desc.window.drop }, cap: desc.length_cap.characters, candidates: desc.selection.candidates, words: desc.selection.words, pieces: desc.tokenizer.pieces.length, nShort, nFull },
    bytes, chunks, root: man.modelRoot });
  t = now(); step('leaf', 'run', '叶子自检：本机整数例程对逐门算的网表…');
  ex = new T.Executor(segs, st);
  let total = 0;
  for (let i = 0; i < st.leaves.length; i++) {
    const r = ex.checkLeaf(i, SELF, 1);
    total += r.samples; say('leafcheck', { i, r, auto: true });
    if (r.mismatches !== 0) throw new T.Reject('叶子自检', `${r.name} 有 ${r.mismatches} 组不同，不许走快路`);
  }
  ex.setMode('native');
  step('leaf', 'ok', `${st.leaves.length} 颗叶子各取 ${SELF} 组输入（定义域外的跳过），共 ${total.toLocaleString()} 组，本机整数例程和逐门算的网表逐位相同`, { ms: now() - t });
  t = now(); step('fast', 'run', '点积模块自检：本机整数点积对照记录算的模块…');
  const found = ex.enableFast(SELF);
  const checked = Object.values(ex.fastChecked).reduce((a, b) => a + b, 0);
  step('fast', 'ok', found.size ? `认出 ${found.size} 个「八个位平面」点积模块（${[...found.values()].map(s => 32 * s + ' 路').join('、')}），共 ${checked.toLocaleString()} 组输入，本机整数点积和照文件里的记录逐条算的逐位相同` : '文件里没有认出可以用本机整数点积代替的模块；全部照记录算', { ms: now() - t });
  inc = new Inc(ex); last = [];
  say('files', { loadVerifyMs: now() - t0, tests: tvs.length, demo, root: man.modelRoot });
  if (role !== 'verify') return;

  // test vectors, short ones first. A short one is computed on demand (only the rows it has); a full window is
  // computed by the whole-file path. Either way every score row of the vector goes into the sha256.
  const tAll = now(); let scores = 0, done = 0;
  const part = { short: { n: nShort, done: 0, scores: 0, t: 0 }, full: { n: nFull, done: 0, scores: 0, t: 0 } };
  for (const id of ['short', 'full']) if (!part[id].n) step('t' + id, 'ok', id === 'short' ? '这份文件没有短的测试向量' : '这份文件没有整窗口的测试向量', { ms: 0 });
  for (const { i, tv, full } of tvs) {
    const id = full ? 'full' : 'short', p = part[id], n = tv.ids.length;
    if (!p.done) p.t = now();
    say('tests', { done, n: tvs.length, id, partDone: p.done, partN: p.n, len: n, demo });
    await tick();
    ex.onProgress = progress('t' + id); lastProg = 0;
    let res; const tv0 = now();
    if (full) { progBase = 0; res = ex.run(T.packInput(desc, tv.ids)); progTotal = ex.lastCalls; }
    else { progBase = ex.calls; progTotal = 0; res = incRows(tv.ids, 0, n); }
    const rows = tv.ids.map((_, r) => T.readRow(desc, res, r));
    const same = await T.rowsSha256(rows) === tv.logits_sha256;
    say('tv', { index: i, len: n, full, ms: now() - tv0, ok: same, demo });
    if (!same) {
      say('testfail', { index: i, id, n: tvs.length, name: tv.name, demo, ms: now() - tAll, text: `${full ? '整窗口' : '短'}测试向量（${n} 个词片，文件里第 ${i + 1} 个）输出分数的 sha256 和说明段里的不符；在它之前有 ${done} 个相符` });
      return;
    }
    p.done++; done++; p.scores += rows.length * rows[0].length; scores += rows.length * rows[0].length;
    if (p.done === p.n && !demo) step('t' + id, 'ok', `${p.n} 个${full ? '整窗口' : '短'}测试向量、${p.scores.toLocaleString()} 个输出分数，sha256 全部等于说明段里带的值`, { ms: now() - p.t });
  }
  say('tests', { done, n: tvs.length, demo });
  say('ready', { testsMs: now() - tAll, totalMs: now() - t0, scores, n: tvs.length, demo });
}

// The score row after the last piece of ctx. When many positions are new (a long opening, or the window was
// just cut) they are computed a few at a time, so that progress can be shown and "stop" can take effect.
// Returns null if stopped.
async function lastRow(ctx, why) {
  let same = 0; while (same < last.length && same < ctx.length && last[same] === ctx[same]) same++;
  const todo = ctx.length - same;
  if (why === 'drop' || todo > WARM_STEP) {
    const t = now(), e0 = evals();
    say('warm', { kind: 'start', why, from: same, positions: ctx.length });
    for (let k = same + WARM_STEP; k < ctx.length; k += WARM_STEP) {
      incRows(ctx.slice(0, k), k - 1, k); last = ctx.slice(0, k);
      say('warm', { kind: 'at', why, done: k, positions: ctx.length, ms: now() - t });
      await tick();
      if (stopFlag) { say('warm', { kind: 'stopped', why, done: k, positions: ctx.length, ms: now() - t }); return null; }
    }
    const res = incRows(ctx, ctx.length - 1, ctx.length); last = ctx.slice();
    say('warm', { kind: 'end', why, positions: ctx.length, ms: now() - t, evals: evals() - e0 });
    return T.readRow(desc, res, ctx.length - 1);
  }
  const res = incRows(ctx, ctx.length - 1, ctx.length); last = ctx.slice();
  return T.readRow(desc, res, ctx.length - 1);
}

async function generate(o) {
  stopFlag = false; ex.onProgress = null; inc.verify = !!o.verify;
  const tok = desc.tokenizer, win = desc.window, cap = desc.length_cap.characters, opening = H.normalise(o.prompt), pieces = H.encode(o.prompt, tok);
  if (pieces.length >= win.size - 1) { say('gen', { kind: 'refused', text: `开头分出 ${pieces.length} 个词片；文件的窗口规则只定义了少于 ${win.size - 1} 个词片的开头` }); return; }
  let context = [desc.special.bos, ...pieces], picked = null; const fresh = [];
  say('gen', { kind: 'start', ids: pieces, text: opening, verify: inc.verify });
  const v0 = inc.stats.verified;
  for (let k = 0; k < o.max; k++) {
    await tick();
    if (stopFlag) { say('gen', { kind: 'end', why: '已停' }); return; }
    const a = H.advance(context, picked, win); context = a.context;
    if (H.chars(H.decode(fresh, tok)) >= cap) { say('gen', { kind: 'end', why: `续写到了文件定的 ${cap.toLocaleString()} 个字符的上限` }); return; }
    say('gen', { kind: 'step', n: k + 1, window: context.length, dropped: a.dropped });
    const t = now(), e0 = evals();
    const row = await lastRow(context, a.dropped ? 'drop' : k === 0 ? 'opening' : 'more');
    if (!row) { say('gen', { kind: 'end', why: '已停', during: 'warm' }); return; }
    const p = H.select(row, opening, fresh, tok, desc.selection, desc.special);
    if (p.token === desc.special.eos) { say('gen', { kind: 'end', why: '模型给出了结束片' }); return; }
    fresh.push(p.token); picked = p.token;
    say('gen', { kind: 'token', n: fresh.length, token: p.token, piece: p.token > 2 ? tok.pieces[p.token] : '', text: opening + H.decode(fresh, tok), ms: now() - t, evals: evals() - e0, rank: p.rank, window: context.length, dropped: a.dropped, verified: inc.stats.verified - v0 });
  }
  say('gen', { kind: 'end', why: `到了本页设的 ${o.max} 个词片的上限` });
}

const clone = () => ({ S: segs.S.slice(), T: segs.T.slice(), W: segs.W.slice(), D: segs.D.slice(), N: segs.N.slice() });
// Full check of an in-memory copy, in the page's own order. Returns the name of the check that stopped it.
async function verify(c, M, pinned) {
  try {
    const m = await T.readManifest(M, pinned);
    for (const k of KINDS) await T.checkSegment(m, k, c[k]);
    const s = T.parseStructure(c.S); await T.validate(c, s);
    return { ok: true, root: m.modelRoot, st: s };
  } catch (e) { if (!(e instanceof T.Reject)) throw e; return { ok: false, check: e.check, message: e.message }; }
}
async function negative(which) {
  const c = clone(), lines = [], t = now();
  const line = (what, r, expect) => lines.push({ what, result: r.ok ? '没有被拦下，载入了（模型根 ' + r.root.slice(0, 16) + '…）' : '被拦下。拦下它的检查：' + r.message, stopped: !r.ok, expect });
  if (which === 'weight') {
    const off = c.W.length >> 1; c.W[off] ^= 1;
    lines.push({ what: `内存里把权重段第 ${off.toLocaleString()} 字节翻一位（${segs.W[off]} → ${c.W[off]}），清单不动`, result: '', note: true });
    line('照常核对', await verify(c, segs.M, pin), true);
  } else if (which === 'weight2') {
    const off = c.W.length >> 1; c.W[off] ^= 1;
    lines.push({ what: `内存里把权重段第 ${off.toLocaleString()} 字节翻一位（${segs.W[off]} → ${c.W[off]}），再把清单里所有块哈希、三个根、模型根重算成自洽`, result: '', note: true });
    line('对钉住的模型根核对', await verify(c, await T.buildManifest(c), pin), true);
  } else if (which === 'leaf') {
    const off = c.N.length >> 1; c.N[off] ^= 1;
    lines.push({ what: `内存里把叶子网表副本段第 ${off.toLocaleString()} 字节翻一位`, result: '', note: true });
    line('清单不动，照常核对', await verify(c, segs.M, pin), true);
    line('清单重算成自洽，对钉住的模型根核对', await verify(c, await T.buildManifest(c), pin), true);
  }
  say('neg', { which, lines, ms: now() - t, ok: lines.every(l => l.note || l.stopped === l.expect) });
}

self.onmessage = async e => {
  const o = e.data;
  if (o.cmd === 'stop') { stopFlag = true; return; }
  if (busy) { say('busy', { cmd: o.cmd }); return; }
  busy = true;
  try {
    if (o.cmd === 'load') await load(o.base, o.pin, o.role, o.tamper, o.host);
    else if (o.cmd === 'gen') await generate(o);
    else if (o.cmd === 'neg') await negative(o.which);
    else if (o.cmd === 'leafcheck') { const t = now(), r = ex.checkLeaf(o.i, o.n, (Math.random() * 2 ** 31) | 0); say('leafcheck', { i: o.i, r, ms: now() - t, auto: false }); }
  } catch (err) {
    say('error', { cmd: o.cmd, check: err.check || '程序错误', message: err.message, demo });
  }
  busy = false; say('idle', {});
};
