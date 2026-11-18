// SPDX-License-Identifier: CC0-1.0
// TGW1 in JavaScript: format, hashing, validation and an executor that computes exactly what the structure
// segment says. Second, independent implementation (the first is in Python). Nothing here knows any model:
// no layer count, width, head count, matrix shape, vocabulary size or loop count. The only things it knows
// are format concepts (records, ports, wires, leaves) and, for the fast path, integer routines for specific
// leaf netlists identified by their sha256. No floating-point rounding is relied on: every number used is an
// exact integer below 2^53, and 64-bit leaf values are handled as two 32-bit halves.

export class Reject extends Error {
  constructor(check, detail) { super(detail ? check + '：' + detail : check); this.check = check; }
}
export const CHUNK = 24000;
const KINDS = 'STWDN', GROUP = { S: 1, T: 1, W: 2, D: 3, N: 0 };
const SRC_IN = 0xFFFF, SRC_Z = 0xFFFE, SRC_O = 0xFFFD, SRC_PREV = 0xFFFC;
const K_LEAF = 0, K_MOD = 1, K_LOOK = 2, K_WIRE = 3, F_LAST = 1, LF_TAPED = 1, LF_LOAD = 2;
const TWO32 = 4294967296;

export async function sha256(u8) { return new Uint8Array(await crypto.subtle.digest('SHA-256', u8)); }
export const hex = u8 => Array.from(u8, b => b.toString(16).padStart(2, '0')).join('');
const cat = (...a) => { const n = a.reduce((s, x) => s + x.length, 0), o = new Uint8Array(n); let p = 0; for (const x of a) { o.set(x, p); p += x.length; } return o; };
const eq = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);
export function chunksOf(b) { const o = []; for (let i = 0; i < b.length; i += CHUNK) o.push(b.subarray(i, Math.min(b.length, i + CHUNK))); return o.length ? o : [b.subarray(0, 0)]; }

export async function merkle(hashes) {
  if (!hashes.length) return sha256(Uint8Array.of(2));
  let level = []; for (const h of hashes) level.push(await sha256(cat(Uint8Array.of(0), h)));
  while (level.length > 1) {
    const nxt = [];
    for (let i = 0; i + 1 < level.length; i += 2) nxt.push(await sha256(cat(Uint8Array.of(1), level[i], level[i + 1])));
    if (level.length % 2) nxt.push(level[level.length - 1]);
    level = nxt;
  }
  return level[0];
}
export async function roots(hs) {
  const st = await merkle(hs.S.concat(hs.T)), w = await merkle(hs.W), d = await merkle(hs.D);
  return { st, w, d, model: await sha256(cat(new TextEncoder().encode('TGW1'), st, w, d)) };
}
export async function buildManifest(segs) {
  const hs = {}; for (const k of KINDS) { hs[k] = []; for (const c of chunksOf(segs[k])) hs[k].push(await sha256(c)); }
  const r = await roots(hs), head = new Uint8Array(16), dv = new DataView(head.buffer);
  head.set(new TextEncoder().encode('TGW1')); dv.setUint16(4, 1, true); dv.setUint32(8, CHUNK, true); dv.setUint32(12, 5, true);
  const parts = [head, r.st, r.w, r.d, r.model];
  for (const k of KINDS) {
    const e = new Uint8Array(16), ev = new DataView(e.buffer);
    e[0] = k.charCodeAt(0); e[1] = GROUP[k]; ev.setUint32(4, hs[k].length, true); ev.setUint32(8, segs[k].length, true);
    parts.push(e, await sha256(segs[k]));
  }
  for (const k of KINDS) parts.push(...hs[k]);
  return cat(...parts);
}

// Parse the manifest and check everything that can be checked without the segments.
export async function readManifest(m, pin) {
  if (m.length < 384 || new TextDecoder().decode(m.subarray(0, 4)) !== 'TGW1') throw new Reject('清单格式', '标记');
  const dv = new DataView(m.buffer, m.byteOffset, m.byteLength);
  if (dv.getUint16(4, true) !== 1 || dv.getUint16(6, true) !== 0 || dv.getUint32(8, true) !== CHUNK || dv.getUint32(12, true) !== 5) throw new Reject('清单格式', '版本、标志、块大小或段数');
  const table = {}; let pos = 144, total = 0;
  for (const k of KINDS) {
    const nch = dv.getUint32(pos + 4, true), size = dv.getUint32(pos + 8, true);
    if (m[pos] !== k.charCodeAt(0) || m[pos + 1] !== GROUP[k] || dv.getUint16(pos + 2, true) !== 0 || dv.getUint32(pos + 12, true) !== 0) throw new Reject('清单格式', '段表 ' + k);
    if (nch !== Math.max(1, Math.ceil(size / CHUNK))) throw new Reject('清单格式', k + ' 段块数');
    table[k] = { chunks: nch, bytes: size, sha: m.subarray(pos + 16, pos + 48) };
    pos += 48; total += nch;
  }
  if (m.length !== pos + 32 * total) throw new Reject('清单格式', '长度');
  const hs = {};
  for (const k of KINDS) { hs[k] = []; for (let i = 0; i < table[k].chunks; i++, pos += 32) hs[k].push(m.subarray(pos, pos + 32)); }
  const r = await roots(hs);
  const stated = { st: m.subarray(16, 48), w: m.subarray(48, 80), d: m.subarray(80, 112), model: m.subarray(112, 144) };
  for (const [k, name] of [['st', '结构根'], ['w', '权重根'], ['d', '说明根'], ['model', '模型根']])
    if (!eq(r[k], stated[k])) throw new Reject('清单里的根和块哈希对不上', name);
  if (pin && hex(r.model) !== pin) throw new Reject('模型根不等于钉住的值', '算出 ' + hex(r.model).slice(0, 16) + '…，钉住 ' + pin.slice(0, 16) + '…');
  return { table, hs, modelRoot: hex(r.model), structRoot: hex(r.st), weightRoot: hex(r.w), descRoot: hex(r.d), manifestBytes: m.length, totalChunks: total };
}

// Check one segment against the manifest, chunk by chunk. onChunk(kind, index, count) reports progress.
export async function checkSegment(man, k, b, onChunk) {
  if (b.length !== man.table[k].bytes) throw new Reject('段长度', k + ' 段');
  const cs = chunksOf(b);
  for (let i = 0; i < cs.length; i++) {
    if (!eq(await sha256(cs[i]), man.hs[k][i])) throw new Reject('块哈希', k + ' 段第 ' + i + ' 块的 sha256 和清单不符');
    if (onChunk) onChunk(k, i, cs.length);
  }
  if (!eq(await sha256(b), man.table[k].sha)) throw new Reject('整段哈希', k + ' 段');
}

