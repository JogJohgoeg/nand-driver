// gatesim R7 生成器入口（Deno 与浏览器共用）：由权重包按固定规则生成 52 层与头尾的中间表示（与 Python trace_multi / trace_unit 逐字节相同）。
import { Engine, Pool, HashPool, layout, emitRows, emitTables, exportEngine, importEngine } from './engine.mjs';
export { HashPool };
import { traceLayer, LAYER_NIN, LAYER_NST, PROJ, layerDims } from './layer.mjs';
import { traceControl, traceEmbedding, traceTail, traceCell } from './model.mjs';
// 权重包：manifest + 按需取张量（get 返回 Uint8Array 字节）
export function weightsView(man, getBytes) {
  const T = new Map(man.tensors.map(t => [t.name, t]));
  const typed = (name, C) => { const b = getBytes(T.get(name)); const c = new Uint8Array(b.length); c.set(b); return new C(c.buffer); };
  return {
    T, typed, bytes: name => getBytes(T.get(name)),
    meta: Object.fromEntries(man.cells.map(c => { const m = JSON.parse(new TextDecoder().decode(getBytes(T.get(`cell.${c}.json`)))); m.unit = c; return [c, m]; })),
    layer(L) {
      const p = `model.layers.${L}.`, proj = {};
      for (const k of PROJ) proj[k] = { shape: typed(p + k + '.shape', Uint32Array), packed: typed(p + k + '.packed', Uint8Array), scale: typed(p + k + '.scale', Uint16Array),
        exc_index: typed(p + k + '.exc_index', Uint32Array), exc_bits: typed(p + k + '.exc_bits', Uint16Array) };
      return { proj, norms: { input_layernorm: typed(p + 'input_layernorm.weight', Uint16Array), post_attention_layernorm: typed(p + 'post_attention_layernorm.weight', Uint16Array) } };
    },
  };
}
const withPad = parts => { const segs = []; const out_parts = []; let off = 0; for (const [name, ids] of parts) { const pad = (32 - ids.length % 32) % 32; out_parts.push({ name, bit0: off, bits: ids.length }); segs.push(ids, new Float64Array(pad)); off += ids.length + pad; } const o = new Float64Array(off); let p = 0; for (const s of segs) { o.set(s, p); p += s.length; } return { outIds: o, out_parts }; };
// 头尾单元（trace_unit 规则）
export function genUnit(Wv, unit, opts = {}) {
  const t0 = performance.now(); let NIN = { control: 38, embedding: 17, tail: 1536 * 16 + 104 }[unit];
  let NST = 0;
  const CELLU = { k6: 'k6_comb', merge: 'merge_comb', glue: 'k6_glue', glue2: 'k6_glue2', glue3: 'k6_glue3' };   // R9 工具旁路单元：模板元数据给出 Q 与外部输出数
  if (CELLU[unit]) { const cm = Wv.meta[CELLU[unit]]; if (!cm) throw new Error('cell not in library: ' + CELLU[unit]); NST = cm.q_bits; NIN = cm.external_inputs ?? (cm.n_in - NST);
    opts = { cell: CELLU[unit], NIN, Q: NST, nExt: cm.external_outputs ?? (cm.n_out - NST) }; }
  if (unit === 'control') {                               // 控制器参数：Q 取自单元库元数据；容量 C 必须等于层的 KV 容量（128），C128 / C512 不得混接
    const cm = Wv.meta[opts.controller || 'model_control']; if (!cm) throw new Error('controller not in cell library: ' + opts.controller);
    opts = { ...opts, controller: opts.controller || 'model_control', Q: cm.q_bits || 34 }; NST = opts.Q;
    const C = opts.C || 128;                                // R9：层 KV 容量参数 C（128 / 512），控制器 C 必须与之相同
    if (cm.context_capacity !== undefined && cm.context_capacity !== C) throw new Error(`controller C=${cm.context_capacity} != layer KV capacity ${C}`);
  }
  const region = [2, 2 + NIN, 2 + NIN + NST];
  const E = new Engine(Wv.meta, { mode: 'unit', region }); E.cm = new Pool(); E.lp = new Pool();
  let R;
  if (unit === 'control') R = traceControl(E, opts);
  else if (CELLU[unit]) R = traceCell(E, opts);
  else if (unit === 'embedding') R = traceEmbedding(E, Wv.typed('model.embed_tokens.weight', Uint16Array));
  else R = traceTail(E, { normW: Wv.typed('model.norm.weight', Uint16Array), qw: Wv.typed('head.codes', Int8Array), sw: Wv.typed('head.scales', Uint32Array) });
  const tTrace = performance.now() - t0;
  const Lo = layout(E, NIN, NST), { R: rows, stats } = emitRows(E, Lo, { cm: E.cm, lp: E.lp });
  const { outIds, out_parts } = withPad(R.parts);
  const tb = emitTables(E, Lo, { outIds, dIds: R.dIds });
  const nand = Object.entries(E.counts).reduce((s, [k, v]) => s + Wv.meta[k].n_nand * v, 0);
  const meta = { unit, templates: tb.templates, ncalls: E.calls, fused: true, ngroups: Lo.groups.length, arena_words: Lo.ARENA, off_in: Lo.off_in, off_st: Lo.off_st, ninput: NIN, nstate: NST,
    nout: outIds.length, out_parts, call_levels: Math.max(...Lo.lvl), stats, colmap_words: Math.max(1, E.cm.len), litpool_words: Math.max(1, E.lp.len), counts: E.counts, nand, latch: NST,
    gen_ms: { trace: tTrace, total: performance.now() - t0 } };
  return { meta, files: { groups: tb.groups, members: tb.members, wordmap: tb.wordmap, calls: tb.calls, rows, colmap: E.cm.concat(), litpool: E.lp.concat(), dtab: tb.dtab, outtab: tb.outtab } };
}
// 52 层（trace_multi 规则，跨层共享列映射池与常量池；按层号顺序生成与入池）
export function newShared(cmCap = 535000000) { return { cm: new Pool(cmCap), lp: new Pool(1 << 27) }; }   // 列映射池预留 5.35 亿字（Chromium 单个 ArrayBuffer 实测上限约 2^31 − 2 MiB；未写入的页不驻留）
export function genLayer(Wv, L, shared, C = 128) {
  const t0 = performance.now(), region = [2, 2 + LAYER_NIN, 2 + LAYER_NIN + layerDims(C).nst];
  const E = new Engine(Wv.meta, { mode: 'multi', region });
  const R = traceLayer(E, Wv.layer(L), C); const tTrace = performance.now() - t0;
  const Lo = layout(E, R.NIN, R.NST), { R: rows, stats } = emitRows(E, Lo, shared);
  const tb = emitTables(E, Lo, { outIds: R.outIds, dIds: R.dIds });
  const nand = Object.entries(E.counts).reduce((s, [k, v]) => s + Wv.meta[k].n_nand * v, 0);
  const meta = { layer: L, templates: tb.templates, ncalls: E.calls, fused: true, ngroups: Lo.groups.length, arena_words: Lo.ARENA, off_in: Lo.off_in, off_st: Lo.off_st, ninput: R.NIN, nstate: R.NST,
    call_levels: Math.max(...Lo.lvl), stats, colmap_words_shared_so_far: shared.cm.len, litpool_words_shared_so_far: shared.lp.len, shared_pool: '../shared', counts: E.counts, nand, latch: R.NST,
    gen_ms: { trace: tTrace, total: performance.now() - t0 } };
  return { meta, files: { groups: tb.groups, members: tb.members, wordmap: tb.wordmap, calls: tb.calls, rows, dtab: tb.dtab, outtab: tb.outtab } };
}

