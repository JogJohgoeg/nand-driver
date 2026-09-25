// gatesim R7 生成器：R60 layer.py 的 Layer.forward 逐行移植（只读参照；追踪不求值）。输入只有本层权重编码：7 个 group32 codec 与 2 个 norm。
// R9：容量参数 C（128 / 512）。C=512 逐行照 R63 layer.py（LAYER-DELTA.patch）：KV 512 槽、10 位计数、eq10、C512 控制模板（IR 中名 control_c512）、
// RoPE 9 位地址 = 4 页 rope_rom0..3 + mux32 页选择、qk/softmax/av 长度 512。C=128 与 R7/R8 逐字节相同。
import { Row, Bits, literal, join, unbf, signed8, range, tile, repeat, cat, map, f32bits } from './bits.mjs';
const PROJ = ['self_attn.q_proj', 'self_attn.k_proj', 'self_attn.v_proj', 'self_attn.o_proj', 'mlp.gate_proj', 'mlp.up_proj', 'mlp.down_proj'];
export const LAYER_NIN = 1536 * 16 + 2, KV_COUNT = 2 * 128 * 8 * 64, LAYER_NST = KV_COUNT * 16 + 10;
export const layerDims = (C = 128) => { const kv = 2 * C * 8 * 64, cb = C === 512 ? 10 : 8; return { kv, cb, nst: kv * 16 + cb + 2 }; };
const genRow = a => new Row('G', a.length, { a });
const zeros = n => new Float64Array(n);
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
  const oldkv = new Bits([...Array(16).keys()].map(b => { const a = new Float64Array(KV_COUNT); for (let c = 0; c < KV_COUNT; c++) a[c] = S + c * 16 + b; return genRow(a); }), KV_COUNT);
  const count = new Bits([...Array(CB).keys()].map(r => genRow(Float64Array.of(S + nstate - (CB + 2) + r))), 1);
  const olderr = new Bits([...Array(2).keys()].map(r => genRow(Float64Array.of(S + nstate - 2 + r))), 1);
  const control_in = join([count, validb, resetb, olderr, literal(0, 28 - CB)]);
  const initial = e.op(CTL, control_in, literal(0, 32));
  const st = { err0: literal(0, 1), err1: literal(0, 1) };
  e.set_scope('rope');
  const romPage = name => { const romB = e.op(name, count.low(7));
    // rom.v.reshape(64,32).T：第 r 行第 c 列 = 扁平第 c·32 + r 个输出
    const romIds = e.ids(romB).map(a => a[0]);
    return new Bits([...Array(32).keys()].map(r => { const a = new Float64Array(64); for (let c = 0; c < 64; c++) a[c] = romIds[c * 32 + r]; return genRow(a); }), 64); };
  let rom;
  if (C === 128) rom = romPage('rope_rom');
  else { const pages = [0, 1, 2, 3].map(pg => romPage('rope_rom' + pg));      // R63：四页 ROM，bit8 / bit7 经 mux32 选页（求值顺序同 Python 实参从左到右）
    const hi = e.select(count.bit(7), pages[3], pages[2]), lo = e.select(count.bit(7), pages[1], pages[0]); rom = e.select(count.bit(8), hi, lo); }
  const norm = (x, name, label) => {
    e.set_scope(label); const xf = unbf(x), squared = e.op('mul', xf, xf); let s = literal(0, 32);
    for (let j = 0; j < x.n; j++) s = e.op('add', s, squared.cols(j));
    const v = e.op('add', e.op('div', s, literal(f32bits(x.n), 32)).low(32), literal(0x3727c5ac, 32));
    const u = e.op('div', literal(0x3f800000, 32), e.op('sqrt', v).low(32)).low(32);
    const h = bf(e.op('mul', xf, u)), wv = W.norms[name], gw = new Float64Array(wv.length); for (let i = 0; i < wv.length; i++) gw[i] = wv[i] * 65536;
    return mark(label, bf(e.op('mul', unbf(h), literal(gw, 32))));
  };
  const project = (key, x, label) => {
    e.set_scope(label); const P = W.proj[key], n = P.shape[0], k = P.shape[1], G = k / 32;
    const code = (r, c) => { const i = r * k + c; return (P.packed[i >> 2] >> (2 * (i & 3))) & 3; };
    const bad = nonfinite(x); st.err0 = e.op('or', st.err0, bad);
    const mag = join([literal(0, 16), x.low(15), literal(0, 1)]);
    const maximum = e.op('umax', e.reduce('umax', mag), literal(0x3727c5ac, 32));
    const sx = e.op('div', literal(0x42fe0000, 32), maximum).low(32);
    const q = e.op('clip', e.op('f2i', e.op('mul', unbf(x), sx))).low(8);
    // 定点累加（≡ fp32 逐组 add，cells/facc.py、prove_facc.py）：每行网格 u = 2^(lo−134)，lo = 行内组缩放与例外缩放的最小 bf16 指数域；
    // accum 以整数 S 表示（S·u 即 fp32 值），facc / facce 逐步做 RNE24，最后 fix2f 转回 fp32。前提逐行检查：缩放皆为正规 bf16、指数跨度 ≤ 5、Σ|x| < 2^29。
    const lo = new Int32Array(n).fill(999), bound = new Float64Array(n), ebits = b => (b >> 7) & 255;
    const chk = (b, pos) => { const e = ebits(b); if (e === 0 || e === 255 || (pos && b >> 15)) throw new Error(`${key}: 缩放不是正规数 ${b}`); return e; };
    for (let r = 0; r < n; r++) for (let g = 0; g < G; g++) lo[r] = Math.min(lo[r], chk(P.scale[r * G + g], true));
    for (let t = 0; t < P.exc_index.length; t++) { const r = Math.floor(P.exc_index[t] / k); lo[r] = Math.min(lo[r], chk(P.exc_bits[t], false)); }
    const shOf = (r, b) => { const s = ebits(b) - lo[r]; if (s > 5) throw new Error(`${key}: 行 ${r} 指数跨度 ${s} > 5`); return s; };
    for (let r = 0; r < n; r++) for (let g = 0; g < G; g++) { const b = P.scale[r * G + g]; bound[r] += 4096 * (128 | (b & 127)) * 2 ** shOf(r, b); }
    for (let t = 0; t < P.exc_index.length; t++) { const r = Math.floor(P.exc_index[t] / k), b = P.exc_bits[t]; bound[r] += 128 * (128 | (b & 127)) * 2 ** shOf(r, b); }
    for (let r = 0; r < n; r++) if (bound[r] >= 2 ** 29) throw new Error(`${key}: 行 ${r} Σ|x| 上界 ${bound[r]} ≥ 2^29`);
    let accum = literal(zeros(n), 32);
    // escape 按 exceptions 数组原序、按组筛选
    const escByG = Array.from({ length: G }, () => []);
    for (let t = 0; t < P.exc_index.length; t++) escByG[Math.floor((P.exc_index[t] % k) / 32)].push(t);
    // 查表法三值点积（≡ ternary32，整数加法精确、|d| ≤ 4096）：每 4 个激活一组，tern4 算出 81 种 ±/0 组合之和（车道 h*81 + c，c 的三进制位 0→0、1→+1、2→−1），
    // 各行按常数权重码取 8 个表项（逐字字节偏移收集，见 exec/layer_pack.mjs 类别 X），sum8 一次求和。例外码 3 记 0（与 ternary32 相同，例外另加）。
    const G4 = k / 4, NL = G4 * 81, P3 = [1, 3, 9, 27], digit = c => (c === 1 ? 1 : c === 2 ? 2 : 0);
    const lutQ = join([0, 1, 2, 3].map(i => q.cols(map(range(0, NL), l => Math.floor(l / 81) * 4 + i))));
    const lutC = []; for (let i = 0; i < 4; i++) for (let b = 0; b < 2; b++) { const a = new Uint8Array(NL); for (let l = 0; l < NL; l++) a[l] = (Math.floor((l % 81) / P3[i]) % 3 >> b) & 1; lutC.push(new Row('L', NL, { a })); }
    const lut = e.op('tern4', lutQ, new Bits(lutC, NL));
    for (let g = 0; g < G; g++) {
      const sel = []; for (let j = 0; j < 8; j++) { const idx = new Int32Array(n); for (let r = 0; r < n; r++) { let c = 0; for (let i = 0; i < 4; i++) c += digit(code(r, g * 32 + j * 4 + i)) * P3[i]; idx[r] = (g * 8 + j) * 81 + c; } sel.push(lut.cols(idx)); }
      const d16 = e.op('sum8', ...sel);   // sum8 ≡ 7 次 iadd16（表项 |v| ≤ 512，按 11 位二补码求和），|d| ≤ 4096
      const mm = new Float64Array(n), sh = new Float64Array(n); for (let r = 0; r < n; r++) { const b = P.scale[r * G + g]; mm[r] = b & 127; sh[r] = shOf(r, b); }
      accum = e.op('facc', accum, d16, literal(mm, 7), literal(sh, 3));   // ≡ add(accum, scale_exact(d, s))
      for (const t of escByG[g]) {
        e.set_scope(label + '.escape'); const idx = P.exc_index[t], row = Math.floor(idx / k), col = idx % k, b = P.exc_bits[t];
        const val = e.op('facce', accum.cols(row), q.cols(col), literal(b & 127, 7), literal(shOf(row, b), 3), literal(b >> 15, 1));   // ≡ add(accum, mul(i2f(q), exc))
        accum = e.put(accum, [row], val); e.set_scope(label);
      }
    }
    const kk = new Float64Array(n); for (let r = 0; r < n; r++) kk[r] = (lo[r] - 134) & 255;
    accum = e.op('fix2f', accum, literal(kk, 8));
    const out = bf(e.op('div', accum, sx).low(32)); st.err1 = e.op('or', st.err1, nonfinite(out));
    return mark(label, out);
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
  let q = project('self_attn.q_proj', h, 'q'), k = project('self_attn.k_proj', h, 'k'); const v = project('self_attn.v_proj', h, 'v');
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
  e.set_scope('softmax'); let m = literal(new Float64Array(24).fill(0xff800000), 32);
  const h24 = range(0, 24);
  for (let p = 0; p < C; p++) { const a = unbf(scores.cols(map(h24, i => i * C + p))); m = e.select(e.op('gt', a, m).low(1), a, m); }
  let weights = e.op('exp', e.op('sub', unbf(scores), m.cols(heads)));
  weights = e.select(active.cols(pos), weights, literal(0, 32)); let total = literal(zeros(24), 32);
  for (let p = 0; p < C; p++) { const a = e.op('add', total, weights.cols(map(h24, i => i * C + p))); total = e.select(active.cols(p), a, total); }
  weights = mark('softmax', bf(e.op('div', weights, total.cols(heads)).low(32)));
  e.set_scope('av'); let acc = literal(zeros(1536), 32);
  const hidx = map(range(0, 1536), i => Math.floor(i / 64)), didx = map(range(0, 1536), i => i % 64);
  for (let p = 0; p < C; p++) {
    const product = e.op('mul', unbf(weights.cols(map(hidx, hh => hh * C + p))), unbf(vc.cols(map(hidx, (hh, i) => p * 512 + Math.floor(hh / 3) * 64 + didx[i]))));
    const added = e.op('add', acc, product); acc = e.select(active.cols(p), added, acc);
  }
  let out = mark('av', bf(acc)); out = project('self_attn.o_proj', out, 'o');
  e.set_scope('residual1'); let scaled = mark('attention_scaled', bf(e.op('mul', unbf(out), literal(0x3e46cdf7, 32))));
  x = mark('residual1', bf(e.op('add', unbf(x), unbf(scaled))));
  const h2 = norm(x, 'post_attention_layernorm', 'norm2');
  const gate = project('mlp.gate_proj', h2, 'gate'), up = project('mlp.up_proj', h2, 'up');
  e.set_scope('silu'); const silu = mark('silu', e.op('silu', unbf(gate)).low(16));
  e.set_scope('hadamard'); const gated = mark('gated', bf(e.op('mul', unbf(silu), unbf(up))));
  out = project('mlp.down_proj', gated, 'down');
  e.set_scope('residual2'); scaled = mark('ffn_scaled', bf(e.op('mul', unbf(out), literal(0x3e46cdf7, 32))));
  let result = mark('output', bf(e.op('add', unbf(x), unbf(scaled))));
  e.set_scope('control'); const final = e.op(CTL, control_in, join([st.err0, st.err1, literal(0, 30)]));
  e.set_scope('kv'); let newkv = e.select(final.bit(CB + 2), provisional, oldkv); newkv = e.select(resetb, literal(0, 16), newkv);
  e.set_scope('output'); result = e.select(final.bit(CB + 6), result, literal(0, 16));
  // D：newkv.ids.T.reshape(-1)（逐 KV 条目的 16 位），再 final 的 0..CB+1 位（计数 CB 位 + 2 个 error）
  const kvIds = e.ids(newkv), dIds = new Float64Array(nstate);
  for (let c = 0; c < KV_COUNT; c++) for (let b = 0; b < 16; b++) dIds[c * 16 + b] = kvIds[b][c];
  const fin = e.ids(final); for (let r = 0; r < CB + 2; r++) dIds[KV_COUNT * 16 + r] = fin[r][0];
  // 输出表：og.T.reshape(-1)（第 i 个输出值的第 b 位）
  const rIds = e.ids(result), outIds = new Float64Array(16 * 1536);
  for (let i = 0; i < 1536; i++) for (let b = 0; b < 16; b++) outIds[i * 16 + b] = rIds[b][i];
  if (e.counts['sum8'] !== 749568) throw new Error('sum8 ' + e.counts['sum8']);   // 查表法：每（行，32 组）一次 sum8
  return { outIds, dIds, NIN: ninput, NST: nstate };
}
export { PROJ };