export function parseStructure(s) {
  const bad = d => { throw new Reject('结构段格式', d); };
  if (s.length < 32 || new TextDecoder().decode(s.subarray(0, 4)) !== 'TGS1') bad('标记');
  const dv = new DataView(s.buffer, s.byteOffset, s.byteLength), u32 = o => dv.getUint32(o, true), u16 = o => dv.getUint16(o, true);
  const nleaf = u32(4), nmod = u32(8), top = u32(12), ndir = u32(16), inBits = u32(20), outBits = u32(24);
  if (u32(28) !== 0) bad('保留');
  let pos = 32;
  if (s.length < pos + nleaf * 96 + ndir * 32) bad('表被截断');
  const leaves = [], tensors = [], modules = [], portOffsets = [];
  for (let i = 0; i < nleaf; i++, pos += 96) leaves.push({
    chainId: u32(pos), cpu: s.subarray(pos + 4, pos + 24), cid: u32(pos + 24), sha: s.subarray(pos + 28, pos + 60), shaHex: hex(s.subarray(pos + 28, pos + 60)),
    nIn: u32(pos + 60), nOut: u32(pos + 64), nState: u32(pos + 68), beats: u16(pos + 72), flags: u16(pos + 74), outSkip: u32(pos + 76),
    nNand: u32(pos + 80), nLatch: u32(pos + 84), nOff: u32(pos + 88), nLen: u32(pos + 92),
  });
  for (const lf of leaves) { lf.inW = lf.nIn - ((lf.flags & LF_LOAD) ? 1 : 0); lf.outW = lf.nOut - lf.outSkip; lf.taped = !!(lf.flags & LF_TAPED); }
  for (let i = 0; i < ndir; i++, pos += 32) {
    let name = ''; for (let j = 0; j < 12 && s[pos + j]; j++) name += String.fromCharCode(s[pos + j]);
    const t = { name, seg: String.fromCharCode(s[pos + 12]), enc: s[pos + 13], storeBits: s[pos + 14], valueBits: s[pos + 15], fracBits: s[pos + 16], byteOff: u32(pos + 20), count: u32(pos + 24), cols: u32(pos + 28) };
    if (s[pos + 17] || s[pos + 18] || s[pos + 19] || !'WT'.includes(t.seg) || t.enc > 2) bad('张量目录项');
    tensors.push(t);
  }
  for (let mi = 0; mi < nmod; mi++) {
    if (s.length < pos + 16) bad('模块被截断');
    const nrec = u32(pos), nIn = u32(pos + 4), nOut = u32(pos + 8);
    if (u32(pos + 12) !== 0 || nrec === 0 || nrec >= 0xFFF0) bad('模块头');
    pos += 16;
    const recs = [], roffs = [];
    for (let ri = 0; ri < nrec; ri++) {
      if (s.length < pos + 16) bad('记录被截断');
      const kind = s[pos], flags = s[pos + 1], tri = s[pos + 2], nports = u16(pos + 4), target = u32(pos + 8), rep = u32(pos + 12);
      if (kind > K_WIRE || (flags & ~F_LAST) || s[pos + 3] || u16(pos + 6) || rep === 0 || nports === 0) bad('记录头（模块 ' + mi + ' 记录 ' + ri + '）');
      pos += 16;
      if (s.length < pos + nports * 16) bad('口被截断');
      const ports = [], poffs = [];
      for (let pi = 0; pi < nports; pi++, pos += 16) {
        const p = { src: u16(pos), init: u16(pos + 2), off: u32(pos + 4), stride: u32(pos + 8), width: u32(pos + 12) };
        let ok = p.src < ri || p.src === SRC_IN || p.src === SRC_Z || p.src === SRC_O || p.src === SRC_PREV;
        if (p.src === SRC_PREV) ok = p.init < ri || p.init === SRC_IN || p.init === SRC_Z || p.init === SRC_O; else if (p.init !== 0) ok = false;
        if (!ok || p.width === 0) bad('口（模块 ' + mi + ' 记录 ' + ri + '）');
        ports.push(p); poffs.push(pos);
      }
      const chain = ports.some(p => p.src === SRC_PREV);
      if ((kind === K_LEAF && target >= nleaf) || (kind === K_MOD && target >= mi)) bad('引用目标（模块 ' + mi + ' 记录 ' + ri + '）');
      if (kind === K_LOOK && (ports.length !== 2 || target === 0 || ports[0].width > 32 || chain)) bad('查表记录');
      if ((flags & F_LAST) && !chain) bad('LAST 记录没有 PREV 口');
      recs.push({ kind, flags, tri, target, rep, ports, chain, inW: ports.reduce((a, p) => a + p.width, 0) });
      roffs.push(poffs);
    }
    modules.push({ nIn, nOut, recs }); portOffsets.push(roffs);
  }
  if (pos !== s.length) bad('末尾多出字节');
  if (top >= nmod) bad('顶层模块号');
  return { leaves, tensors, modules, top, inBits, outBits, portOffsets };
}

