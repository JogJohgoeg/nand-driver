// gatesim R7 生成器：R61 model.py 的 Model.control / Model.embed / Tail.forward 逐行移植（只读参照；追踪不求值）。
// 输入只有权重编码：embedding（BF16 位型）、final norm、int8 head 与行 scale；控制器模板名为参数（产品上限 256 的控制器交付后只换参数）。
import { Row, Bits, literal, join, unbf, range, map } from './bits.mjs';
const genRow = a => new Row('G', a.length, { a });
const vm = (e, b) => { const I = e.ids(b), n = b.n, h = b.h, o = new Float64Array(n * h); for (let i = 0; i < n; i++) for (let r = 0; r < h; r++) o[i * h + r] = I[r][i]; return o; };
// constant_rows(A[out, red], width)：第 (r·width + b) 行、第 o 列 = A[o][r] 的第 b 位
function constantRows(get, nOut, nRed, width) {
  const rows = [];
  for (let r = 0; r < nRed; r++) for (let b = 0; b < width; b++) { const a = new Uint8Array(nOut); for (let o = 0; o < nOut; o++) a[o] = (get(o, r) >> b) & 1; rows.push(new Row('L', nOut, { a })); }
  return new Bits(rows, nOut);
}
// 控制器为参数：R61 model_control（Q=34，cap32）或 R65 model_control_cap256_C128（Q=37）/ _C512（Q=39）。
// 物理 Q 从线 40 起共 Q 位，外部 PI 仍为线 2..39；next_state = out[23:23+Q]，action 起点 23+Q（R65 GATESIM-INTEGRATION.md）。
export function traceControl(e, { controller = 'model_control', Q = 34 } = {}) {
  e.base = 40 + Q; e.set_scope('model-control');
  const ids = [...range(40, 40 + Q), ...range(2, 40)];
  const res = e.op(controller, new Bits(ids.map(i => genRow(Float64Array.of(i))), 1));
  const I = e.ids(res).map(a => a[0]);
  return { parts: [['ports', Float64Array.from(I)]], dIds: Float64Array.from(I.slice(23, 23 + Q)), NIN: 38, NST: Q };
}
// R9：单个状态机模板作为一个单元（K6 组合化模板 / 合并选择器 / 我方胶合）。约定同控制器：外部输入在线 2..2+NIN，状态 Q 紧随其后；
// 模板输入 = [Q, 外部]，输出 = [外部输出 nExt, next_state Q]；单元只导出外部输出，D 取 next_state。
export function traceCell(e, { cell, NIN, Q, nExt }) {
  e.base = 2 + NIN + Q; e.set_scope(cell);
  const ids = [...range(2 + NIN, 2 + NIN + Q), ...range(2, 2 + NIN)];
  const res = e.op(cell, new Bits(ids.map(i => genRow(Float64Array.of(i))), 1));
  const I = e.ids(res).map(a => a[0]);
  return { parts: [['ports', Float64Array.from(I.slice(0, nExt))]], dIds: Q ? Float64Array.from(I.slice(nExt, nExt + Q)) : null, NIN, NST: Q };
}
const tailOps = e => ({
  bf: x => e.op('bf16', x).low(16),
  nonfinite: x => e.reduce('or', e.op('nf', x.rowsRange(7, 15))),
});
export function traceEmbedding(e, emb) {            // emb: Uint16Array(73448·1536)
  const NIN = 17; e.base = 2 + NIN; const T = tailOps(e);
  e.set_scope('embedding-ROM');
  const token = new Bits([...range(2, 19)].map(i => genRow(Float64Array.of(i))), 1);
  const pages = [];
  for (let begin = 0; begin < 73448; begin += 256) {
    const end = Math.min(73448, begin + 256);
    const table = constantRows((o, r) => (begin + r < end ? emb[(begin + r) * 1536 + o] : 0), 1536, 256, 16);
    pages.push(e.op('rom256x16', token.low(8), table));
  }
  while (pages.length < 512) pages.push(literal(new Float64Array(1536), 16));
  let x = e.join1(pages), count = 512;
  for (let bit = 8; bit < 17; bit++) {
    const h = count / 2, left = new Int32Array(h * 1536), right = new Int32Array(h * 1536);
    for (let p = 0; p < h; p++) for (let i = 0; i < 1536; i++) { left[p * 1536 + i] = p * 3072 + i; right[p * 1536 + i] = p * 3072 + i + 1536; }
    x = e.select(token.bit(bit), x.cols(right), x.cols(left)); count = h;
  }
  const raw = x;
  e.set_scope('embedding-scale');
  const y = T.bf(e.op('mul', unbf(x), literal(0x41400000, 32)));
  return { parts: [['embedded', vm(e, y)], ['embedding_raw', vm(e, raw)]], dIds: null, NIN, NST: 0 };
}
export function traceTail(e, { normW, qw, sw }) {  // normW: Uint16Array(1536)；qw: Int8Array(73448·1536)；sw: Uint32Array(73448)（float32 位型）
  const NIN = 1536 * 16 + 104; e.base = 2 + NIN; const T = tailOps(e), trace = {}, mark = (n, x) => { trace[n] = x; return x; };
  const x = new Bits([...Array(16).keys()].map(b => { const a = new Float64Array(1536); for (let i = 0; i < 1536; i++) a[i] = 2 + i * 16 + b; return genRow(a); }), 1536);
  const errs = new Bits([genRow(Float64Array.from(range(2 + 1536 * 16, 2 + NIN)))], 104);
  // Tail.forward
  e.set_scope('final-norm'); e.set_scope('final_norm');   // Tail.forward 先 set_scope('final-norm')，随即 OriginalLayer.norm 内 set_scope(label)
  const xf = unbf(x), squared = e.op('mul', xf, xf); let s = literal(0, 32);
  for (let j = 0; j < x.n; j++) s = e.op('add_nn', s, squared.cols(j));   // ≡ add：链上两输入符号位恒 0（cells/add_nn.json）
  const f32 = new Float32Array(1), u32 = new Uint32Array(f32.buffer); f32[0] = 1536;
  const v = e.op('add', e.op('div', s, literal(u32[0], 32)).low(32), literal(0x3727c5ac, 32));
  const u = e.op('div', literal(0x3f800000, 32), e.op('sqrt', v).low(32)).low(32);
  const hh = T.bf(e.op('mul', xf, u)), gw = new Float64Array(1536); for (let i = 0; i < 1536; i++) gw[i] = normW[i] * 65536;
  const h = mark('final_norm', T.bf(e.op('mul', unbf(hh), literal(gw, 32))));
  e.set_scope('head-quant');
  const z = mark('div6', T.bf(e.op('div', unbf(h), literal(0x40c00000, 32)).low(32)));
  const mag = join([literal(0, 16), z.low(15), literal(0, 1)]);
  const maximum = e.op('umax', e.reduce('umax', mag), literal(0x3727c5ac, 32));
  const sx = mark('head_scale', e.op('div', literal(0x42fe0000, 32), maximum).low(32));
  const q = mark('head_codes', e.op('quant_s8', z, sx));
  let errors = e.op('or', e.reduce('or', errs), T.nonfinite(z));
  const chunks = [];
  // 查表法（≡ dot32_s8 逐 32 项整数和，整数加法精确）：每个激活 i 先算与全部 256 个 int8 码之积（车道 i*256 + 码，mul8），
  // 各行按常数权重码取积（逐字字节偏移收集），每 32 个用 sum32 求和，再 iadd32 累加 48 组。
  e.set_scope('head-lut');
  const NLh = 1536 * 256, lutA = q.cols(map(range(0, NLh), l => Math.floor(l / 256)));
  const lutW = []; for (let b = 0; b < 8; b++) { const a = new Uint8Array(NLh); for (let l = 0; l < NLh; l++) a[l] = ((l & 255) >> b) & 1; lutW.push(new Row('L', NLh, { a })); }
  const prod = e.op('mul8', lutA, new Bits(lutW, NLh));
  for (let begin = 0; begin < 73448; begin += 256) {
    const end = Math.min(73448, begin + 256), n = end - begin;
    e.set_scope('head-dot'); let total = literal(new Float64Array(n), 32);
    for (let g = 0; g < 48; g++) {
      const sel = []; for (let j = 0; j < 32; j++) { const i = g * 32 + j, idx = new Int32Array(n); for (let o = 0; o < n; o++) idx[o] = i * 256 + (qw[(begin + o) * 1536 + i] & 255); sel.push(prod.cols(idx)); }
      total = e.op('iadd32', total, e.op('sum32', ...sel));
    }
    e.set_scope('head-rescale');
    const result = e.op('head_scale', total, literal(Float64Array.from(sw.subarray(begin, end)), 32), sx);
    const out = result.low(16), badv = e.reduce('or', e.op('not', result.bit(16)));
    errors = e.op('or', errors, e.op('or', badv, T.nonfinite(out)));
    chunks.push(out);
  }
  const logits = mark('logits_bf16', e.join1(chunks));
  e.set_scope('argmax');
  const cand = join([logits, literal([...Array(73448).keys()], 17)]);
  const winner = e.reduce('argmax_bf16', cand);
  const pred = winner.rowsRange(16, 33);
  return { parts: [['argmax_error', Float64Array.from([...vm(e, pred), ...vm(e, errors)])], ...['final_norm', 'div6', 'head_scale', 'head_codes', 'logits_bf16'].map(k => [k, vm(e, trace[k])])], dIds: null, NIN, NST: 0 };
}
