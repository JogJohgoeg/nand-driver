// gatesim R7 生成器：追踪引擎（逐行照搬 R60 Engine.op / reduce / select 的参数语义：一元补零端口、broadcast、线号分配、e.base），
// 不求值，只记录每次调用「模板、实例数、每个输入行的来源」；再按 R5 trace_multi.py（层，mode='multi'）或 R6 trace_unit.py（头尾，mode='unit'）
// 的规则写出中间表示。两种规则只在「输入行分类」与「列映射池入池顺序」上不同，这里分别逐条复现。
import { Row, Bits, literal, rowIds } from './bits.mjs';
// ---------- 内容去重池（与 Python 按 blake2b 键去重、按首次出现顺序给偏移等价：键只用于判等，这里哈希命中后再逐字比对） ----------
export class Pool {
  // 连续缓冲（按容量预留，缓冲只在写入处驻留）；偏移按首次出现顺序分配，与 Python 的内容去重等价（哈希只作索引，命中后逐字比对）
  constructor(cap = 1 << 20) { this.buf = new Uint32Array(cap); this.len = 0; this.map = new Map(); this.fast = new Map(); this.lens = new Map(); }
  static hash(a) { let h1 = 0x811c9dc5 ^ a.length, h2 = 0x9747b28c + a.length; for (let i = 0; i < a.length; i++) { const x = a[i]; h1 = Math.imul(h1 ^ x, 16777619); h2 = Math.imul(h2 ^ (x >>> 7 | x << 25), 2246822519) ^ (h2 >>> 13); } return (h1 >>> 0).toString(36) + '.' + (h2 >>> 0).toString(36) + '.' + a.length; }
  grow(need) { if (this.len + need <= this.buf.length) return; let c = this.buf.length; while (c < this.len + need) c *= 2; const nb = new Uint32Array(c); nb.set(this.buf.subarray(0, this.len)); this.buf = nb; }
  intern(a, fastKey = null) {
    if (fastKey !== null) { const o = this.fast.get(fastKey); if (o !== undefined) return o; }
    const key = Pool.hash(a); let lst = this.map.get(key), off;
    if (lst) for (const o of lst) { if (this.lens.get(o) === a.length) { let eq = true; const B = this.buf; for (let i = 0; i < a.length; i++) if (B[o + i] !== a[i]) { eq = false; break; } if (eq) { off = o; break; } } }
    if (off === undefined) { this.grow(a.length); off = this.len; this.buf.set(a, off); this.len += a.length; this.lens.set(off, a.length); if (!lst) this.map.set(key, lst = []); lst.push(off); }
    if (fastKey !== null) this.fast.set(fastKey, off);
    return off;
  }
  at(off) { return this.buf.subarray(off, off + this.lens.get(off)); }
  concat() { return this.len ? this.buf.subarray(0, this.len) : new Uint32Array(1); }
  release() { this.map = this.fast = this.lens = null; }
}
// R8：只存去重表、不存内容的池（跨层共享池用）。键 = 两套独立 64 位哈希（各由两条 32 位乘法散列道组成）+ 长度，共 128 位；
// 偏移按首次出现顺序分配（与 Python 按内容去重、按首次出现给偏移相同）；新内容交给 sink（写 GPU / 送流式 SHA），池本身不留。
// 若哈希碰撞把两段不同内容判成同一段，写出的池字节必然与 Python 不同，整池 SHA 对拍会检出。
export class HashPool {
  constructor(sink = null) { this.len = 0; this.map = new Map(); this.fast = new Map(); this.sink = sink; this.entries = 0; }
  static key(a) {
    let h1 = 0x811c9dc5 ^ a.length, h2 = 0x9747b28c + a.length, h3 = 0x2545f491, h4 = 0x6a09e667 ^ (a.length * 2654435761);
    for (let i = 0; i < a.length; i++) {
      const x = a[i];
      h1 = Math.imul(h1 ^ x, 16777619); h2 = Math.imul(h2 ^ (x >>> 7 | x << 25), 2246822519) ^ (h2 >>> 13);
      h3 = Math.imul((h3 + x) | 0, 0x85ebca6b) ^ (h3 >>> 16); h4 = Math.imul(h4 ^ (x >>> 11 | x << 21), 0xc2b2ae35) + 0x27d4eb2f | 0;
    }
    return (h1 >>> 0).toString(36) + '.' + (h2 >>> 0).toString(36) + '.' + (h3 >>> 0).toString(36) + '.' + (h4 >>> 0).toString(36) + '.' + a.length;
  }
  intern(a, fastKey = null) {
    if (fastKey !== null) { const o = this.fast.get(fastKey); if (o !== undefined) return o; }
    const k = HashPool.key(a); let off = this.map.get(k);
    if (off === undefined) { off = this.len; this.map.set(k, off); this.len += a.length; this.entries++; if (this.sink) this.sink(a, off); }
    if (fastKey !== null) this.fast.set(fastKey, off);
    return off;
  }
}
const packLit = (r) => {                               // 常量行 → packbits(bitorder='little') 并补齐到 4 字节
  const n = r.n, nb = Math.ceil(n / 8), nw = Math.ceil(nb / 4), w = new Uint32Array(Math.max(nw, 0));
  for (let i = 0; i < n; i++) if (r.litAt(i)) w[i >> 5] |= 1 << (i & 31);
  return w;
};
const range16 = o => Array.from({ length: 16 }, (_, i) => o + i);
const SPECIAL = [['mul', 'mul_bb', [...range16(0), ...range16(32)]], ['silu', 'silu_b', range16(0)]];
const zeroLit = r => r.t === 'L' && (r.a.length === 1 ? r.a[0] === 0 : r.a.every(v => v === 0));
export class Engine {
  constructor(meta, { mode, base = 0, region }) {
    this.meta = meta; this.mode = mode; this.base = base; this.region = region;    // region = [IN, ST, CB]
    this.scope = 'control'; this.counts = {}; this.calls = 0; this.cap = 1024;
    this.bases = new Float64Array(this.cap); this.ng = new Float64Array(this.cap); this.nout = new Int32Array(this.cap); this.cn = new Int32Array(this.cap); this.lvl = new Int32Array(this.cap);
    this.callrec = [];      // [name, n, ni, row0, level, scope]
    this.rows = [];         // 行记录（见 classify）
    this.lp = null; this.cm = null; this.X = [];            // unit 模式的池；multi 模式由 emit 传入共享池
    this.prov = new Pool();                                 // multi 模式：单一来源行的列映射先按内容去重，偏移在 emit 时按行序分配
  }
  set_scope(s) { this.scope = s; }
  snapshot() { }
  m(name) { const m = this.meta[name]; if (!m) throw new Error('no template ' + name); return m; }
  locate(id) {                                           // 线号 → [k, j, c]；k = −3 常量、−1 输入区、−2 状态区
    const [IN, ST, CB] = this.region;
    if (id < 2) return [-3, 0, id];
    if (id < ST) return [-1, 0, id - IN];
    if (id < CB) return [-2, 0, id - ST];
    let lo = 0, hi = this.calls - 1;
    while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (this.bases[mid] <= id) lo = mid; else hi = mid - 1; }
    const k = lo, rel = id - this.bases[k], ng = this.ng[k], c = Math.floor(rel / ng), j = rel - c * ng - (ng - this.nout[k]);
    if (j < 0 || c >= this.cn[k]) throw new Error('引用了非输出线');
    return [k, j, c];
  }
  // 行分类：返回行记录并收集来源调用
  classify(r, srcs) {
    const n = r.n;
    if (r.t === 'L') return this.recLit(r);
    if (r.t === 'C') {                                   // 单一来源（同一调用、同一输出位）
      srcs.add(r.k);
      return this.recMap(r.k, r.j, r, n);
    }
    // G 行：逐元素定位
    const K = new Int32Array(n), J = new Int32Array(n), Cc = new Float64Array(n); let allLit = true;
    const s0 = r.a.length === 1 && n !== 1;
    if (s0) { const [k, j, c] = this.locate(r.a[0]); K.fill(k); J.fill(j); Cc.fill(c); allLit = k === -3; }
    else for (let i = 0; i < n; i++) { const [k, j, c] = this.locate(r.a[i]); K[i] = k; J[i] = j; Cc[i] = c; if (k !== -3) allLit = false; }
    if (allLit) { const a = new Uint8Array(n); for (let i = 0; i < n; i++) a[i] = Cc[i]; return this.recLit(new Row('L', n, { a })); }
    for (let i = 0; i < n; i++) if (K[i] >= 0) srcs.add(K[i]);
    let same = true; for (let i = 1; i < n; i++) if (K[i] !== K[0] || J[i] !== J[0]) { same = false; break; }
    if (same && K[0] !== -3) { const cr = Row.call(K[0], J[0], n, Int32Array.from(Cc)); return this.recMap(K[0], J[0], cr, n); }
    return this.recDefer(K, J, Cc);
  }
  recLit(r) { const w = packLit(r); return ['L', w]; }
  colmapOf(r, n) {                                       // 单一来源行的列映射（与 Python 的 gr − rb 相同，即实例下标 c）
    const c0 = r.c0 !== undefined && r.c0 >= 0 ? r.c0 : -1;
    if (c0 >= 0) return { a: null, fast: 'b:' + c0 + ':' + n, gen: () => new Uint32Array(n).fill(c0) };
    if (r.t === 'C' && !r.cols) return { a: null, fast: 'i:' + n, gen: () => { const a = new Uint32Array(n); for (let i = 0; i < n; i++) a[i] = i; return a; } };
    const a = new Uint32Array(n); for (let i = 0; i < n; i++) a[i] = r.colAt(i); return { a, fast: null };
  }
  recMap(k, j, r, n) {
    const cm = this.colmapOf(r, n);
    if (this.mode === 'unit') { const off = this.cm.intern(cm.a || cm.gen(), cm.fast); return ['M', k, j, off]; }
    const pid = this.prov.intern(cm.a || cm.gen(), cm.fast);          // multi：先按内容去重（pid 是临时池偏移，emit 时换成共享池偏移）
    return ['M', k, j, pid];
  }
  recDefer(K, J, C) { if (this.mode === 'unit') { this.X.push([K, J, C]); return ['X', this.X.length - 1]; } return ['D', K, J, C]; }
  op(name, ...args) {
    const n = Math.max(...args.map(x => x.n)); args = args.map(x => x.broadcast(n));
    let m = this.m(name); const ni = m.n_in, have = args.reduce((s, x) => s + x.h, 0);
    if (have < ni) args.push(literal(0, ni - have).broadcast(n));
    const rows = args.flatMap(x => x.rows); if (rows.length !== ni) throw new Error(`${name}: ${rows.length} != ${ni}`);
    // 专用单元改写：规则所列输入位在全部车道上都是字面常数 0 时，换成由原单元派生的等价专用单元（接口不变，见 cells/*.json 的 derived_from / zero_inputs）
    for (const [base, alt, zs] of SPECIAL) if (name === base && this.meta[alt] && zs.every(i => zeroLit(rows[i]))) { name = alt; m = this.meta[alt]; break; }
    const k = this.calls, row0 = this.rows.length, srcs = new Set();
    for (const r of rows) { const rec = this.classify(r, srcs); if (rec[0] === 'L' && this.mode === 'unit') rec[1] = this.lp.intern(rec[1]); this.rows.push(rec); }
    let lev = 1; for (const s of srcs) lev = Math.max(lev, this.lvl[s] + 1);
    if (k >= this.cap) { this.cap *= 2; for (const a of ['bases', 'ng', 'nout', 'cn', 'lvl']) { const o = this[a], b = new o.constructor(this.cap); b.set(o); this[a] = b; } }
    this.bases[k] = this.base; this.ng[k] = m.n_nand; this.nout[k] = m.n_out; this.cn[k] = n; this.lvl[k] = lev;
    this.callrec.push([name, n, ni, row0, lev, this.scope]);
    this.base += m.n_nand * n; this.counts[name] = (this.counts[name] || 0) + n; this.calls++;
    const out = []; for (let j = 0; j < m.n_out; j++) out.push(Row.call(k, j, n));
    return new Bits(out, n);
  }
  reduce(name, x) {
    while (x.n > 1) { const n = x.n, h = Math.ceil(n / 2), a = new Int32Array(h), b = new Int32Array(h); for (let i = 0; i < h; i++) { a[i] = 2 * i; b[i] = Math.min(2 * i + 1, n - 1); } x = this.op(name, x.cols(a), x.cols(b)); }
    return x;
  }
  select(s, t, f) { return this.op('mux' + t.h, s, t, f); }
  // join(axis=1)：逐行按列拼接（统一成 G 行线号）
  join1(xs) {
    const h = xs[0].h, n = xs.reduce((s, x) => s + x.n, 0), rows = [];
    for (let r = 0; r < h; r++) {
      if (xs.every(x => x.rows[r].t === 'L')) { const a = new Uint8Array(n); let p = 0; for (const x of xs) { const rr = x.rows[r]; for (let i = 0; i < x.n; i++) a[p++] = rr.litAt(i); } rows.push(new Row('L', n, { a })); continue; }
      const a = new Float64Array(n); let p = 0; for (const x of xs) { a.set(rowIds(this, x.rows[r]), p); p += x.n; } rows.push(new Row('G', n, { a }));
    }
    return new Bits(rows, n);
  }
  put(x, indices, y) {                                   // Bits.put：把 y 的列写到 x 的 indices 列
    const rows = x.rows.map((r, i) => { const a = rowIds(this, r), b = rowIds(this, y.rows[i]); indices.forEach((c, t) => { a[c] = b[t]; }); return new Row('G', x.n, { a }); });
    return new Bits(rows, x.n);
  }
  ids(b) { return b.rows.map(r => rowIds(this, r)); }   // 行 → 线号数组（用于输出表 / D 表）
}
// ---------- 写出 ----------
const ALIGN = 64, al = x => Math.ceil(x / ALIGN) * ALIGN;
export function layout(E, NIN, NST, fuse = true) {
  const off_in = ALIGN, off_st = off_in + al(Math.ceil(Math.max(NIN, 1) / 32)); let cur = off_st + al(Math.ceil(Math.max(NST, 1) / 32));
  const NC = E.calls, W = E.callrec.map(c => Math.ceil(c[1] / 32)), lvl = E.callrec.map(c => c[4]);
  let groups = [];
  if (fuse) {
    const gi = new Map();
    for (let k = 0; k < NC; k++) { const key = lvl[k] + '\u0000' + E.callrec[k][0]; if (!gi.has(key)) { gi.set(key, groups.length); groups.push([]); } groups[gi.get(key)].push(k); }
    groups.sort((a, b) => lvl[a[0]] - lvl[b[0]] || a[0] - b[0]);
  } else groups = [...Array(NC).keys()].map(k => [k]);
  const WF = new Float64Array(NC), wOff = new Float64Array(NC), gout = new Float64Array(NC);
  for (const g of groups) { let wf = 0; for (const k of g) wf += W[k]; let w0 = 0; for (const k of g) { WF[k] = wf; wOff[k] = w0; gout[k] = cur; w0 += W[k]; } cur += al(E.nout[g[0]] * wf); }
  const OB = new Float64Array(NC); for (let k = 0; k < NC; k++) OB[k] = gout[k] + wOff[k];
  return { off_in, off_st, ARENA: cur, W, lvl, groups, WF, wOff, gout, OB };
}
export function gb(E, Lo, k, j, c) {                    // (来源, 位, 列) → arena 全局位号
  if (k === -3) return c === 1 ? 32 : 0;
  if (k === -1) return Lo.off_in * 32 + c;
  if (k === -2) return Lo.off_st * 32 + c;
  return (Lo.OB[k] + j * Lo.WF[k]) * 32 + c;
}
const resolveIds = (E, Lo, ids) => { const o = new Uint32Array(ids.length); for (let i = 0; i < ids.length; i++) { const [k, j, c] = E.locate(ids[i]); o[i] = gb(E, Lo, k, j, c); } return o; };
// 行表：multi 模式按 trace_multi.py（常量行随行序入常量池；单一来源行按行序入共享列映射池；混合行按 Python 的判定：同一来源且无常量 → 行基取首元素，列映射 = 位号 − 行基，
// 不越界即 map，否则 explicit）；unit 模式按 trace_unit.py（常量行与单一来源行在调用时已入池，逐元素行在全部调用之后按出现顺序入池）。
export function emitRows(E, Lo, pools, rt = null) {   // rt = { local: Pool }：R8 同时产出运行时行表（列映射偏移改指本层局部池，内容相同）
  const R = new Uint32Array(E.rows.length * 3), stats = { map_rows: 0, lit_rows: 0, explicit_rows: 0 };
  const RT = rt ? new Uint32Array(E.rows.length * 3) : null, loc = rt ? rt.local : null, locDone = new Map();
  const put = (r, t, rb, sharedOff, content, provOff) => { R.set([t, rb, sharedOff], 3 * r); if (RT) { let lo; if (provOff !== undefined) { lo = locDone.get(provOff); if (lo === undefined) { lo = loc.intern(content); locDone.set(provOff, lo); } } else lo = loc.intern(content); RT.set([t, rb, lo], 3 * r); } };
  // multi：临时池偏移 → 内容；同一内容在共享池只入一次（按行序首次出现），之后直接复用偏移
  const provDone = new Map();
  const sharedOf = off => { let o = provDone.get(off); if (o === undefined) { o = pools.cm.intern(E.prov.at(off)); provDone.set(off, o); } return o; };
  const rbOf = (k, j) => k === -1 ? Lo.off_in * 32 : k === -2 ? Lo.off_st * 32 : (Lo.OB[k] + j * Lo.WF[k]) * 32;
  const pendingX = [];
  for (let r = 0; r < E.rows.length; r++) {
    const rec = E.rows[r];
    if (rec[0] === 'L') { const lo = E.mode === 'unit' ? rec[1] : pools.lp.intern(rec[1]); R.set([1, 0, lo], 3 * r); if (RT) RT.set([1, 0, lo], 3 * r); stats.lit_rows++; continue; }
    if (rec[0] === 'M') { const [, k, j, off] = rec; if (E.mode === 'unit') { R.set([0, rbOf(k, j), off], 3 * r); } else put(r, 0, rbOf(k, j), sharedOf(off), E.prov.at(off), off); stats.map_rows++; continue; }
    if (rec[0] === 'X') { pendingX.push(r); stats.explicit_rows++; continue; }
    // multi 的 D 行：照 trace_multi 的判定
    const [, K, J, C] = rec, n = K.length, g = new Float64Array(n); let anyLit = false, sameSrc = true;
    const src0 = K[0] >= 0 ? K[0] : -1;
    for (let i = 0; i < n; i++) { g[i] = gb(E, Lo, K[i], J[i], C[i]); if (K[i] === -3) anyLit = true; if ((K[i] >= 0 ? K[i] : -1) !== src0) sameSrc = false; }
    if (sameSrc && !anyLit) {
      let rb;
      if (src0 >= 0) { const ob = Lo.OB[src0], wf = Lo.WF[src0], jj = Math.floor((Math.floor(g[0] / 32) - ob) / wf); rb = (ob + jj * wf) * 32; }
      else rb = (g[0] < Lo.off_st * 32 ? Lo.off_in : Lo.off_st) * 32;
      const cmv = new Uint32Array(n); let ok = true;
      for (let i = 0; i < n; i++) { const d = g[i] - rb; if (d < 0 || d >= 2 ** 31) { ok = false; break; } cmv[i] = d; }
      if (ok) { put(r, 0, rb, pools.cm.intern(cmv), cmv); stats.map_rows++; continue; }
    }
    const ga = new Uint32Array(n); for (let i = 0; i < n; i++) ga[i] = g[i];
    put(r, 2, 0, pools.cm.intern(ga), ga); stats.explicit_rows++;
  }
  for (const r of pendingX) {                            // unit：逐元素行最后入池
    const [K, J, C] = E.X[E.rows[r][1]], n = K.length, ga = new Uint32Array(n);
    for (let i = 0; i < n; i++) ga[i] = gb(E, Lo, K[i], J[i], C[i]);
    R.set([2, 0, pools.cm.intern(ga)], 3 * r);
  }
  return { R, RT, stats };
}
export function emitTables(E, Lo, { outIds, dIds }) {
  const NC = E.calls, tmpl = Object.keys(E.meta).filter(t => E.counts[t] !== undefined).sort(), tid = new Map(tmpl.map((t, i) => [t, i]));
  const ct = new Uint32Array(NC * 8);
  for (let k = 0; k < NC; k++) { const c = E.callrec[k]; ct.set([tid.get(c[0]), c[1], Lo.W[k], Lo.OB[k], c[2], c[3], c[4], E.nout[k]], 8 * k); }
  const gt = [], mt = [], wm = [];
  for (const g of Lo.groups) {
    const k0 = g[0]; gt.push(tid.get(E.callrec[k0][0]), Lo.WF[k0], Lo.gout[k0], E.callrec[k0][2], mt.length / 5, g.length, Lo.lvl[k0], E.nout[k0], wm.length);
    for (const k of g) { const mi = mt.length / 5; mt.push(k, Lo.wOff[k], Lo.W[k], E.callrec[k][1], E.callrec[k][3]); for (let w = 0; w < Lo.W[k]; w++) wm.push(mi); }
  }
  const outtab = resolveIds(E, Lo, outIds), dtab = dIds ? resolveIds(E, Lo, dIds) : new Uint32Array(0);
  return { templates: tmpl, calls: ct, groups: Uint32Array.from(gt), members: Uint32Array.from(mt), wordmap: Uint32Array.from(wm), outtab, dtab };
}
// ---------- worker 与主线程之间的打包（只搬运已追踪的结果，不改任何值） ----------
export function exportEngine(E) {
  const NR = E.rows.length, typ = new Uint8Array(NR), a = new Int32Array(NR * 3);
  let litLen = 0, dLen = 0;
  for (const r of E.rows) { if (r[0] === 'L') litLen += r[1].length; else if (r[0] === 'D') dLen += r[1].length; }
  const lit = new Uint32Array(litLen), dK = new Int32Array(dLen), dJ = new Int32Array(dLen), dC = new Float64Array(dLen);
  let lp = 0, dp = 0;
  for (let i = 0; i < NR; i++) {
    const r = E.rows[i];
    if (r[0] === 'L') { typ[i] = 0; a[3 * i] = lp; a[3 * i + 1] = r[1].length; lit.set(r[1], lp); lp += r[1].length; }
    else if (r[0] === 'M') { typ[i] = 1; a[3 * i] = r[1]; a[3 * i + 1] = r[2]; a[3 * i + 2] = r[3]; }
    else { typ[i] = 2; a[3 * i] = dp; a[3 * i + 1] = r[1].length; dK.set(r[1], dp); dJ.set(r[2], dp); dC.set(r[3], dp); dp += r[1].length; }
  }
  const lensK = new Int32Array(E.prov.lens.size), lensV = new Int32Array(E.prov.lens.size); let t = 0; for (const [k, v] of E.prov.lens) { lensK[t] = k; lensV[t] = v; t++; }
  const prov = E.prov.buf.slice(0, E.prov.len);
  const n = E.calls;
  const st = { mode: E.mode, region: E.region, calls: n, counts: E.counts, callrec: E.callrec, typ, a, lit, dK, dJ, dC, prov, lensK, lensV,
    bases: E.bases.slice(0, n), ng: E.ng.slice(0, n), nout: E.nout.slice(0, n), cn: E.cn.slice(0, n), lvl: E.lvl.slice(0, n) };
  const transfer = [typ.buffer, a.buffer, lit.buffer, dK.buffer, dJ.buffer, dC.buffer, prov.buffer, lensK.buffer, lensV.buffer, st.bases.buffer, st.ng.buffer, st.nout.buffer, st.cn.buffer, st.lvl.buffer];
  return { st, transfer };
}
export function importEngine(st, meta) {
  const E = new Engine(meta, { mode: st.mode, region: st.region });
  Object.assign(E, { calls: st.calls, counts: st.counts, callrec: st.callrec, bases: st.bases, ng: st.ng, nout: st.nout, cn: st.cn, lvl: st.lvl, cap: st.calls });
  E.prov = new Pool(1); E.prov.buf = st.prov; E.prov.len = st.prov.length; for (let t = 0; t < st.lensK.length; t++) E.prov.lens.set(st.lensK[t], st.lensV[t]);
  const NR = st.typ.length, rows = new Array(NR);
  for (let i = 0; i < NR; i++) {
    const x = st.a[3 * i], y = st.a[3 * i + 1];
    rows[i] = st.typ[i] === 0 ? ['L', st.lit.subarray(x, x + y)] : st.typ[i] === 1 ? ['M', x, y, st.a[3 * i + 2]] : ['D', st.dK.subarray(x, x + y), st.dJ.subarray(x, x + y), st.dC.subarray(x, x + y)];
  }
  E.rows = rows; return E;
}