export async function validate(segs, st) {
  for (let i = 0; i < st.leaves.length; i++) {
    const lf = st.leaves[i];
    if ((lf.flags & ~(LF_TAPED | LF_LOAD)) || lf.outSkip >= lf.nOut || lf.beats === 0 || lf.nLen !== 7 * lf.nNand + 4 * lf.nLatch || lf.nState !== lf.nLatch) throw new Reject('叶子表字段', '第 ' + i + ' 颗');
    if (!lf.taped && (lf.chainId || lf.cid || lf.cpu.some(v => v))) throw new Reject('叶子表字段', '第 ' + i + ' 颗标为未流片却带链上引用');
    if (segs.N) {
      const raw = segs.N.subarray(lf.nOff, lf.nOff + lf.nLen);
      if (raw.length !== lf.nLen || !eq(await sha256(raw), lf.sha)) throw new Reject('叶子网表副本的 sha256', '第 ' + i + ' 颗叶子的副本和结构段里记的 sha256 不符');
    }
  }
  const top = st.modules[st.top];
  if (top.nIn !== st.inBits + 8 * segs.W.length + 8 * segs.T.length) throw new Reject('顶层输入宽度', '不等于运行时输入 + W + T');
  if (top.nOut !== st.outBits) throw new Reject('顶层输出宽度');
  for (const t of st.tensors) {
    const b = segs[t.seg], nbytes = Math.ceil(t.count * t.storeBits / 8);
    if (t.byteOff + nbytes > b.length) throw new Reject('张量范围', t.name + ' 超出所在段');
    if (t.enc === 2) {
      if (t.storeBits !== 2 || t.count % 4) throw new Reject('张量范围', t.name);
      for (let i = 0; i < nbytes; i++) { const v = b[t.byteOff + i]; if (v & (v >> 1) & 0x55) throw new Reject('三值码检查', '张量 ' + t.name + ' 第 ' + i + ' 字节里有码 3'); }
    } else {
      if (![8, 16, 32].includes(t.storeBits) || t.valueBits < 1 || t.valueBits > t.storeBits) throw new Reject('张量范围', t.name);
      for (const x of readTensor(segs, t)) {
        const lo = t.enc === 1 ? -(2 ** (t.valueBits - 1)) : 0, hi = t.enc === 1 ? 2 ** (t.valueBits - 1) - 1 : 2 ** t.valueBits - 1;
        if (x < lo || x > hi) throw new Reject('张量范围', t.name + ' 里有数超出 ' + t.valueBits + ' 位');
      }
    }
  }
  // a file holds no tensor that nothing reads (SPEC.md section 4)
  const rd = topReads(st);
  for (const t of st.tensors) { const [lo, hi] = tensorSpan(st, segs, t); if (!cutIv(rd, lo, hi).length) throw new Reject('没人读的张量', '张量 ' + t.name + ' 没有被结构里任何一条记录读到'); }
}
// ---------------------------------------------------------------- which input wires the structure reads
// Static, from the S segment alone. A leaf, lookup or wire record reads every wire its ports name; a module
// record reads what the called module reads; a TRI record makes only `index + 1` repetitions.
function normIv(iv) {
  iv = iv.filter(x => x[1] > x[0]).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const out = [];
  for (const [a, b] of iv) { const l = out[out.length - 1]; if (l && a <= l[1]) { if (b > l[1]) l[1] = b; } else out.push([a, b]); }
  return out;
}
const cutIv = (iv, a, b) => iv.filter(x => x[1] > a && x[0] < b).map(x => [Math.max(x[0], a), Math.min(x[1], b)]);
export function moduleNeed(st) {
  const need = [];
  for (const m of st.modules) {
    const s = new Set();
    for (const r of m.recs) { if (r.tri) s.add(r.tri); if (r.kind === K_MOD) for (const k of need[r.target]) if (k > 1) s.add(k - 1); }
    need.push(s);
  }
  return need;
}
export function reads(st, need, memo, mi, stack) {   // stack: repetition indices, -1 where there is none
  const key = mi + ':' + [...need[mi]].sort((a, b) => a - b).map(k => (k <= stack.length ? stack[stack.length - k] : -1)).join(',');
  if (memo.has(key)) return memo.get(key);
  const acc = [];
  for (const rec of st.modules[mi].recs) {
    let reps = rec.rep;
    if (rec.tri) {
      if (rec.tri > stack.length || stack[stack.length - rec.tri] < 0) throw new Reject('tri 记录', '那一层没有序号');
      reps = stack[stack.length - rec.tri] + 1;
    }
    const perRep = rec.kind === K_MOD && need[rec.target].has(1);
    const live = perRep ? null : rec.kind === K_MOD ? reads(st, need, memo, rec.target, [...stack, -1]) : [[0, rec.inW]];
    let pos = 0;
    for (const p of rec.ports) {
      if (p.src === SRC_IN || (p.src === SRC_PREV && p.init === SRC_IN)) {
        const firstOnly = p.src === SRC_PREV;
        for (let r = 0; r < (firstOnly ? 1 : reps); r++) {
          const lv = perRep ? reads(st, need, memo, rec.target, [...stack, r]) : live;
          const base = (firstOnly ? p.stride : p.off + r * p.stride) - pos, sub = cutIv(lv, pos, pos + p.width);
          if (!perRep && !firstOnly && (p.stride === 0 || p.stride === p.width) && sub.length === 1 && sub[0][0] === pos && sub[0][1] === pos + p.width) {
            acc.push([p.off, p.off + (reps - 1) * p.stride + p.width]); break;   // one run for all repetitions
          }
          for (const [a, b] of sub) acc.push([a + base, b + base]);
        }
      }
      pos += p.width;
    }
  }
  const res = normIv(acc);
  memo.set(key, res);
  return res;
}
export const topReads = st => reads(st, moduleNeed(st), new Map(), st.top, []);
export function tensorSpan(st, segs, t) {
  const base = st.inBits + (t.seg === 'T' ? 8 * segs.W.length : 0) + 8 * t.byteOff;
  return [base, base + t.count * t.storeBits];
}

export function readTensor(segs, t) {
  const b = segs[t.seg], dv = new DataView(b.buffer, b.byteOffset, b.byteLength), out = new Array(t.count), w = t.storeBits / 8;
  for (let i = 0; i < t.count; i++) {
    const o = t.byteOff + i * w;
    out[i] = w === 1 ? (t.enc === 1 ? dv.getInt8(o) : dv.getUint8(o)) : w === 2 ? (t.enc === 1 ? dv.getInt16(o, true) : dv.getUint16(o, true)) : (t.enc === 1 ? dv.getInt32(o, true) : dv.getUint32(o, true));
  }
  return out;
}