// 并行生成：worker 里只做追踪与行分类（traceLayerState），主线程按层号顺序做共享池入池与建表（finishLayer）——与串行 genLayer 逐字节相同
export function traceLayerState(Wv, L, C = 128) {
  const t0 = performance.now(), region = [2, 2 + LAYER_NIN, 2 + LAYER_NIN + layerDims(C).nst];
  const E = new Engine(Wv.meta, { mode: 'multi', region });
  const R = traceLayer(E, Wv.layer(L), C); const { st, transfer } = exportEngine(E);
  st.R = { outIds: R.outIds, dIds: R.dIds, NIN: R.NIN, NST: R.NST }; transfer.push(R.outIds.buffer, R.dIds.buffer); st.traceMs = performance.now() - t0; st.L = L;
  return { st, transfer };
}
export function finishLayer(meta0, st, shared, { runtime = false } = {}) {   // runtime：同时产出本层运行时形式（局部列映射 + 局部偏移行表）
  const t0 = performance.now(), E = importEngine(st, meta0), R = st.R, rt = runtime ? { local: new Pool(1 << 16) } : null;
  const Lo = layout(E, R.NIN, R.NST), { R: rows, RT, stats } = emitRows(E, Lo, shared, rt);
  const tb = emitTables(E, Lo, { outIds: R.outIds, dIds: R.dIds });
  const nand = Object.entries(E.counts).reduce((s, [k, v]) => s + meta0[k].n_nand * v, 0);
  const meta = { layer: st.L, templates: tb.templates, ncalls: E.calls, fused: true, ngroups: Lo.groups.length, arena_words: Lo.ARENA, off_in: Lo.off_in, off_st: Lo.off_st, ninput: R.NIN, nstate: R.NST,
    call_levels: Math.max(...Lo.lvl), stats, colmap_words_shared_so_far: shared.cm.len, litpool_words_shared_so_far: shared.lp.len, shared_pool: '../shared', counts: E.counts, nand, latch: R.NST,
    gen_ms: { trace: st.traceMs, emit: performance.now() - t0 } };
  const out = { meta, files: { groups: tb.groups, members: tb.members, wordmap: tb.wordmap, calls: tb.calls, rows, dtab: tb.dtab, outtab: tb.outtab } };
  if (rt) out.runtime = { rows: RT, colmap: rt.local.concat() };
  return out;
}
