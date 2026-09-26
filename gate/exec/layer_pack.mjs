// gatesim R8：两段式加载器（只覆盖定型配置：gather4 分类 → gather5、段内核 v6、链内核、不传原始行表、共用暂存区、共享或独立 arena）。
// preparePack：纯 JS，把一层（或一个头尾单元）的中间表示变成可序列化的「准备包」（上传前的全部表 + 着色器代码 + 条目划分）；
// uploadPack：只做 GPU 一侧（建缓冲、管线、绑定组），得到与 layer_exec.loadLayer 字段相同的 L，tick 路径不变。
// 准备包可存进 IndexedDB：热启动时跳过生成与建表，只读包、校验、上传。表的内容与 loadLayer 逐字节相同（同一套函数计算）。
import { decode, analyze, genWGSL } from './gen.mjs';
import { planSegments6, buildStepTable6, megaWGSL6, megaCase3, splitChains, buildChainTable, chainWGSL, MEGA_SET, SEGE_NIMAX } from './mega.mjs';
import { GATHER5_WGSL, PACK_WGSL, XPACK_WGSL, GATHERX16_WGSL } from './layer_exec.mjs';
const al4 = n => Math.ceil(n / 4) * 4;
// 模板信息（与层无关，跨层缓存）
export function templateInfo(cache, manifest, getBin, name, strict) {
  const e = manifest.find(x => x.name === 'u-' + name), opts = e.opts || {}, key = name + '|' + !!strict + '|' + JSON.stringify(opts);
  let c = cache.get(key);
  if (!c) { const bytes = getBin(name), nl = decode(bytes), an = analyze(nl, e.n_in, e.n_out); const gw = genWGSL(nl, e.n_in, e.n_out, an, opts.K || 16384, opts.WG || 64, !!strict, opts); c = { gw, WG: opts.WG || 64, nNand: an.nNand, depth: an.maxDepth, e }; cache.set(key, c); }
  return c;
}
const hkey = a => { let h1 = 0x811c9dc5 ^ a.length, h2 = 0x9747b28c; for (let i = 0; i < a.length; i++) { const x = a[i]; h1 = Math.imul(h1 ^ x, 16777619); h2 = Math.imul(h2 ^ (x >>> 7 | x << 25), 2246822519) ^ (h2 >>> 13); } return h1 + ':' + h2 + ':' + a.length; };
// 全局紧凑列映射（各层与头尾共用）：主机侧去重表 + 内容；新内容记入 CC.appends（上传时写 GPU，缓存时一并存）
export function newCC(cap = 16 * 1024 * 1024) { return { cap, len: 0, host: new Uint32Array(cap), map: new Map() }; }
function ccPut(CC, seg, appends) {
  const k = hkey(seg); let lst = CC.map.get(k);
  if (lst) for (const o of lst) { let eq = true; for (let i = 0; i < seg.length; i++) if (CC.host[o + i] !== seg[i]) { eq = false; break; } if (eq) return o; }
  if (CC.len + seg.length > CC.cap) throw new Error('compact colmap capacity exceeded');
  const o = CC.len; CC.host.set(seg, o); CC.len += seg.length; appends.push([o, Uint32Array.from(seg)]); if (!lst) CC.map.set(k, lst = []); lst.push(o); return o;
}
// ir：{ meta, calls, rows, colmap, litpool|null, dtab, outtab, groups, members, wordmap }；shared：{ litBase, maxN, lpLen, words } 或 null（单元自带 arena）
export function preparePack(ir, { manifest, getBin, tmCache, strict = false, CC, shared = null, wmax = 2, chainMin = 8 }) {
  const t0 = performance.now(), { meta, calls, groups, members, wordmap, dtab, outtab } = ir; let rowsA = ir.rows; const cm = ir.colmap;
  const NC = meta.ncalls, NG = meta.ngroups, C = i => calls.subarray(i * 8, i * 8 + 8), GR = i => groups.subarray(i * 9, i * 9 + 9);
  let maxN = 1; for (let i = 0; i < NC; i++) maxN = Math.max(maxN, C(i)[1]);
  if (shared) { if (maxN > shared.maxN) throw new Error('maxN exceeds shared'); maxN = shared.maxN; }
  const litBase = shared ? shared.litBase : Math.ceil(meta.arena_words / 64) * 64, idOff = cm.length;
  if (shared && litBase < meta.arena_words) throw new Error('shared litBase below arena_words');
  let cm2;
  if (cm.buffer && cm.byteOffset === 0 && cm.buffer.byteLength >= (cm.length + maxN) * 4) cm2 = new Uint32Array(cm.buffer, 0, cm.length + maxN); else { cm2 = new Uint32Array(cm.length + maxN); cm2.set(cm); }
  for (let i = 0; i < maxN; i++) cm2[idOff + i] = i;
  rowsA = Uint32Array.from(rowsA);
  for (let r = 0; r < rowsA.length; r += 3) if (rowsA[r] === 1) { rowsA[r] = 0; rowsA[r + 1] = (litBase + rowsA[r + 2]) * 32; rowsA[r + 2] = idOff; }
  // 模板
  const tm = {}; let maxOut = 0, maxIn = 0, maxSlotsW = 0;
  for (const name of meta.templates) tm[name] = templateInfo(tmCache, manifest, getBin, name, strict);
  for (let i = 0; i < NG; i++) { const q = GR(i); maxOut = Math.max(maxOut, q[7] * q[1]); maxIn = Math.max(maxIn, q[3] * q[1]); maxSlotsW = Math.max(maxSlotsW, tm[meta.templates[q[0]]].gw.nSlots * q[1]); }
  const lpLen = shared ? shared.lpLen : ir.litpool.length;
  const arenaWords = litBase + lpLen + al4(maxOut) + 64;
  if (arenaWords * 32 >= 2 ** 32) throw new Error('arena too large for u32 bit index');
  if (shared && arenaWords > shared.words) throw new Error('shared arena too small');
  // 一般行按 (off, n, 行基址字内位 lo) 共用的分析（与行基址的字址无关）：各字是否对齐及相对字号、混合字的相对 B 与掩码。
  // 对齐：rb + cm[c0] ≡ 0 (mod 32) ⟺ lo + cm[c0] ≡ 0；混合字候选 t = rb + cm[c] − (c − c0) 与 tr = lo + cm[c] − (c − c0) 一一对应（差 rb − lo），计数与取最先达到的最大值相同
  const tpl2 = new Map(), tplOf = (off, n, lo) => { const sk = off * 1048576 + n; let a = tpl2.get(sk); if (!a) tpl2.set(sk, a = new Array(32)); let T = a[lo]; if (T) return T;
    const nw = Math.ceil(n / 32), rel = new Int32Array(nw).fill(-1); let al = 0;
    for (let w = 0; w < nw; w++) { const c0 = w * 32, c1 = Math.min(n, c0 + 32), v0 = cm2[off + c0]; let ok = (lo + v0) % 32 === 0;
      for (let c = c0 + 1; ok && c < c1; c++) if (cm2[off + c] !== v0 + (c - c0)) ok = false;
      if (ok) { rel[w] = (lo + v0) / 32; al++; } }
    return a[lo] = { nw, rel, al, mix: new Array(nw) }; };
  const mixOf = (T, off, n, lo, w) => { let m = T.mix[w]; if (m) return m; const c0 = w * 32, c1 = Math.min(n, c0 + 32), cnt = new Map(); let Brel = 0, best = 0;
    for (let c = c0; c < c1; c++) { const tr = lo + cm2[off + c] - (c - c0); if (((tr % 32) + 32) % 32 === 0) { const v = (cnt.get(tr) || 0) + 1; cnt.set(tr, v); if (v > best) { best = v; Brel = tr / 32; } } }
    let mask = 0; if (best >= 2) for (let c = c0; c < c1; c++) if (lo + cm2[off + c] === Brel * 32 + (c - c0)) mask |= 1 << (c - c0);
    return T.mix[w] = { best, Brel, mask: mask >>> 0 }; };
  // gather4 行分类（同 loadLayer）
  const NR = rowsA.length / 3, R4 = new Uint32Array(NR * 8), nOfRow = new Uint32Array(NR);
  for (let i = 0; i < NC; i++) { const c = C(i); nOfRow.fill(c[1], c[5], c[5] + c[4]); }
  const shape = new Map();                                // 列映射形状（与行基址无关）按 (off, n) 只算一次：1 连续、2 全同、0 其它
  for (let r = 0; r < NR; r++) {
    const rb = rowsA[3 * r + 1], off = rowsA[3 * r + 2], n = nOfRow[r], c0 = cm2[off], sk = off * 1048576 + n;
    let sh = shape.get(sk);
    if (sh === undefined) { let id = true, b = true; for (let c = 1; c < n && (id || b); c++) { const v = cm2[off + c]; if (v !== c0 + c) id = false; if (v !== c0) b = false; } sh = id ? 1 : b ? 2 : 0; shape.set(sk, sh); }
    const ident = sh === 1 && (rb + c0) % 32 === 0, bc = sh === 2 || n === 1;
    if (ident) R4.set([(rb + c0) / 32, 0xffffffff, 0, 0, rb, off, 0, 0], 8 * r); else if (bc) R4.set([0, 0, rb + c0, 0xffffffff, rb, off, 0, 0], 8 * r); else R4.set([0, 0, 0, 0, rb, off, 1, 0], 8 * r);
  }
  // 条目划分（段内核 v6 + 链内核）
  const Lp = { meta, NG, GR, C, items: null };
  Lp.items = planSegments6(Lp, wmax, rowsA, cm2, members, wordmap, MEGA_SET); Lp.items = splitChains(Lp, chainMin);
  // gather5：只为 gather 派发的组建表（同 loadLayer 的 R8 路径）
  const grpSet = new Set(Lp.items.filter(it => it.kind === 'grp').map(it => it.g));
  const rowMap = new Int32Array(NR).fill(-1), members5 = Uint32Array.from(members); let nNew = 0;
  for (let gi = 0; gi < NG; gi++) { if (!grpSet.has(gi)) continue; const q = GR(gi);
    for (let m = q[4]; m < q[4] + q[5]; m++) { const r0 = members[5 * m + 4]; if (rowMap[r0] < 0) for (let k = 0; k < q[3]; k++) rowMap[r0 + k] = nNew++; members5[5 * m + 4] = rowMap[r0]; } }
  let mixedW = 0; const R5g = new Uint32Array(Math.max(4, nNew * 4)), ccAppends = [], rowCache = new Map(), st5 = [0, 0, 0, 0], xCache = new Map(); let st5x = 0;
  // 逐字映射表第 0 项固定为 (0, 0)：非逐字映射的行读它作占位
  let wtBuf = new Uint32Array(1 << 16), wtLen = 2; const wtPush = a => { if (wtLen + a.length > wtBuf.length) { let c = wtBuf.length; while (c < wtLen + a.length) c *= 2; const nb = new Uint32Array(c); nb.set(wtBuf.subarray(0, wtLen)); wtBuf = nb; } wtBuf.set(a, wtLen); wtLen += a.length; };
  for (let r = 0; r < NR; r++) {
    if (rowMap[r] < 0) continue;
    const cls = R4[8 * r + 6] === 1 ? 2 : R4[8 * r + 1] ? 0 : 1, rr = rowMap[r];
    if (cls === 0) { R5g.set([R4[8 * r], 0xffffffff, 0, 0], 4 * rr); st5[0]++; continue; }                       // [地址, 对齐掩码字, 偏移|类别<<30, 广播掩码字]
    if (cls === 1) { R5g.set([R4[8 * r + 2], 0, 1 << 30, 0xffffffff], 4 * rr); st5[1]++; continue; }
    const rb = rowsA[3 * r + 1], off = rowsA[3 * r + 2], n = nOfRow[r], ck = off * 1048576 + n; let rc = rowCache.get(ck); if (!rc) rowCache.set(ck, rc = new Map()); const hit = rc.get(rb);
    if (hit) { R5g.set(hit, 4 * rr); st5[hit[2] >>> 30]++; continue; }
    const lo5 = rb & 31, wb = rb >>> 5, T = tplOf(off, n, lo5), nw = T.nw, words = new Uint32Array(nw * 2), al = T.al;
    for (let w = 0; w < nw; w++) if (T.rel[w] >= 0) { words[2 * w] = wb + T.rel[w]; words[2 * w + 1] = 0xffffffff; }
    let ent;
    // 类别 X（逐字字节偏移）：每个 32 车道字内列号跨度 < 256 时，存 [字基址, 32 个字节偏移] 共 9 个 u32 于 wtab，不进全局列映射。
    // 记录与行基址无关（按 off:n 去重，同一选择的各位行共用）；GPU 地址 = 行基址 + 字基址 + 字节。
    const xk = ck; let xrec = xCache.get(xk);
    if (xrec === undefined && al * 2 < nw) {
      let ok = true; const rec = new Uint32Array(nw * 9);
      for (let w = 0; ok && w < nw; w++) { const c0 = w * 32, c1 = Math.min(n, c0 + 32); let lo = 0xffffffff, hi = 0;
        for (let c = c0; c < c1; c++) { const v = cm2[off + c]; if (v < lo) lo = v; if (v > hi) hi = v; }
        if (hi - lo > 255) { ok = false; break; }
        rec[9 * w] = lo; for (let c = c0; c < c1; c++) rec[9 * w + 1 + ((c - c0) >> 2)] |= (cm2[off + c] - lo) << (8 * ((c - c0) & 3)); }
      if (ok) { if (wtLen & 1) wtPush(new Uint32Array(1)); xrec = wtLen; if (xrec >= 2 ** 30) throw new Error('wtab too large'); wtPush(rec); if (wtLen & 1) wtPush(new Uint32Array(1)); }
      else xrec = null;
      xCache.set(xk, xrec);
    }
    if (xrec !== undefined && xrec !== null) { ent = [rb, 0, xrec | (2 << 30), 1]; st5x++; }
    else if (al * 2 >= nw) {
      for (let w = 0; w < nw; w++) if (!words[2 * w + 1]) { const c0 = w * 32, c1 = Math.min(n, c0 + 32);
        // 混合字：多数车道落在同一对齐字 B 的对应位上（例如例外改写过个别车道的累加值），整字读 B & 掩码，其余车道逐位补读；
        // 列映射段 33 项：各车道绝对位号 + [32] = B。掩码非 0 且非全 1（全部车道都对上时已是对齐字）
        const mx = mixOf(T, off, n, lo5, w);
        if (mx.best >= 2) { const seg = new Uint32Array(33);
          for (let c = c0; c < c1; c++) seg[c - c0] = rb + cm2[off + c];
          seg[32] = wb + mx.Brel; words[2 * w] = ccPut(CC, seg, ccAppends); words[2 * w + 1] = mx.mask; mixedW++; continue; }
        const seg = new Uint32Array(c1 - c0); for (let c = c0; c < c1; c++) seg[c - c0] = rb + cm2[off + c]; words[2 * w] = ccPut(CC, seg, ccAppends); }   // 一般字：绝对位号进全局列映射，掩码 0
      const base = wtLen / 2; if (base >= 2 ** 30) throw new Error('wtab too large'); wtPush(words); ent = [0, 0, base | (3 << 30), 0];
    } else { const o = ccPut(CC, cm2.subarray(off, off + n), ccAppends); if (o >= 2 ** 30) throw new Error('colmap offset too large'); ent = [rb, 0, o | (2 << 30), 0]; }
    rc.set(rb, ent); R5g.set(ent, 4 * rr); st5[ent[2] >>> 30]++;
  }
  // X16（exec/layer_exec.mjs）：组内全部输入为 X 类、每 16 行一项、同项共用偏移记录（z 相同）、行基址按 stride 等距、各项同一源行基 rb0。
  // 源按 (rb0, stride) 去重；nt = 该源被读到的最大车道 + 1。dst 与 gather5 逐字相同，只是读法不同。
  const X16g = new Uint32Array(NG).fill(0xffffffff), X16u = new Uint32Array(NG), x16src = [], x16uni = [], srcKey = new Map();
  for (const it of Lp.items) if (it.kind === 'grp') {
    const gi = it.g, q = GR(gi), W = q[1], ni = q[3]; if (!ni || ni % 16) continue;
    let ok = true, rb0 = null, stride = null, maxE = 0;
    for (let fw = 0; ok && fw < W; fw++) {
      const mo = 5 * wordmap[q[8] + fw], rbase = members5[mo + 4], wl = fw - members5[mo + 1], n = members5[mo + 3];
      for (let j = 0; ok && j < ni / 16; j++) {
        const e0 = 4 * (rbase + j * 16), x0 = R5g[e0], z0 = R5g[e0 + 2];
        if (z0 >>> 30 !== 2 || R5g[e0 + 3] !== 1) continue;           // 非 X 类的项：内核逐行照搬 gather5，不设约束
        if (rb0 === null) rb0 = x0; else if (x0 !== rb0) { ok = false; break; }
        for (let k = 1; k < 16; k++) { const e = 4 * (rbase + j * 16 + k), st = R5g[e] - R5g[e - 4];
          if (R5g[e + 2] !== z0 || R5g[e + 3] !== 1 || st <= 0) { ok = false; break; }
          if (stride === null) stride = st; else if (st !== stride) { ok = false; break; } }
        if (!ok) break;
        const xr = (z0 & 0x3fffffff) + wl * 9, xbase = wtBuf[xr], nb = Math.min(32, Math.max(0, n - wl * 32));
        for (let b = 0; b < nb; b++) { const e = xbase + ((wtBuf[xr + 1 + (b >> 2)] >>> ((b & 3) * 8)) & 255); if (e > maxE) maxE = e; }
      }
    }
    if (!ok || rb0 === null || stride === null) continue;
    const key = rb0 + ':' + stride; let si = srcKey.get(key);
    if (si === undefined) { si = x16src.length; srcKey.set(key, si); x16src.push({ rb0, stride, nt: 0 }); }
    x16src[si].nt = Math.max(x16src[si].nt, maxE + 1);
    X16g[gi] = si; X16u[gi] = x16uni.length; x16uni.push(si);
  }
  let tAll = 0; for (const sr of x16src) { sr.tbase = tAll; tAll += sr.nt; }
  const XPU = new Uint32Array(Math.max(1, x16src.length) * 64), GXU = new Uint32Array(Math.max(1, x16uni.length) * 64);
  x16src.forEach((sr, i) => XPU.set([sr.rb0, sr.stride, sr.nt, sr.tbase], i * 64));
  x16uni.forEach((si, i) => GXU.set([x16src[si].tbase, x16src[si].rb0, 0, 0], i * 64));
  // 组 uniform 与打包 uniform
  const UB = new Uint32Array(NG * 64);
  for (let i = 0; i < NG; i++) { const q = GR(i); UB.set([q[1], 0, 0xffffffff, 0xffffffff, q[3], q[8], q[2], members[5 * q[4] + 4]], i * 64); }
  const nout = meta.nout || 16 * 1536, PQ = new Uint32Array(128); PQ.set([meta.nstate], 0); PQ.set([nout], 64);
  // 段内核 v6
  const used = new Set(); for (const it of Lp.items) if (it.kind === 'seg') for (let i = it.g0; i < it.g1; i++) used.add(GR(i)[0]);
  const cases = [...used].sort((a, b) => a - b).map(id => { const name = meta.templates[id], e = tm[name].e; return { id, body: megaCase3(getBin(name), e.n_in, e.n_out, e.opts || {}, !!strict).body }; });
  const megaCode = megaWGSL6(cases, wmax), stb = buildStepTable6(Lp);
  const segs = Lp.items.filter(it => it.kind === 'seg'), MU = new Uint32Array(Math.max(1, segs.length) * 64);
  segs.forEach((it, j) => { it.u = j * 256; MU.set([it.g0, it.g1, 0, 0xffffffff], j * 64); });
  // sege：输入多的窄单元（facce4）单独的 v6 段内核，NIMAX = SEGE_NIMAX；步表与主段内核共用
  const segsE = Lp.items.filter(it => it.kind === 'sege'), MUE = new Uint32Array(Math.max(1, segsE.length) * 64);
  segsE.forEach((it, j) => { it.u = j * 256; MUE.set([it.g0, it.g1, 0, 0xffffffff], j * 64); });
  const usedE = new Set(); for (const it of segsE) for (let i = it.g0; i < it.g1; i++) usedE.add(GR(i)[0]);
  const megaCodeE = segsE.length ? megaWGSL6([...usedE].sort((a, b) => a - b).map(id => { const name = meta.templates[id], e = tm[name].e; return { id, body: megaCase3(getBin(name), e.n_in, e.n_out, e.opts || {}, !!strict).body }; }), wmax, SEGE_NIMAX) : null;
  // 链内核
  const chains = Lp.items.filter(it => it.kind === 'chain'), consumed = new Uint8Array(arenaWords), carryRow = new Set();
  for (const it of chains) for (let gi = it.g0 + 1; gi < it.g1; gi++) { const r0 = members[5 * GR(gi)[4] + 4]; for (let k = 0; k < 32; k++) carryRow.add(r0 + k); }
  // 被读的字：(off, n, rb 字内位) 相同的行读到的字相对 rb 字址是同一组，先求一次去重的相对字号再按行平移（与逐元素标记相同）
  const relWords = new Map();
  for (let i = 0; i < NC; i++) { const c = C(i), n = c[1], r0 = c[5];
    for (let k = 0; k < c[4]; k++) { const r = r0 + k; if (carryRow.has(r)) continue; const rb = rowsA[3 * r + 1], off = rowsA[3 * r + 2], sk = off * 1048576 + n, lo = rb & 31;
      let rs = relWords.get(sk); if (!rs) relWords.set(sk, rs = new Array(32)); let rel = rs[lo];
      if (!rel) { const t = new Int32Array(n); let m = 0, prev = -1; for (let x = 0; x < n; x++) { const v = Math.floor((lo + cm2[off + x]) / 32); if (v !== prev) { t[m++] = prev = v; } } rel = rs[lo] = t.slice(0, m); }   // 只并相邻重复（标记可重复）
      const wb = rb >>> 5; for (let t = 0; t < rel.length; t++) consumed[wb + rel[t]] = 1; } }
  for (const v of dtab) consumed[v >>> 5] = 1; for (const v of outtab) consumed[v >>> 5] = 1;
  const ct = buildChainTable(Lp, consumed);
  let chainCode = null; const CU = new Uint32Array(Math.max(1, chains.length) * 64);
  const CT = meta.templates.includes('add_nn') ? 'add_nn' : meta.templates.includes('add') ? 'add' : null;   // 与 splitChains 同一规则
  if (CT) { const e = tm[CT].e; chainCode = chainWGSL(megaCase3(getBin(CT), e.n_in, e.n_out, e.opts || {}, !!strict).body); }
  chains.forEach((it, j) => { it.u = j * 256; CU.set([it.base, it.g1 - it.g0, 0, 0xffffffff, 0, 0, 0, 0], j * 64); });
  const items = Lp.items.map(it => ({ ...it }));
  return {
    v: 1, meta, strict: !!strict, calls: Uint32Array.from(calls), groups: Uint32Array.from(groups), members5, wordmap: Uint32Array.from(wordmap), dtab: Uint32Array.from(dtab), otab: Uint32Array.from(outtab),
    litpool: shared ? null : Uint32Array.from(ir.litpool), R5g, wtab: wtBuf.slice(0, Math.max(4, wtLen)), ccAppends, UB, PQ, MU, stab: stb.stab, sbase: stb.sbase, ctab: ct.ctab, CU,
    items, megaCode, megaCodeE, MUE, // X16 的表放在顶层：本机缓存（core/pack_cache.mjs）只按顶层字段识别定型数组，嵌套对象会被当 JSON 存成普通对象，热启动时出错
    x16g: X16g, x16u: X16u, x16nt: Uint32Array.from(x16src.map(sr => sr.nt)), x16XPU: XPU, x16GXU: GXU, x16: { tAll, nGroups: x16uni.length }, chainCode, scalars: { litBase, arenaWords, maxIn, maxSlotsW, maxOut, nout, nNew, nSegs: segs.length, nChains: chains.length, chainSteps: ct.steps, chainSkippedStores: ct.skippedStores },
    stats: { gather5: { aligned: st5[0], broadcast: st5[1], general: st5[2] - st5x, bytemapped: st5x, wordmapped: st5[3], mixedWords: mixedW, wtabWords: wtLen }, prepMs: performance.now() - t0 },
  };
}
// GPU 一侧。SH：{ arena: { buffer, words } } 或 null；CCgpu：{ buf }（全局紧凑列映射 GPU 缓冲）
export async function uploadPack(g, P, { manifest, getBin, tmCache, SH = null, CCgpu, log = () => { } }) {
  const device = g.device, U = GPUBufferUsage, t0 = performance.now(), meta = P.meta, S = P.scalars;
  const mk = (data, usage = U.STORAGE | U.COPY_DST) => { const b = device.createBuffer({ size: al4(Math.max(16, data.byteLength)), usage }); if (data.byteLength) device.queue.writeBuffer(b, 0, data); return b; };
  const L = { meta, NC: meta.ncalls, NG: meta.ngroups, calls: P.calls, groups: P.groups, gather4: true, gather5: true, readFast: false, readFused: false, litBase: S.litBase };
  L.C = i => P.calls.subarray(i * 8, i * 8 + 8); L.GR = i => P.groups.subarray(i * 9, i * 9 + 9);
  for (const [o, seg] of P.ccAppends) device.queue.writeBuffer(CCgpu.buf, o * 4, seg);
  L.rows = mk(new Uint32Array(4)); L.litpool = mk(new Uint32Array(4)); L.dtab = mk(P.dtab); L.otab = mk(P.otab);
  L.members = mk(P.members5); L.wordmap = mk(P.wordmap); L.rows4 = mk(P.R5g); L.wtab = mk(P.wtab); L.colmap = CCgpu.buf;
  const tm = {}; for (const name of meta.templates) tm[name] = { ...templateInfo(tmCache, manifest, getBin, name, P.strict) };
  L.tm = tm;
  if (SH) {
    L.arena = SH.arena.buffer; L.arenaWords = SH.arena.words;
    L.stateStore = device.createBuffer({ size: al4(Math.max(16, Math.ceil(meta.nstate / 32) * 4)), usage: U.STORAGE | U.COPY_DST | U.COPY_SRC });
  } else {
    L.arenaWords = S.arenaWords; L.arena = device.createBuffer({ size: L.arenaWords * 4, usage: U.STORAGE | U.COPY_DST | U.COPY_SRC });
    const one = new Uint32Array(64); one[1] = 0xffffffff; device.queue.writeBuffer(L.arena, 0, one); device.queue.writeBuffer(L.arena, S.litBase * 4, P.litpool);
  }
  const scratch = (kind, size) => { g.scratch ||= {}; const cur = g.scratch[kind]; if (cur && cur.size >= size) return cur; const b = device.createBuffer({ size, usage: U.STORAGE }); g.scratch[kind] = b; return b; };
  L.inp = scratch('inp', al4(Math.max(16, S.maxIn * 4)) + 256); L.sc = scratch('sc', al4(Math.max(16, S.maxSlotsW * 4)));
  L.dummy = device.createBuffer({ size: 256, usage: U.STORAGE }); L.dummy2 = device.createBuffer({ size: 256, usage: U.STORAGE });
  const stBytes = al4(Math.max(16, Math.ceil(meta.nstate / 32) * 4));
  L.newState = device.createBuffer({ size: stBytes, usage: U.STORAGE | U.COPY_SRC });
  L.nout = S.nout; L.outWordsN = Math.ceil(L.nout / 32);
  L.outWords = device.createBuffer({ size: al4(Math.max(16, L.outWordsN * 4)), usage: U.STORAGE | U.COPY_SRC });
  L.rbOut = device.createBuffer({ size: al4(Math.max(16, L.outWordsN * 4)), usage: U.MAP_READ | U.COPY_DST });
  L.rbState = device.createBuffer({ size: stBytes, usage: U.MAP_READ | U.COPY_DST });
  L.snap = device.createBuffer({ size: stBytes, usage: U.COPY_SRC | U.COPY_DST });
  L.uni = mk(P.UB, U.UNIFORM | U.COPY_DST); L.puni = mk(P.PQ, U.UNIFORM | U.COPY_DST);
  g.plCache ||= new Map(); g.bglCache ||= new Map();
  const bgl = spec => { const k = spec.join(','); if (!g.bglCache.has(k)) { const l = device.createBindGroupLayout({ entries: spec.map((t, i) => ({ binding: i, visibility: GPUShaderStage.COMPUTE, buffer: { type: t[0] === 'u' ? 'uniform' : t[0] === 'r' ? 'read-only-storage' : 'storage', hasDynamicOffset: t[1] === 'd' } })) }); l.__key = k; g.bglCache.set(k, l); } return g.bglCache.get(k); };
  const KIND = { 'ud,r,r,w,wd,w': g.strict ? 'r3segstrict' : 'r3seg', 'ud,r,r,r,r,r,w,r,r': 'mega6', 'ud,r,w': 'chain', 'ud,r,r,r,r,r,w,r': 'gather5', 'ud,r,r,w': 'pack' };
  const pipe = async (code, layout) => { const key = layout.__key + '\n' + code; if (g.onCode) g.onCode(KIND[layout.__key] || layout.__key, code, layout.__key.split(','));   // R9：ISA 审计导出钩子
    if (!g.plCache.has(key)) g.plCache.set(key, device.createComputePipelineAsync({ layout: device.createPipelineLayout({ bindGroupLayouts: [layout] }), compute: { module: device.createShaderModule({ code }), entryPoint: 'main' } })); return g.plCache.get(key); };
  const gL5 = bgl(['ud', 'r', 'r', 'r', 'r', 'r', 'w', 'r']), pL = bgl(['ud', 'r', 'r', 'w']), sL = bgl(['ud', 'r', 'r', 'w', 'wd', 'w']);
  const later = [], defer = (pr, set) => later.push(pr.then(set));     // 管线编译不逐个等待：全部发出后由调用方统一等 L.pipesReady（编译与后续单元的准备重叠）
  defer(pipe(GATHER5_WGSL, gL5), p => L.gatherPipe = p); defer(pipe(PACK_WGSL, pL), p => L.packPipe = p);
  if (P.x16 && P.x16.nGroups) {                                         // X16 取数（exec/layer_exec.mjs）
    const xL = bgl(['ud', 'r', 'w']), gxL = bgl(['ud', 'r', 'r', 'r', 'r', 'r', 'w', 'r', 'r', 'ud']);
    defer(pipe(XPACK_WGSL, xL), p => L.xpackPipe = p); defer(pipe(GATHERX16_WGSL, gxL), p => L.gx16Pipe = p);
    // 执行器自留拷贝：冷启动时准备包写缓存会把顶层定型数组转移给写入 worker（core/pack_cache.mjs 的 keep 之外）
    L.x16 = true; L.x16g = P.x16g.slice(); L.x16u = P.x16u.slice(); L.x16nt = P.x16nt.slice();
    L.x16T = device.createBuffer({ size: al4(Math.max(16, P.x16.tAll * 4)), usage: U.STORAGE });
    L.xpackU = mk(P.x16XPU, U.UNIFORM | U.COPY_DST); L.gx16U = mk(P.x16GXU, U.UNIFORM | U.COPY_DST);
    L.xpackBG = device.createBindGroup({ layout: xL, entries: [{ binding: 0, resource: { buffer: L.xpackU, size: 16 } }, { binding: 1, resource: { buffer: L.arena } }, { binding: 2, resource: { buffer: L.x16T } }] });
    L.gx16BG = device.createBindGroup({ layout: gxL, entries: [{ binding: 0, resource: { buffer: L.uni, size: 32 } }, { binding: 1, resource: { buffer: L.rows4 } }, { binding: 2, resource: { buffer: L.colmap } },
      { binding: 3, resource: { buffer: L.members } }, { binding: 4, resource: { buffer: L.wordmap } }, { binding: 5, resource: { buffer: L.arena } }, { binding: 6, resource: { buffer: L.inp } },
      { binding: 7, resource: { buffer: L.wtab } }, { binding: 8, resource: { buffer: L.x16T } }, { binding: 9, resource: { buffer: L.gx16U, size: 16 } }] });
  }
  L.gatherBG = device.createBindGroup({ layout: gL5, entries: [{ binding: 0, resource: { buffer: L.uni, size: 32 } }, { binding: 1, resource: { buffer: L.rows4 } }, { binding: 2, resource: { buffer: L.colmap } },
    { binding: 3, resource: { buffer: L.members } }, { binding: 4, resource: { buffer: L.wordmap } }, { binding: 5, resource: { buffer: L.arena } }, { binding: 6, resource: { buffer: L.inp } }, { binding: 7, resource: { buffer: L.wtab } }] });
  L.packD = device.createBindGroup({ layout: pL, entries: [{ binding: 0, resource: { buffer: L.puni, size: 16 } }, { binding: 1, resource: { buffer: L.dtab } }, { binding: 2, resource: { buffer: L.arena } }, { binding: 3, resource: { buffer: L.newState } }] });
  L.packO = device.createBindGroup({ layout: pL, entries: [{ binding: 0, resource: { buffer: L.puni, size: 16 } }, { binding: 1, resource: { buffer: L.otab } }, { binding: 2, resource: { buffer: L.arena } }, { binding: 3, resource: { buffer: L.outWords } }] });
  const outBind = al4(S.maxOut) * 4;
  for (const name of meta.templates) {
    const t = tm[name];
    defer(Promise.all(t.gw.shaders.map(code => pipe(code, sL))), ps => t.pipes = ps);
    t.bg = device.createBindGroup({ layout: sL, entries: [{ binding: 0, resource: { buffer: L.uni, size: 16 } }, { binding: 1, resource: { buffer: L.inp } }, { binding: 2, resource: { buffer: L.dummy } },
      { binding: 3, resource: { buffer: L.dummy2 } }, { binding: 4, resource: { buffer: L.arena, size: outBind } }, { binding: 5, resource: { buffer: L.sc } }] });
  }
  L.items = P.items.map(it => ({ ...it }));
  const mL = bgl(['ud', 'r', 'r', 'r', 'r', 'r', 'w', 'r', 'r']);
  L.megaCode = P.megaCode; defer(pipe(P.megaCode, mL), p => L.megaPipe = p);
  L.megaUni = mk(P.MU, U.UNIFORM | U.COPY_DST); L.grp = mk(P.groups); L.stab = mk(P.stab); L.sbase = mk(P.sbase);
  L.megaBG = device.createBindGroup({ layout: mL, entries: [{ binding: 0, resource: { buffer: L.megaUni, size: 16 } }, { binding: 1, resource: { buffer: L.grp } }, { binding: 2, resource: { buffer: L.rows } },
    { binding: 3, resource: { buffer: L.colmap } }, { binding: 4, resource: { buffer: L.members } }, { binding: 5, resource: { buffer: L.wordmap } }, { binding: 6, resource: { buffer: L.arena } },
    { binding: 7, resource: { buffer: L.stab } }, { binding: 8, resource: { buffer: L.sbase } }] });
  if (P.megaCodeE) {
    defer(pipe(P.megaCodeE, mL), p => L.megaPipeE = p); L.megaUniE = mk(P.MUE, U.UNIFORM | U.COPY_DST);
    L.megaBGE = device.createBindGroup({ layout: mL, entries: [{ binding: 0, resource: { buffer: L.megaUniE, size: 16 } }, { binding: 1, resource: { buffer: L.grp } }, { binding: 2, resource: { buffer: L.rows } },
      { binding: 3, resource: { buffer: L.colmap } }, { binding: 4, resource: { buffer: L.members } }, { binding: 5, resource: { buffer: L.wordmap } }, { binding: 6, resource: { buffer: L.arena } },
      { binding: 7, resource: { buffer: L.stab } }, { binding: 8, resource: { buffer: L.sbase } }] });
  }
  if (P.chainCode) {
    const cL = bgl(['ud', 'r', 'w']); L.chainCode = P.chainCode; defer(pipe(P.chainCode, cL), p => L.chainPipe = p);
    L.ctab = mk(P.ctab); L.chainUni = mk(P.CU, U.UNIFORM | U.COPY_DST);
    L.chainBG = device.createBindGroup({ layout: cL, entries: [{ binding: 0, resource: { buffer: L.chainUni, size: 32 } }, { binding: 1, resource: { buffer: L.ctab } }, { binding: 2, resource: { buffer: L.arena } }] });
  }
  L.nSegs = S.nSegs; L.nChains = S.nChains; L.nChainSteps = S.chainSteps; L.gather5Stats = P.stats.gather5;
  L.pipesReady = Promise.all(later); L.pipesReady.catch(() => { });   // 失败留到统一等待处抛出（避免未处理拒绝）
  await device.queue.onSubmittedWorkDone();
  L.loadMs = performance.now() - t0; L.nDispatch = 0;
  return L;
}