// ---------------------------------------------------------------- bit memory
// One arena of 32-bit words; a position is an absolute bit number. Bit j of byte i of a segment is bit 8i+j.
let M = new Uint32Array(1 << 20), SP = 0, FLOOR = 0;   // FLOOR: words below it are kept between runs (tgw1inc.js); 0 unless that is used
function alloc(nbits) { const p = SP; SP += (nbits + 31) >>> 5; if (SP > M.length) { const n = new Uint32Array(Math.max(M.length * 2, SP + 1024)); n.set(M); M = n; } return p * 32; }
function get(pos, w) { const i = pos >>> 5, s = pos & 31; let v = M[i] >>> s; if (s + w > 32) v |= M[i + 1] << (32 - s); return w === 32 ? v >>> 0 : (v & ((1 << w) - 1)) >>> 0; }
function put(pos, w, val) {
  const i = pos >>> 5, s = pos & 31, mask = w === 32 ? 0xFFFFFFFF : (1 << w) - 1; val &= mask;
  M[i] = (M[i] & ~(mask << s)) | (val << s);
  if (s + w > 32) { const r = 32 - s; M[i + 1] = (M[i + 1] & ~(mask >>> r)) | (val >>> r); }
}
function copy(src, dst, n) {
  if (((src | dst) & 31) === 0 && n >= 32) { const k = n >>> 5; M.copyWithin(dst >>> 5, src >>> 5, (src >>> 5) + k); src += k * 32; dst += k * 32; n -= k * 32; }
  while (n > 0) { const k = n < 32 ? n : 32; put(dst, k, get(src, k)); src += k; dst += k; n -= k; }
}
function fill(dst, n, bit) { const v = bit ? 0xFFFFFFFF : 0; while (n > 0) { const k = n < 32 ? n : 32; put(dst, k, v); dst += k; n -= k; } }
// for tgw1inc.js: the same bit memory. keep(nbits) allocates wires that survive later runs.
export const mem = {
  alloc, get, put, copy, fill, gs: (pos, w) => gs(pos, w), nativePlaneDot: (ip, op, s) => nativePlaneDot(ip, op, s), mark: () => SP, release: p => { SP = p; },
  keep(nbits) { if (SP !== FLOOR) throw new Reject('位内存', '有临时线时不能分配保留的线'); const p = alloc(nbits); FLOOR = SP; return p; },
  toFloor() { SP = FLOOR; },
  setWords(words, pos) { M.set(words, pos >>> 5); },
};
const sgn = (v, w) => (w < 32 ? (v >= 2 ** (w - 1) ? v - 2 ** w : v) : v | 0);
const gs = (pos, w) => sgn(get(pos, w), w);
const gu53 = (pos, w) => get(pos, 32) + get(pos + 32, w - 32) * TWO32;
const gs53 = (pos, w) => { const u = gu53(pos, w); return u >= 2 ** (w - 1) ? u - 2 ** w : u; };
const put53 = (pos, w, v) => { put(pos, 32, v % TWO32); put(pos + 32, w - 32, Math.floor(v / TWO32)); };
const mod = (v, m) => ((v % m) + m) % m;
function rne(n, d) {   // round to nearest, ties to even; exact for |n| < 2^53
  const neg = n < 0, a = neg ? -n : n; let q = Math.floor(a / d), r = a - q * d;
  if (r < 0) { q--; r += d; } else if (r >= d) { q++; r -= d; }
  if (2 * r > d || (2 * r === d && q % 2 === 1)) q++;
  return neg ? -q : q;
}
const sat20 = v => (v < -524288 ? -524288 : v > 524287 ? 524287 : v);

// ---------------------------------------------------------------- gate path
function parseNet(raw, lf) {
  const n = lf.nNand + lf.nLatch, op = new Uint8Array(n), a = new Uint32Array(n), b = new Uint32Array(n);
  let p = 0, i = 0;
  for (; p < raw.length && i < n; i++) {
    op[i] = raw[p]; a[i] = (raw[p + 1] << 16) | (raw[p + 2] << 8) | raw[p + 3];
    if (raw[p] === 0) { b[i] = (raw[p + 4] << 16) | (raw[p + 5] << 8) | raw[p + 6]; p += 7; } else if (raw[p] === 1) p += 4; else throw new Reject('叶子网表', '操作码');
    const lim = op[i] ? 2 + lf.nIn + n : 2 + lf.nIn + i;
    if (a[i] >= lim || b[i] >= lim) throw new Reject('叶子网表', '线号');
  }
  if (p !== raw.length || i !== n || lf.nOut > n) throw new Reject('叶子网表', '长度');
  return { op, a, b, n };
}
// Evaluate up to 32 independent inputs at once (one bit lane each); every NAND of the netlist is computed.
function gateEval(net, lf, inPos, outPos) {
  const lanes = inPos.length, load = (lf.flags & LF_LOAD) ? 1 : 0, base = 2 + lf.nIn, v = new Int32Array(base + net.n);
  const mask = lanes === 32 ? -1 : (1 << lanes) - 1;
  v[1] = mask;
  for (let j = 0; j < lf.inW; j++) { let x = 0; for (let l = 0; l < lanes; l++) x |= get(inPos[l] + j, 1) << l; v[2 + load + j] = x; }
  let state = new Int32Array(lf.nLatch); const next = new Int32Array(lf.nLatch);
  for (let beat = 0; beat < lf.beats; beat++) {
    if (load) v[2] = beat === 0 ? mask : 0;
    let si = 0;
    for (let i = 0; i < net.n; i++) v[base + i] = net.op[i] ? state[si++] : mask & ~(v[net.a[i]] & v[net.b[i]]);
    si = 0;
    for (let i = 0; i < net.n; i++) if (net.op[i]) next[si++] = v[net.a[i]];
    state.set(next);
  }
  const o0 = base + net.n - lf.nOut + lf.outSkip;
  for (let l = 0; l < lanes; l++) for (let j = 0; j < lf.outW; j++) put(outPos[l] + j, 1, (v[o0 + j] >>> l) & 1);
}

