// gatesim R7 生成器：R60 layer.py 的 Layer.forward 逐行移植（只读参照；追踪不求值）。输入只有本层权重编码：7 个 group32 codec 与 2 个 norm。
// R9：容量参数 C（128 / 512）。C=512 逐行照 R63 layer.py（LAYER-DELTA.patch）：KV 512 槽、10 位计数、eq10、C512 控制模板（IR 中名 control_c512）、
// RoPE 9 位地址 = 4 页 rope_rom0..3 + mux32 页选择、qk/softmax/av 长度 512。C=128 与 R7/R8 逐字节相同。
import { Row, Bits, literal, join, unbf, signed8, range, tile, repeat, cat, map, f32bits } from './bits.mjs';
import { decode } from '../exec/gen.mjs';
const ESC_K = 4, ESC_CELL = 'racc4';   // 例外串行链每步几个（cells/racc.py；racc8 实测更慢）
const PROJ = ['self_attn.q_proj', 'self_attn.k_proj', 'self_attn.v_proj', 'self_attn.o_proj', 'mlp.gate_proj', 'mlp.up_proj', 'mlp.down_proj'];
export const LAYER_NIN = 1536 * 16 + 2, KV_COUNT = 2 * 128 * 8 * 64, LAYER_NST = KV_COUNT * 16 + 10;
export const layerDims = (C = 128) => { const kv = 2 * C * 8 * 64, cb = C === 512 ? 10 : 8; return { kv, cb, nst: kv * 16 + cb + 2 }; };
const genRow = a => new Row('G', a.length, { a });
const zeros = n => new Float64Array(n);
// 单元网表对全部 2^nIn 个输入求值（位切片，每条线 2^nIn / 32 字；规则同 exec/gen.mjs：线 0 = 0、1 = 1、2.. = 输入、之后依次为门，
// NAND 引用线号 ≥ 自身读 0，输出 = 末 nOut 条线）。返回 Uint32Array：输出 o 的第 a 个地址位于字 o·W + (a >> 5) 的第 a & 31 位。
export function ropeTable(bin, nIn, nOut) {
  const { op, a, b, nGates } = decode(bin), base = 2 + nIn, nW = base + nGates, Wd = (1 << nIn) >>> 5, w = new Uint32Array(nW * Wd);
  w.fill(0xffffffff, Wd, 2 * Wd);
  for (let r = 0; r < nIn; r++) for (let ad = 0; ad < (1 << nIn); ad++) if ((ad >> r) & 1) w[(2 + r) * Wd + (ad >> 5)] |= 1 << (ad & 31);
  for (let i = 0; i < nGates; i++) { if (op[i] !== 0) throw new Error('ropeTable: LATCH'); const k = base + i, x = a[i] >= k ? 0 : a[i], y = b[i] >= k ? 0 : b[i];
    for (let q = 0; q < Wd; q++) w[k * Wd + q] = ~(w[x * Wd + q] & w[y * Wd + q]); }
  return w.slice((nW - nOut) * Wd, nW * Wd);
}
export function traceLayer(e, W, C = 128) {                      // W: { norms: {input_layernorm, post_attention_layernorm}, proj: {name: {shape, packed, scale, exc_index, exc_bits}} }
  if (C !== 128 && C !== 512) throw new Error('layer C must be 128 or 512');
  const { kv: KV_COUNT, cb: CB, nst: nstate } = layerDims(C), ninput = LAYER_NIN, S = 2 + ninput, CTL = C === 512 ? 'control_c512' : 'control';
  e.set_scope('control'); e.base = 2 + ninput + nstate;
  const bf = x => e.op('bf16', x).low(16);
  const nonfinite = x => e.reduce('or', e.op('nf', x.rowsRange(7, 15)));
  const trace = {}, mark = (n, x) => { trace[n] = x; return x; };
  // 输入、状态线号（与 R60 相同的线号命名空间）
  const x0 = new Bits([...Array(16).keys()].map(b => { const a = new Float64Array(1536); for (let i = 0; i < 1536; i++) a[i] = 2 + i * 16 + b; return genRow(a); }), 1536);
  const validb = new Bits([genRow(Float64Array.of(2 + 1536 * 16))], 1), resetb = new Bits([genRow(Float64Array.of(3 + 1536 * 16))], 1);
  // KV 状态按位平面存放（第 b 位平面 = 全部条目的第 b 位，连续）：每行是对齐整字，取数一次读一字；原先条目优先（c·16 + b）
  // 每行隔 16 位取一位，KV 写回的 mux16 取数占每层约 1.75 ms。只是锁存器的排列次序，功能不变（dIds 同步）。
  const oldkv = new Bits([...Array(16).keys()].map(b => { const a = new Float64Array(KV_COUNT); for (let c = 0; c < KV_COUNT; c++) a[c] = S + b * KV_COUNT + c; return genRow(a); }), KV_COUNT);
  const count = new Bits([...Array(CB).keys()].map(r => genRow(Float64Array.of(S + nstate - (CB + 2) + r))), 1);
  const olderr = new Bits([...Array(2).keys()].map(r => genRow(Float64Array.of(S + nstate - 2 + r))), 1);
  const control_in = join([count, validb, resetb, olderr, literal(0, 28 - CB)]);
  const initial = e.op(CTL, control_in, literal(0, 32));
  const st = { err0: literal(0, 1), err1: literal(0, 1) };
  e.set_scope('rope');
  // RoPE 表按位置查：原先是 rope_rom 单元（C=128 一页、C=512 四页，每页 1 个实例约 15.5 万门，只能单线程串行，每页约 0.29 ms）。
  // 改为：生成时按 rope_rom 网表（同一 NAND 规则）对全部地址求出常量表，再用 mux32 按计数的各位逐层二选一（C=128 七层、C=512 九层，
  // 每层一次宽调用）。选出的就是表中第 count mod C 项，与 rope_rom（C=512 时 rope_rom0..3 + bit7/bit8 选页）逐位相同。
  // 布局同前：第 r 行第 c 列 = 扁平第 c·32 + r 个输出。
  const pages = C === 128 ? ['rope_rom'] : ['rope_rom0', 'rope_rom1', 'rope_rom2', 'rope_rom3'], tabs = pages.map(n => ropeTable(W.cellBin(n), 7, 2048));
  const P = 128 * pages.length, lanes = P * 64, lit = [];
  for (let r = 0; r < 32; r++) { const a = new Uint8Array(lanes);
    for (let p = 0; p < P; p++) { const t = tabs[p >> 7], ad = p & 127; for (let c = 0; c < 64; c++) { const o = c * 32 + r; a[p * 64 + c] = (t[o * 4 + (ad >> 5)] >>> (ad & 31)) & 1; } }
    lit.push(new Row('L', lanes, { a })); }
  let rom = new Bits(lit, lanes);
  for (let lev = 0, n = P; n > 1; lev++, n /= 2) {
    const half = n / 2, pick = d => map(range(0, half * 64), j => (2 * Math.floor(j / 64) + d) * 64 + (j % 64));
    rom = e.select(count.bit(lev), rom.cols(pick(1)), rom.cols(pick(0)));
  }
  const norm = (x, name, label) => {
    e.set_scope(label); const xf = unbf(x), squared = e.op('mul', xf, xf); let s = literal(0, 32);
    for (let j = 0; j < x.n; j++) s = e.op('add_nn', s, squared.cols(j));   // ≡ add：链上两输入符号位恒 0（cells/add_nn.json）
    const v = e.op('add', e.op('div', s, literal(f32bits(x.n), 32)).low(32), literal(0x3727c5ac, 32));
    const u = e.op('div', literal(0x3f800000, 32), e.op('sqrt', v).low(32)).low(32);
    const h = bf(e.op('mul', xf, u)), wv = W.norms[name], gw = new Float64Array(wv.length); for (let i = 0; i < wv.length; i++) gw[i] = wv[i] * 65536;
    return mark(label, bf(e.op('mul', unbf(h), literal(gw, 32))));
  };
  // 同一输入的若干投影一起生成（q/k/v、gate/up）：激活量化与 tern4 表只算一次；每组 g 把各投影的行拼成一次 sum8 + facc；
  // 例外项按「每行第 r 个」分轮批量 facce。每一行上的运算与次序和逐投影生成完全相同（行之间互不相干），err 位为同一组 OR，取值不变。
  const projectMany = (x, specs) => {
    e.set_scope(specs[0][1]);
    const bad = nonfinite(x); st.err0 = e.op('or', st.err0, bad);
    const mag = join([literal(0, 16), x.low(15), literal(0, 1)]);
    const maximum = e.op('umax', e.reduce('umax', mag), literal(0x3727c5ac, 32));
    const sx = e.op('div', literal(0x42fe0000, 32), maximum).low(32);
    const q = e.op('clip', e.op('f2i', e.op('mul', unbf(x), sx))).low(8);
    const k = W.proj[specs[0][0]].shape[1], G = k / 32;
    // 定点累加（≡ fp32 逐组 add，cells/facc.py、prove_facc.py）：每行网格 u = 2^(lo−134)，lo = 行内组缩放与例外缩放的最小 bf16 指数域；
    // accum 以整数 S 表示（S·u 即 fp32 值），facc / facce 逐步做 RNE24，最后 fix2f 转回 fp32。前提逐行检查：缩放皆为正规 bf16、指数跨度 ≤ 5、Σ|x| < 2^29。
    const ebits = b => (b >> 7) & 255, parts = [];
    let N = 0;
    for (const [key, label] of specs) {
      const P = W.proj[key], n = P.shape[0]; if (P.shape[1] !== k) throw new Error(`${key}: 输入宽度不同，不能合并`);
      const lo = new Int32Array(n).fill(999), bound = new Float64Array(n);
      const chk = (b, pos) => { const v = ebits(b); if (v === 0 || v === 255 || (pos && b >> 15)) throw new Error(`${key}: 缩放不是正规数 ${b}`); return v; };
      for (let r = 0; r < n; r++) for (let g = 0; g < G; g++) lo[r] = Math.min(lo[r], chk(P.scale[r * G + g], true));
      for (let t = 0; t < P.exc_index.length; t++) { const r = Math.floor(P.exc_index[t] / k); lo[r] = Math.min(lo[r], chk(P.exc_bits[t], false)); }
      const shOf = (r, b) => { const v = ebits(b) - lo[r]; if (v > 5) throw new Error(`${key}: 行 ${r} 指数跨度 ${v} > 5`); return v; };
      for (let r = 0; r < n; r++) for (let g = 0; g < G; g++) { const b = P.scale[r * G + g]; bound[r] += 4096 * (128 | (b & 127)) * 2 ** shOf(r, b); }
      for (let t = 0; t < P.exc_index.length; t++) { const r = Math.floor(P.exc_index[t] / k), b = P.exc_bits[t]; bound[r] += 128 * (128 | (b & 127)) * 2 ** shOf(r, b); }
      for (let r = 0; r < n; r++) if (bound[r] >= 2 ** 29) throw new Error(`${key}: 行 ${r} Σ|x| 上界 ${bound[r]} ≥ 2^29`);
      // escape 按 exceptions 数组原序、按组筛选
      const escByG = Array.from({ length: G }, () => []);
      for (let t = 0; t < P.exc_index.length; t++) escByG[Math.floor((P.exc_index[t] % k) / 32)].push(t);
      parts.push({ key, label, P, n, base: N, lo, shOf, escByG,
        code: (r, c) => { const i = r * k + c; return (P.packed[i >> 2] >> (2 * (i & 3))) & 3; } });
      N += n;
    }
    // 查表法三值点积（≡ ternary32，整数加法精确、|d| ≤ 4096）：每 4 个激活一组，tern4 算出 81 种 ±/0 组合之和（车道 h*81 + c，c 的三进制位 0→0、1→+1、2→−1），
    // 各行按常数权重码取 8 个表项（逐字字节偏移收集，见 exec/layer_pack.mjs 类别 X），sum8 一次求和。例外码 3 记 0（与 ternary32 相同，例外另加）。
    const G4 = k / 4, NL = G4 * 81, P3 = [1, 3, 9, 27], digit = c => (c === 1 ? 1 : c === 2 ? 2 : 0);
    const lutQ = join([0, 1, 2, 3].map(i => q.cols(map(range(0, NL), l => Math.floor(l / 81) * 4 + i))));
    const lutC = []; for (let i = 0; i < 4; i++) for (let b = 0; b < 2; b++) { const a = new Uint8Array(NL); for (let l = 0; l < NL; l++) a[l] = (Math.floor((l % 81) / P3[i]) % 3 >> b) & 1; lutC.push(new Row('L', NL, { a })); }
    const lut = e.op('tern4', lutQ, new Bits(lutC, NL));
    // 例外乘积与累加值无关：全部例外一次 escmul 宽调用算出 X（24 位），串行链上只剩 racc4（加法 + RNE24），见 cells/racc.py
    const escAll = []; for (const S of parts) for (let t = 0; t < S.P.exc_index.length; t++) { const idx = S.P.exc_index[t], b = S.P.exc_bits[t], r = Math.floor(idx / k);
      escAll.push({ S, t, r, col: idx % k, m: b & 127, sh: S.shOf(r, b), neg: b >> 15 }); }
    const laneOf = new Map(); escAll.forEach((z, i) => laneOf.set(z.S.key + ':' + z.t, i));
    e.set_scope(specs[0][1] + '.escape');
    const Xall = escAll.length ? e.op('escmul', q.cols(escAll.map(z => z.col)), literal(escAll.map(z => z.m), 7), literal(escAll.map(z => z.sh), 3), literal(escAll.map(z => z.neg), 1)) : null;
    e.set_scope(specs[0][1]);
    let accum = literal(zeros(N), 32);
    for (let g = 0; g < G; g++) {
      const sel = []; for (let j = 0; j < 8; j++) { const idx = new Int32Array(N);
        for (const S of parts) for (let r = 0; r < S.n; r++) { let c = 0; for (let i = 0; i < 4; i++) c += digit(S.code(r, g * 32 + j * 4 + i)) * P3[i]; idx[S.base + r] = (g * 8 + j) * 81 + c; }
        sel.push(lut.cols(idx)); }
      const d16 = e.op('sum8', ...sel);   // sum8 ≡ 7 次 iadd16（表项 |v| ≤ 512，按 11 位二补码求和），|d| ≤ 4096
      const mm = new Float64Array(N), sh = new Float64Array(N);
      for (const S of parts) for (let r = 0; r < S.n; r++) { const b = S.P.scale[r * G + g]; mm[S.base + r] = b & 127; sh[S.base + r] = S.shOf(r, b); }
      accum = e.op('facc', accum, d16, literal(mm, 7), literal(sh, 3));   // ≡ add(accum, scale_exact(d, s))
      // 本组例外（≡ 逐个 add(accum, mul(i2f(q), exc))，按原序）：同一行的例外按原序每 4 个一段，一次 racc4（≡ facce4，cells/racc.py）；
      // 不足 4 个补 X = 0（恒等）。不同行互不相干，单车道调用由引擎按层级并组、进 sege 段内核。
      const byRow = new Map();
      for (const S of parts) for (const t of S.escByG[g]) { const row = S.base + Math.floor(S.P.exc_index[t] / k);
        if (!byRow.has(row)) byRow.set(row, []); byRow.get(row).push(laneOf.get(S.key + ':' + t)); }
      if (byRow.size) {
        e.set_scope(specs[0][1] + '.escape');
        for (const [row, lanes] of byRow) for (let c0 = 0; c0 < lanes.length; c0 += ESC_K) {
          const args = [accum.cols(row)];
          for (let j = 0; j < ESC_K; j++) args.push(c0 + j < lanes.length ? Xall.cols(lanes[c0 + j]) : literal(0, 24));
          accum = e.put(accum, [row], e.op(ESC_CELL, ...args));
        }
        e.set_scope(specs[0][1]);
      }
    }
    const kk = new Float64Array(N); for (const S of parts) for (let r = 0; r < S.n; r++) kk[S.base + r] = (S.lo[r] - 134) & 255;
    accum = e.op('fix2f', accum, literal(kk, 8));
    const out = bf(e.op('div', accum, sx).low(32)); st.err1 = e.op('or', st.err1, nonfinite(out));
    return parts.map(S => mark(S.label, out.cols(range(S.base, S.base + S.n))));
  };
  const rope = (x, heads) => {
    e.set_scope('rope'); const idx = range(0, heads * 64);
    const sine = rom.cols(map(idx, i => i % 32)), cosine = rom.cols(map(idx, i => 32 + i % 32));
    const other = x.cols(map(idx, i => Math.floor(i / 64) * 64 + (i + 32) % 64));
    const neg = Int32Array.from([...idx].filter(i => i % 64 < 32));
    const sign = e.put(other.bit(15), [...neg], e.op('not', other.bit(15).cols(neg)));
    const rotated = join([other.low(15), sign]);
    return bf(e.op('add', e.op('mul', unbf(x), cosine), e.op('mul', unbf(rotated), sine)));
  };
  let x = x0;
  const h = norm(x, 'input_layernorm', 'norm1');
  let [q, k, v] = projectMany(h, [['self_attn.q_proj', 'q'], ['self_attn.k_proj', 'k'], ['self_attn.v_proj', 'v']]);
  q = mark('q_rope', rope(q, 24)); k = mark('k_rope', rope(k, 8));
  e.set_scope('kv'); const slot = e.op('and', e.op(C === 512 ? 'eq10' : 'eq8', count, literal([...Array(C).keys()], CB)), initial.bit(CB + 2));
  const positions = tile(repeat(range(0, C), 512), 2);
  const neu = e.join1([k, v]).cols(cat(tile(range(0, 512), C), tile(range(512, 1024), C)));
  const provisional = e.select(slot.cols(positions), neu, oldkv);
  const kc = provisional.cols(range(0, C * 512)), vc = provisional.cols(range(C * 512, 2 * C * 512));
  mark('key_cache', kc); mark('value_cache', vc);
  e.set_scope('qk'); let s = literal(zeros(24 * C), 32);
  const heads = repeat(range(0, 24), C), pos = tile(range(0, C), 24);
  for (let d = 0; d < 64; d++) {
    const p = e.op('mul', unbf(q.cols(map(heads, hh => hh * 64 + d))), unbf(kc.cols(map(pos, (pp, i) => pp * 512 + Math.floor(heads[i] / 3) * 64 + d))));
    s = e.op('add', s, p);
  }
  let scores = bf(e.op('div', unbf(bf(s)), literal(0x41000000, 32)).low(32));
  const countf = e.op('i2f', join([count, literal(0, 32 - CB)]));
  const active = e.op('not', e.op('gt', literal([...Array(C).keys()].map(f32bits), 32), countf).low(1));
  scores = mark('qk', e.select(active.cols(pos), scores, literal(0xff80, 16)));
  e.set_scope('softmax');
  const h24 = range(0, 24);
  // 求最大值（≡ 自 −∞ 起串行 m ← gt(a_p, m) ? a_p : m）：bmax 是「最左最大、NaN 垫底」，满足结合律，改为按位置两两树形归约
  // （log2 C 次宽调用），最后 bmax(−∞, r) 还原串行初值。cells/bmax.py：非 NaN 的 x 上与 gt + mux 全部 2^32 对逐位相同。
  let cur = scores, len = C;
  while (len > 1) { const half = len / 2, at = d => map(range(0, 24 * half), j => Math.floor(j / half) * len + 2 * (j % half) + d);
    cur = e.op('bmax', cur.cols(at(0)), cur.cols(at(1))); len = half; }
  const m = unbf(e.op('bmax', literal(new Float64Array(24).fill(0xff80), 16), cur));
  let weights = e.op('exp', e.op('sub', unbf(scores), m.cols(heads)));
  weights = e.select(active.cols(pos), weights, literal(0, 32)); let total = literal(zeros(24), 32);
  // 未激活位置的权重是字面 +0，而 total 自 +0 起、只经 add 更新，永不为 −0、NaN 恒为规范值，故 add(total, +0) = total（cells/bmax.py verify
  // 对全部 2^32 个 t 核对），原先的 select(active_p, …, total) 可省。
  // 执行效率：先把权重重排成「位置优先、每位置占一个对齐整字」（车道 p·32 + i，i ≥ 24 的填充车道取车道 0，结果不用），
  // 每步输入成为对齐整字，128 步 add 可串进段内核一次派发（原先每步单独两次派发）。重排用 mux32(1, t, t)：
  // 选择位为常数 1 时 mux32 常数传播后输出线即 t 输入线（结构恒等）。各头的加法与次序不变。
  const tpos = map(range(0, C * 32), l => (l % 32 < 24 ? (l % 32) * C : 0) + (l % 32 < 24 ? Math.floor(l / 32) : 0));
  const wT = e.select(literal(1, 1), weights.cols(tpos), weights.cols(tpos));
  let tot32 = literal(zeros(32), 32);
  for (let p = 0; p < C; p++) tot32 = e.op('add', tot32, wT.cols(range(p * 32, p * 32 + 32)));
  total = tot32.cols(h24);
  weights = mark('softmax', bf(e.op('div', weights, total.cols(heads)).low(32)));
  e.set_scope('av'); let acc = literal(zeros(1536), 32);
  const hidx = map(range(0, 1536), i => Math.floor(i / 64)), didx = map(range(0, 1536), i => i % 64);
  for (let p = 0; p < C; p++) {
    const product = e.op('mul', unbf(weights.cols(map(hidx, hh => hh * C + p))), unbf(vc.cols(map(hidx, (hh, i) => p * 512 + Math.floor(hh / 3) * 64 + didx[i]))));
    acc = e.op('addsel', acc, product, active.cols(p));   // ≡ select(active_p, add(acc, product), acc)（cells/addsel.py），每位置少一个条目
  }
  let out = mark('av', bf(acc)); [out] = projectMany(out, [['self_attn.o_proj', 'o']]);
  e.set_scope('residual1'); let scaled = mark('attention_scaled', bf(e.op('mul', unbf(out), literal(0x3e46cdf7, 32))));
  x = mark('residual1', bf(e.op('add', unbf(x), unbf(scaled))));
  const h2 = norm(x, 'post_attention_layernorm', 'norm2');
  const [gate, up] = projectMany(h2, [['mlp.gate_proj', 'gate'], ['mlp.up_proj', 'up']]);
  e.set_scope('silu'); const silu = mark('silu', e.op('silu', unbf(gate)).low(16));
  e.set_scope('hadamard'); const gated = mark('gated', bf(e.op('mul', unbf(silu), unbf(up))));
  [out] = projectMany(gated, [['mlp.down_proj', 'down']]);
  e.set_scope('residual2'); scaled = mark('ffn_scaled', bf(e.op('mul', unbf(out), literal(0x3e46cdf7, 32))));
  let result = mark('output', bf(e.op('add', unbf(x), unbf(scaled))));
  e.set_scope('control'); const final = e.op(CTL, control_in, join([st.err0, st.err1, literal(0, 30)]));
  e.set_scope('kv'); let newkv = e.select(final.bit(CB + 2), provisional, oldkv); newkv = e.select(resetb, literal(0, 16), newkv);
  e.set_scope('output'); result = e.select(final.bit(CB + 6), result, literal(0, 16));
  // D：newkv.ids.T.reshape(-1)（逐 KV 条目的 16 位），再 final 的 0..CB+1 位（计数 CB 位 + 2 个 error）
  const kvIds = e.ids(newkv), dIds = new Float64Array(nstate);
  for (let b = 0; b < 16; b++) for (let c = 0; c < KV_COUNT; c++) dIds[b * KV_COUNT + c] = kvIds[b][c];   // 位平面次序，与 oldkv 一致
  const fin = e.ids(final); for (let r = 0; r < CB + 2; r++) dIds[KV_COUNT * 16 + r] = fin[r][0];
  // 输出表：og.T.reshape(-1)（第 i 个输出值的第 b 位）
  const rIds = e.ids(result), outIds = new Float64Array(16 * 1536);
  for (let i = 0; i < 1536; i++) for (let b = 0; b < 16; b++) outIds[i * 16 + b] = rIds[b][i];
  if (e.counts['sum8'] !== 749568) throw new Error('sum8 ' + e.counts['sum8']);   // 查表法：每（行，32 组）一次 sum8
  return { outIds, dIds, NIN: ninput, NST: nstate };
}
export { PROJ };

