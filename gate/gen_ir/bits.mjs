// gatesim R7 生成器：线号行（与 R60 layer.py 的 Bits 同义，只携带线号，不携带值——追踪不求值）。
// 一个 Bits = 若干行 × n 列；每行是下面三种之一（语义上都等价于一行 int64 线号）：
//   L：常量行，线号 = 位值 0/1（literal 的 ids 就是位值）
//   C：某次调用 k 的第 j 个输出的若干实例，线号 = base_k + c·ng_k + (ng_k − nout_k + j)，c 取自 cols（null = 0..n−1）
//   G：一般线号（输入区 / 状态区 / 混合来源），逐元素存
// stride0：整行是同一个线号（numpy broadcast_to 的视图），只存一个元素。
export class Row {
  constructor(t, n, o) { this.t = t; this.n = n; Object.assign(this, o); }
  static lit(bits, n = bits.length) { return new Row('L', n, { a: bits, s0: bits.length === 1 && n !== 1 ? true : bits.length === 1 && n === 1 ? false : false }); }
  static call(k, j, n, cols = null, c0 = -1) { return new Row('C', n, { k, j, cols, c0 }); }
  static gen(ids, n = ids.length) { return new Row('G', n, { a: ids, s0: ids.length === 1 && n !== 1 }); }
  // 第 i 个元素（C 行需要调用表 E 才能算线号；这里只给 (kind, 值)）
  litAt(i) { return this.a.length === 1 ? this.a[0] : this.a[i]; }
  colAt(i) { return this.c0 >= 0 ? this.c0 : this.cols ? this.cols[i] : i; }
  genAt(i) { return this.a.length === 1 ? this.a[0] : this.a[i]; }
  bcast(n) {
    if (this.n === n) return this;
    if (this.n !== 1) throw new Error(`broadcast ${this.n} -> ${n}`);
    if (this.t === 'L') return new Row('L', n, { a: this.a.subarray(0, 1) });
    if (this.t === 'C') return Row.call(this.k, this.j, n, null, this.colAt(0));
    return new Row('G', n, { a: this.a.subarray(0, 1) });
  }
  sub(idx) {                                            // 列选取（idx: Int32Array / 数组）
    const m = idx.length;
    if (this.t === 'C') {
      if (this.c0 >= 0) return Row.call(this.k, this.j, m, null, this.c0);
      const c = new Int32Array(m); for (let i = 0; i < m; i++) c[i] = this.cols ? this.cols[idx[i]] : idx[i];
      return Row.call(this.k, this.j, m, c);
    }
    if (this.a.length === 1 && this.n !== 1) return new Row(this.t, m, { a: this.a });
    const a = new (this.a.constructor)(m); for (let i = 0; i < m; i++) a[i] = this.a[idx[i]];
    return new Row(this.t, m, { a });
  }
}
// 全部行统一成 G 行的线号数组（需要调用表 E）
export function rowIds(E, r) {
  const n = r.n, out = new Float64Array(n);
  if (r.t === 'L') { for (let i = 0; i < n; i++) out[i] = r.litAt(i); return out; }
  if (r.t === 'G') { for (let i = 0; i < n; i++) out[i] = r.genAt(i); return out; }
  const b = E.bases[r.k], ng = E.ng[r.k], off = ng - E.nout[r.k] + r.j;
  for (let i = 0; i < n; i++) out[i] = b + r.colAt(i) * ng + off;
  return out;
}
export class Bits {
  constructor(rows, n) { this.rows = rows; this.n = n; }
  get h() { return this.rows.length; }
  bit(i) { return new Bits([this.rows[i]], this.n); }
  low(k) { return new Bits(this.rows.slice(0, k), this.n); }
  rowsRange(a, b) { return new Bits(this.rows.slice(a, b), this.n); }
  cols(idx) {
    if (typeof idx === 'number') idx = [idx];
    return new Bits(this.rows.map(r => r.sub(idx)), idx.length);
  }
  broadcast(n) { if (this.n !== 1 && this.n !== n) throw new Error('broadcast'); return this.n === n ? this : new Bits(this.rows.map(r => r.bcast(n)), n); }
}
export const range = (a, b) => { const r = new Int32Array(b - a); for (let i = 0; i < r.length; i++) r[i] = a + i; return r; };
// literal(words, width)：第 b 行 = 各字的第 b 位（字可达 2^53，按数值取位）
export function literal(words, width) {
  const w = typeof words === 'number' ? [words] : words, n = w.length, rows = [];
  for (let b = 0; b < width; b++) {
    const a = new Uint8Array(n), p = 2 ** b;
    for (let i = 0; i < n; i++) a[i] = Math.floor(w[i] / p) % 2;
    rows.push(new Row('L', n, { a }));
  }
  return new Bits(rows, n);
}
export function join(xs, axis = 0) {
  if (axis === 0) { const n = Math.max(...xs.map(x => x.n)); return new Bits(xs.flatMap(x => x.broadcast(n).rows), n); }
  throw new Error('join axis=1 needs engine (use E.join1)');
}
export const unbf = x => join([literal(0, 16), x.low(16)]);
export const signed8 = x => join([x.low(8), ...Array(24).fill(x.bit(7))]);
// numpy 辅助
export const tile = (a, r) => { const o = new Int32Array(a.length * r); for (let t = 0; t < r; t++) o.set(a, t * a.length); return o; };
export const repeat = (a, r) => { const o = new Int32Array(a.length * r); for (let i = 0; i < a.length; i++) o.fill(a[i], i * r, i * r + r); return o; };
export const cat = (...as) => { const o = new Int32Array(as.reduce((s, a) => s + a.length, 0)); let p = 0; for (const a of as) { o.set(a, p); p += a.length; } return o; };
export const map = (a, f) => { const o = new Int32Array(a.length); for (let i = 0; i < a.length; i++) o[i] = f(a[i], i); return o; };
const f32 = new Float32Array(1), u32 = new Uint32Array(f32.buffer);
export const f32bits = x => { f32[0] = x; return u32[0]; };