// ---------------------------------------------------------------- native leaf routines (i = input position, o = output position)
function nDot32(i, o) { let s = 0; for (let j = 0; j < 32; j++) { const c = get(i + 256 + 2 * j, 2); if (c === 1) s += gs(i + 8 * j, 8); else if (c === 2) s -= gs(i + 8 * j, 8); } put(o, 32, s | 0); }
function nEmbed(i, o) { put(o, 20, sat20(rne(gs(i, 8) * get(i + 8, 18), 4096))); }
function nA8max(i, o) { const m = get(i, 20), v = Math.abs(gs(i + 20, 20)); put(o, 20, v > m ? v : m); }
function nA8q(i, o) { const x = gs(i, 20), m = get(i + 20, 20); if (m < 1 || Math.abs(x) > m) throw new Reject('叶子输入超出核过的定义域', 'a8_q'); put(o, 8, rne(127 * x, m)); }
function nSumsq(i, o) { const x = gs(i + 46, 20); put53(o, 46, mod(gu53(i, 46) + x * x, 2 ** 46)); }
function nKvdeq(i, o) { put(o, 20, sat20(rne(gs(i, 8) * get(i + 8, 20), 127))); }
function nAttnmac(i, o) { put53(o, 45, mod(gs53(i, 45) + gs(i + 45, 20) * gs(i + 65, 20), 2 ** 45)); }
function nScore(i, o) { put(o, 32, rne(rne(gs53(i, 45), 4096) * 46341, 262144)); }
function nSmax(i, o) { const m = gs(i, 32), s = gs(i + 32, 32); put(o, 32, s > m ? s : m); }
function nExp(i, o, ctx) { const d = gs(i, 32) - gs(i + 32, 32); if (d < 0) throw new Reject('叶子输入超出核过的定义域', 'exp'); const j = rne(d, 64); put(o, 17, j > 1024 ? 0 : ctx.table[j]); }
function nDenacc(i, o) { put(o, 22, (get(i, 22) + get(i + 22, 17)) % 4194304); }
function nRedmac(i, o) { put53(o, 42, mod(gs53(i, 42) + get(i + 42, 17) * gs(i + 59, 20), 2 ** 42)); }
function nResid(i, o) { put(o, 20, sat20(gs(i, 20) + gs(i + 20, 20))); }
function nHeadmac(i, o) { put(o, 22, mod(gs(i, 22) + gs(i + 22, 8) * gs(i + 30, 8), 4194304)); }
function nDiv(i, o) {   // signed 64-bit n, unsigned 25-bit d >= 1 -> R(n, d) (64 bits), then clamped to signed 20 bits
  let lo = get(i, 32), hi = get(i + 32, 32); const d = get(i + 64, 25);
  if (d < 1) throw new Reject('叶子输入超出核过的定义域', 'serial_div');
  const neg = hi >>> 31;
  if (neg) { lo = (~lo + 1) >>> 0; hi = (~hi + (lo === 0 ? 1 : 0)) >>> 0; }
  const limbs = [hi >>> 16, hi & 0xFFFF, lo >>> 16, lo & 0xFFFF], q = [0, 0, 0, 0]; let rem = 0;
  for (let k = 0; k < 4; k++) { const cur = rem * 65536 + limbs[k]; let ql = Math.floor(cur / d), r = cur - ql * d; if (r < 0) { ql--; r += d; } else if (r >= d) { ql++; r -= d; } q[k] = ql; rem = r; }
  let qlo = q[2] * 65536 + q[3], qhi = q[0] * 65536 + q[1];
  if (2 * rem + (qlo % 2) > d) { qlo += 1; if (qlo >= TWO32) { qlo -= TWO32; qhi = (qhi + 1) % TWO32; } }
  qlo >>>= 0; qhi >>>= 0;
  if (neg) { qlo = (~qlo + 1) >>> 0; qhi = (~qhi + (qlo === 0 ? 1 : 0)) >>> 0; }
  put(o, 32, qlo); put(o + 32, 32, qhi);
  let s;
  if (qhi === 0 && qlo <= 524287) s = qlo; else if (qhi === 0xFFFFFFFF && qlo >= 0xFFF80000) s = qlo & 0xFFFFF; else s = (qhi >>> 31) ? 0x80000 : 0x7FFFF;
  put(o + 64, 20, s);
}
function nMul(i, o) {   // low 64 bits of a 64 x 64 product, by 16-bit limbs
  const alo = get(i, 32), ahi = get(i + 32, 32), blo = get(i + 64, 32), bhi = get(i + 96, 32);
  const a0 = alo & 0xFFFF, a1 = alo >>> 16, b0 = blo & 0xFFFF, b1 = blo >>> 16;
  const mid = a0 * b1 + a1 * b0, l = a0 * b0 + (mid % 65536) * 65536;
  const hi = a1 * b1 + Math.floor(mid / 65536) + Math.floor(l / TWO32) + (Math.imul(alo, bhi) >>> 0) + (Math.imul(ahi, blo) >>> 0);
  put(o, 32, l % TWO32); put(o + 32, 32, hi % TWO32);
}
function nSqrt(i, o) { let rem = 0, root = 0; for (let k = 23; k >= 0; k--) { rem = rem * 4 + get(i + 2 * k, 2); const t = root * 4 + 1; if (rem >= t) { rem -= t; root = root * 2 + 1; } else root *= 2; } put(o, 24, root); }
function nAdd64(i, o) { const l = get(i, 32) + get(i + 64, 32) + get(i + 128, 1), h = get(i + 32, 32) + get(i + 96, 32) + (l >= TWO32 ? 1 : 0); put(o, 32, l % TWO32); put(o + 32, 32, h % TWO32); put(o + 64, 1, h >= TWO32 ? 1 : 0); }
const dA8q = i => get(i + 20, 20) >= 1 && Math.abs(gs(i, 20)) <= get(i + 20, 20);
const dExp = i => gs(i, 32) >= gs(i + 32, 32);
const dDiv = i => get(i + 64, 25) >= 1;

// netlist sha256 -> [name, input field widths, routine, domain predicate or null, domain in words]
export const NATIVE = {
  b1507f55d3bd80bbc55f9e06dc656d81e049138827c97ec7fe640d7bfa2ce0b7: ['dot32_t', Array(32).fill(8).concat(Array(32).fill(2)), nDot32, null, ''],
  c838d59056eb4dce1ceb7b52070f780b2299647769a1e1bf3485bf2c39f29962: ['embed', [8, 18], nEmbed, null, ''],
  efa9ff39c92b23415dba3e966d46802c9cf9b73128a075bf2cd72a21239f6657: ['a8_max', [20, 20], nA8max, null, ''],
  '03d19bd8cee9d715fe35c50e996dfe2422d3dd60bf2e755bc88f4e755c9de200': ['a8_q', [20, 20], nA8q, dA8q, 'm ≥ 1 且 |x| ≤ m'],
  '23cb3c58bdfb8157c19fb5f6a999102f3c3612f30a9aca6e9dc714c1edd965c8': ['sumsq', [46, 20], nSumsq, null, ''],
  '2274f041001ed72005246632918b16da76ff2b2b570fae7dba45de5df69738b9': ['kv_deq', [8, 20], nKvdeq, null, ''],
  '1389542ec135e2eb4573ce28bea49351e564a60ccfa8e2bb08f4a8ebd538ce90': ['attn_mac', [45, 20, 20], nAttnmac, null, ''],
  '9ed8d46b4d0e17574f0f0348efcef154da94ae498bc1711728d54c85c843145b': ['score', [45], nScore, null, ''],
  '0c00fd0668b3a29de8e69df8d011f8ff8dcbc8225fcc48d4043a1a2a418e48f1': ['smax', [32, 32], nSmax, null, ''],
  '0db466a487dcaec9d9d81a982f47f7c3c2feb1e6db7780473a1930fdfa13d2f3': ['exp', [32, 32], nExp, dExp, '最大值 ≥ 分数'],
  '2b236589a9396c104856a6fc2e03ecfa2df530efc150dc69009490bab2c61bb1': ['den_acc', [22, 17], nDenacc, null, ''],
  '9c6561df8ca791d7f1e314da98b1ecec684b126d411070a1c1f67e78e717a42d': ['red_mac', [42, 17, 20], nRedmac, null, ''],
  '0c97bf5ed1585d5fa77eaaf8d060ebd8b5a0122379b7178a2deb41e2116eb3c3': ['resid', [20, 20], nResid, null, ''],
  cb4f89df8bd696295d202567c0968620a07c9914abecc69e14e9266d2804b1df: ['head_mac', [22, 8, 8], nHeadmac, null, ''],
  a7d02bfc2dd7dfa50b03dddb8a538b8c2620086c63547058f9f84ddd4268f124: ['serial_div', [64, 25], nDiv, dDiv, '除数 ≥ 1'],
  '289c2d58fe80cc42b366fc882de87e451df5d698efa91a1f405fe6f54c86d7eb': ['serial_mul', [64, 64], nMul, null, ''],
  '84b640439c1bd19807078f4dad67b5482ecd79c0af9012dc21ce2c0e305b78f0': ['serial_sqrt', [48], nSqrt, null, ''],
  bdca22014da2ded2b5b2aded03e7aadcce2f0baca2ea53cd5f9413b0f456c28a: ['add64_carry', [64, 64, 1], nAdd64, null, ''],
};

export const EXP_SHA = '0db466a487dcaec9d9d81a982f47f7c3c2feb1e6db7780473a1930fdfa13d2f3';
function rng32(seed) { let s = seed >>> 0 || 1; return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s; }; }

// ---------------------------------------------------------------- module fast path: the bit-plane dot product
// The recommended way (SPEC.md section 10) to write the dot product of 32*s pairs of signed 8-bit numbers with the
// 32-way ternary dot leaf: three modules. s is the only parameter. A module is recognised only if it equals this
// field for field (which is byte for byte: the parser has already required every reserved field to be zero).
export const DOT_SHA = 'b1507f55d3bd80bbc55f9e06dc656d81e049138827c97ec7fe640d7bfa2ce0b7', ADD_SHA = 'bdca22014da2ded2b5b2aded03e7aadcce2f0baca2ea53cd5f9413b0f456c28a';
function planeTemplate(s, dot, add, plane, planen) {
  const P = (src, off, width, stride = 0, init = 0) => ({ src, init, off, stride, width }), Z = w => P(SRC_Z, 0, w), cb = 256 * s, out = [];
  const R = (kind, target, rep, ports, flags = 0) => ({ kind, flags, tri: 0, target, rep, ports });
  for (const neg of [false, true]) {
    const pick = P(SRC_IN, cb, 1, 8);
    out.push({ nIn: 2 * cb - 7, nOut: 32, recs: [
      R(K_WIRE, 0, 32 * s, neg ? [Z(1), pick] : [pick, Z(1)]),
      R(K_LEAF, dot, s, [P(SRC_IN, 0, 256, 256), P(0, 0, 64, 64)]),
      R(K_LEAF, add, s, [P(SRC_PREV, 0, 32, 0, SRC_Z), Z(32), P(1, 0, 32, 32), Z(32), Z(1)], F_LAST),
      R(K_WIRE, 0, 1, [P(2, 0, 32)])] });
  }
  out.push({ nIn: 2 * cb, nOut: 32, recs: [
    R(K_MOD, plane, 7, [P(SRC_IN, 0, cb), P(SRC_IN, cb, cb - 7, 1)]),
    R(K_MOD, planen, 1, [P(SRC_IN, 0, cb), P(SRC_IN, cb + 7, cb - 7)]),
    R(K_WIRE, 0, 1, [6, 5, 4, 3, 2, 1, 0].map(k => P(0, 32 * k, 32))),
    R(K_LEAF, add, 7, [Z(1), P(SRC_PREV, 0, 31, 0, 1), Z(32), P(2, 0, 32, 32), Z(32), Z(1)], F_LAST),
    R(K_WIRE, 0, 1, [P(3, 0, 32)])] });
  return out;
}
function sameModule(m, t) {
  if (m.nIn !== t.nIn || m.nOut !== t.nOut || m.recs.length !== t.recs.length) return false;
  for (let i = 0; i < m.recs.length; i++) {
    const a = m.recs[i], b = t.recs[i];
    if (a.kind !== b.kind || a.flags !== b.flags || a.tri !== b.tri || a.target !== b.target || a.rep !== b.rep || a.ports.length !== b.ports.length) return false;
    for (let j = 0; j < a.ports.length; j++) { const p = a.ports[j], q = b.ports[j]; if (p.src !== q.src || p.init !== q.init || p.off !== q.off || p.stride !== q.stride || p.width !== q.width) return false; }
  }
  return true;
}
export function recognisePlanes(st) {
  const sha = st.leaves.map(lf => lf.shaHex), dot = sha.indexOf(DOT_SHA), add = sha.indexOf(ADD_SHA), found = new Map();
  if (dot < 0 || add < 0) return found;
  st.modules.forEach((m, mi) => {
    if (!m.nIn || m.nIn % 512 || m.nOut !== 32 || m.recs.length !== 5) return;
    const a = m.recs[0], b = m.recs[1];
    if (a.kind !== K_MOD || b.kind !== K_MOD || a.target >= mi || b.target >= mi) return;
    const s = m.nIn / 512, t = planeTemplate(s, dot, add, a.target, b.target);
    if (sameModule(st.modules[a.target], t[0]) && sameModule(st.modules[b.target], t[1]) && sameModule(m, t[2])) found.set(mi, s);
  });
  return found;
}
// ip: 32*s signed 8-bit codes then 32*s signed 8-bit weights; op: the low 32 bits of their integer dot product
function nativePlaneDot(ip, op, s) {
  const n = 32 * s, wp = ip + 8 * n; let d = 0;
  for (let j = 0; j < n; j++) d += gs(ip + 8 * j, 8) * gs(wp + 8 * j, 8);   // |d| <= n * 128 * 128, exact
  put(op, 32, d | 0);
}

// ---------------------------------------------------------------- the interpreter
export class Executor {
  constructor(segs, st) {
    this.st = st; this.mode = 'gate'; this.calls = 0; this.nativeOk = new Set();
    this.onProgress = null; this.trail = [null, null]; this.lastCalls = 0;   // progress reporting only
    this.nets = st.leaves.map(lf => parseNet(segs.N.subarray(lf.nOff, lf.nOff + lf.nLen), lf));
    this.ctx = st.leaves.map(() => ({}));
    this.native = st.leaves.map(lf => NATIVE[lf.shaHex] || null);
    this.fixedBits = 8 * (segs.W.length + segs.T.length);
    const bytes = new Uint8Array(Math.ceil(this.fixedBits / 32) * 4); bytes.set(segs.W); bytes.set(segs.T, segs.W.length);
    this.fixed = new Uint32Array(bytes.length / 4);
    const dv = new DataView(bytes.buffer); for (let i = 0; i < this.fixed.length; i++) this.fixed[i] = dv.getUint32(4 * i, true);
    this.need = [];
    for (const m of st.modules) {
      const s = new Set();
      for (const r of m.recs) { if (r.tri) s.add(r.tri); if (r.kind === K_MOD) for (const k of this.need[r.target]) if (k > 1) s.add(k - 1); }
      this.need.push(s);
    }
    this.one = [0], this.oneOut = [0];
    this.fastmods = new Map(); this.fastCalls = 0; this.fastChecked = {};
  }
  // Replace every module recognised as the bit-plane dot product (recognisePlanes) by the native integer dot
  // product, after nCheck random and 16 boundary inputs per module gave the same bits as the module computed
  // record by record. Without this call nothing is replaced (the reference path).
  enableFast(nCheck = 256, testFlip = 0) {   // testFlip: negative control only (pretend the native routine is wrong by these bits)
    const found = recognisePlanes(this.st), rnd = rng32(977);
    this.fastmods = new Map();
    for (const [mi, s] of found) {
      const w = 512 * s, mark = SP; let n = 0;
      const one = fillIn => { const ip = alloc(w), a = alloc(32); fillIn(ip); const r = this.module(mi, ip, []); nativePlaneDot(ip, a, s); n++; if (get(r.pos, 32) !== ((get(a, 32) ^ testFlip) >>> 0)) throw new Reject('位平面点积快路自检', '模块 ' + mi + ' 的本机点积和照记录算的不同'); SP = mark; };
      for (let k = 0; k < nCheck; k++) one(ip => { for (let j = 0; j < 64 * s; j++) { let v = rnd() & 255; if (k % 4 === 1) v = (rnd() & 1) ? 127 : 129; else if (k % 4 !== 2 && v === 128) v = 127; put(ip + 8 * j, 8, v); } });
      for (const a of [127, 129, 128, 0]) for (const b of [127, 129, 128, 0]) one(ip => { for (let j = 0; j < 32 * s; j++) { put(ip + 8 * j, 8, a); put(ip + 256 * s + 8 * j, 8, b); } });
      this.fastChecked[mi] = n;
    }
    this.fastmods = found;
    return found;
  }

  // Compare the native routine of leaf li with its netlist on n inputs (random, random bit length, boundaries;
  // inputs outside the routine's domain are skipped and counted). Returns {samples, skipped, mismatches}.
  checkLeaf(li, n, seed) {
    const lf = this.st.leaves[li], nat = this.native[li];
    if (!nat) return { samples: 0, skipped: 0, mismatches: -1 };
    const [name, widths, fn, dom] = nat, rnd = rng32(seed + 977 * li), mark = SP;
    if (widths.reduce((a, b) => a + b, 0) !== lf.inW) throw new Reject('叶子例程和叶子表的输入位数不符', name);
    if (name === 'exp' && !this.ctx[li].table) this.buildTable(li);
    let samples = 0, skipped = 0, mismatches = 0, made = 0;
    while (made < n) {
      const ins = [], gout = [], nout = [];
      for (let l = 0; l < 32 && made < n; l++, made++) {
        const ip = alloc(lf.inW); let off = 0;
        const style = made % 4;
        for (const w of widths) {
          for (let b = 0; b < w; b += 32) {
            const k = Math.min(32, w - b); let v = rnd();
            if (style === 1) { const len = rnd() % (w + 1); v = b >= len ? 0 : (len - b >= 32 ? v : v & ((2 ** (len - b)) - 1)); }
            else if (style === 2) { const c = rnd() % 6; v = c === 0 ? 0 : c === 1 ? 0xFFFFFFFF : c === 2 ? (b === 0 ? 1 : 0) : c === 3 ? (b + 32 >= w ? (2 ** (k - 1)) >>> 0 : 0) : c === 4 ? (b + 32 >= w ? ((2 ** (k - 1)) - 1) >>> 0 : 0xFFFFFFFF) : v; }
            else if (style === 3 && dom) { v = v >>> (rnd() % 32); }
            put(ip + off + b, k, v);
          }
          off += w;
        }
        if (style === 3 && name === 'a8_q') { const m = Math.max(1, get(ip + 20, 20)); put(ip + 20, 20, m); put(ip, 20, (rnd() % (2 * m + 1)) - m); }
        if (style === 3 && name === 'exp') { const mx = gs(ip, 32), d = rnd() % 70000; put(ip + 32, 32, Math.max(-2147483648, mx - d)); }
        if (dom && !dom(ip)) { skipped++; continue; }
        ins.push(ip); gout.push(alloc(lf.outW)); nout.push(alloc(lf.outW));
      }
      if (!ins.length) continue;
      gateEval(this.nets[li], lf, ins, gout);
      for (let l = 0; l < ins.length; l++) {
        fn(ins[l], nout[l], this.ctx[li]); samples++;
        let same = true; for (let j = 0; j < lf.outW; j += 32) { const k = Math.min(32, lf.outW - j); if (get(gout[l] + j, k) !== get(nout[l] + j, k)) same = false; }
        if (!same) mismatches++;
      }
      SP = mark;
    }
    SP = mark;
    if (mismatches === 0 && samples > 0) this.nativeOk.add(li); else this.nativeOk.delete(li);
    return { name, samples, skipped, mismatches };
  }
  // The exp leaf has its table folded into its gates; read it out of the netlist once instead of carrying it.
  buildTable(li) {
    const lf = this.st.leaves[li], t = new Array(1025), mark = SP;
    for (let j0 = 0; j0 < 1025; j0 += 32) {
      const ins = [], outs = [];
      for (let j = j0; j < Math.min(1025, j0 + 32); j++) { const ip = alloc(64); put(ip, 32, 64 * j); put(ip + 32, 32, 0); ins.push(ip); outs.push(alloc(17)); }
      gateEval(this.nets[li], lf, ins, outs);
      for (let l = 0; l < ins.length; l++) t[j0 + l] = get(outs[l], 17);
    }
    SP = mark; this.ctx[li].table = t;
  }
  // The weight the exp leaf gives for a non-negative difference (leaf inputs max = delta, score = 0). The file has
  // no table of its own for these values; a host rule that needs them (sampling) asks the leaf.
  expWeight(delta) {
    if (this.expLeaf === undefined) { const k = this.st.leaves.map(lf => lf.shaHex).indexOf(EXP_SHA); this.expLeaf = k; }
    const li = this.expLeaf;
    if (li < 0) throw new Reject('exp 叶子', '文件里没有这颗叶子');
    if (!Number.isInteger(delta) || delta < 0 || delta > 0x7FFFFFFF) throw new Reject('exp 叶子', '自变量超出叶子的定义域');
    const mark = SP, ip = alloc(64), op = alloc(17);
    put(ip, 32, delta); put(ip + 32, 32, 0);
    if (this.mode === 'gate') { gateEval(this.nets[li], this.st.leaves[li], [ip], [op]); } else this.native[li][2](ip, op, this.ctx[li]);
    const w = get(op, 17); SP = mark;
    return w;
  }
  setMode(mode) {
    if (mode === 'native') for (let i = 0; i < this.st.leaves.length; i++) if (!this.nativeOk.has(i)) throw new Reject('快路没有通过自检', '第 ' + i + ' 颗叶子');
    this.mode = mode;
  }
  leaf(li, ip, op) {
    if ((++this.calls & 4095) === 0 && this.onProgress) this.onProgress(this.calls, this.lastCalls, this.trail);
    if (this.mode === 'gate') { this.one[0] = ip; this.oneOut[0] = op; gateEval(this.nets[li], this.st.leaves[li], this.one, this.oneOut); }
    else this.native[li][2](ip, op, this.ctx[li]);
  }
  // input: Uint8Array of runtime input bits packed LSB first. Returns a function reading output bits.
  run(inputBytes) {
    const st = this.st; SP = FLOOR; this.calls = 0;
    const top = alloc(st.modules[st.top].nIn);
    fill(top, st.inBits, 0);
    for (let i = 0; i < inputBytes.length; i++) put(top + 8 * i, Math.min(8, st.inBits - 8 * i), inputBytes[i]);
    const f = alloc(this.fixedBits); M.set(this.fixed, f >>> 5); copy(f, top + st.inBits, this.fixedBits);
    const r = this.module(st.top, top, []);
    this.lastCalls = this.calls;
    return { bits: (off, w) => get(r.pos + off, w), sbits: (off, w) => gs(r.pos + off, w), width: r.width };
  }
  module(mi, inPos, stack) {
    const m = this.st.modules[mi], recPos = [], recW = [], depth = stack.length;
    for (let ri = 0; ri < m.recs.length; ri++) {
      const rec = m.recs[ri];
      let reps = rec.rep;
      if (rec.tri) {
        if (rec.tri > stack.length || stack[stack.length - rec.tri] < 0) throw new Reject('tri 记录', '那一层没有序号');
        reps = stack[stack.length - rec.tri] + 1;
        if (reps > rec.rep) throw new Reject('tri 记录', '序号超过上限');
      }
      const kind = rec.kind, st = this.st;
      const ow = kind === K_LEAF ? st.leaves[rec.target].outW : kind === K_MOD ? st.modules[rec.target].nOut : kind === K_LOOK ? rec.target : rec.inW;
      if (kind === K_LEAF && rec.inW !== st.leaves[rec.target].inW) throw new Reject('叶子记录', '各口位宽之和不等于叶子输入');
      if (kind === K_MOD && rec.inW !== st.modules[rec.target].nIn) throw new Reject('模块记录', '各口位宽之和不等于模块输入');
      const last = rec.flags & F_LAST, total = last ? ow : reps * ow, out = alloc(total);
      const loopIdx = kind === K_MOD && this.need[rec.target].has(1);
      for (let r = 0; r < reps; r++) {
        if (depth < 2) this.trail[depth] = [ri, m.recs.length, r, reps];   // where the walk is, for the progress line
        const mark = SP, dst = last ? alloc(ow) : out + r * ow;
        if (kind === K_LOOK) {
          const pi = rec.ports[0], pt = rec.ports[1];
          const index = get(this.src(pi, r, inPos, m, recPos, recW), pi.width);
          if (pt.width % ow) throw new Reject('查表', '表宽不是每项位数的整数倍');
          if (index >= pt.width / ow) throw new Reject('查表', '下标出界');
          if (pt.src === SRC_Z || pt.src === SRC_O) throw new Reject('查表', '表必须是线');
          copy(this.src(pt, r, inPos, m, recPos, recW) + index * ow, dst, ow);
        } else {
          const ip = kind === K_WIRE ? dst : alloc(rec.inW); let o = 0;
          for (const p of rec.ports) {
            if (p.src === SRC_Z) fill(ip + o, p.width, 0);
            else if (p.src === SRC_O) fill(ip + o, p.width, 1);
            else if (p.src === SRC_PREV) {
              if (r === 0) { if (p.init === SRC_Z) fill(ip + o, p.width, 0); else if (p.init === SRC_O) fill(ip + o, p.width, 1); else copy(this.srcAt(p.init, p.stride, p.width, inPos, m, recPos, recW), ip + o, p.width); }
              else { if (p.off + p.width > ow) throw new Reject('PREV 口', '读出界'); copy((last ? out : out + (r - 1) * ow) + p.off, ip + o, p.width); }
            } else copy(this.src(p, r, inPos, m, recPos, recW), ip + o, p.width);
            o += p.width;
          }
          if (kind === K_LEAF) this.leaf(rec.target, ip, dst);
          else if (kind === K_MOD) {
            const fs = this.fastmods.get(rec.target);
            if (fs !== undefined) { this.fastCalls++; nativePlaneDot(ip, dst, fs); }
            else {
              stack.push(loopIdx ? r : -1);
              const res = this.module(rec.target, ip, stack);
              stack.pop();
              copy(res.pos, dst, ow);
            }
          }
        }
        if (last) copy(dst, out, ow);
        SP = mark;
      }
      recPos.push(out); recW.push(total);
    }
    const n = recPos.length - 1;
    if (recW[n] !== m.nOut) throw new Reject('模块输出宽度');
    return { pos: recPos[n], width: recW[n] };
  }
  src(p, r, inPos, m, recPos, recW) { return this.srcAt(p.src, p.off + p.stride * r, p.width, inPos, m, recPos, recW); }
  srcAt(src, off, width, inPos, m, recPos, recW) {
    const base = src === SRC_IN ? inPos : recPos[src], w = src === SRC_IN ? m.nIn : recW[src];
    if (off + width > w) throw new Reject('口', '读到来源末尾之外');
    return base + off;
  }
}

// Runtime input / output according to the io entry of the description segment.
export function packInput(desc, values) {
  const io = desc.io;
  if (!values.length || values.length > io.positions) throw new Reject('输入长度');
  const w = io.item_bits, b = new Uint8Array(Math.ceil(io.positions * w / 8));
  if (!Number.isInteger(w) || w < 1 || w > 16) throw new Reject('输入项位宽');
  for (let i = 0; i < io.positions; i++) {
    const v = i < values.length ? values[i] : io.pad;
    if (!Number.isInteger(v) || v < 0 || v >= 2 ** w) throw new Reject('输入值');
    for (let k = 0; k < w; k++) if ((v >> k) & 1) b[(i * w + k) >> 3] |= 1 << ((i * w + k) & 7);
  }
  return b;
}
export function readRow(desc, res, row) {
  const io = desc.io, out = new Int32Array(io.out_cols), base = row * io.out_cols * io.out_bits;
  for (let c = 0; c < io.out_cols; c++) out[c] = io.out_signed ? res.sbits(base + c * io.out_bits, io.out_bits) : res.bits(base + c * io.out_bits, io.out_bits);
  return out;
}
export async function rowsSha256(rows) {
  const n = rows.reduce((a, r) => a + r.length, 0), b = new Uint8Array(4 * n), dv = new DataView(b.buffer); let p = 0;
  for (const r of rows) for (const v of r) { dv.setInt32(p, v, true); p += 4; }
  return hex(await sha256(b));
}
