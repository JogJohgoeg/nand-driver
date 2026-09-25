// gatesim R8：流式「生成 → 加载 → 释放」。worker 做追踪与行分类；主线程按层号顺序串行完成：共享池去重（只存哈希）→ 运行时形式 →
// （对拍模式）逐文件 SHA 与 Python 参照比对、共享池字节流式 SHA → 交执行器加载 → 丢弃主机副本。常量池新内容直接写进 GPU arena，主机不留。
// 运行时形式与 Python 格式 IR 由同一次生成产出，内容逐行相同，只有列映射偏移改指本层局部池。
import { weightsView, genUnit, finishLayer, HashPool } from '../gen_ir/gen_core.mjs';
import { PROJ } from '../gen_ir/layer.mjs';
import { preparePack, uploadPack, newCC } from '../exec/layer_pack.mjs';
import { assembleFull } from '../exec/full_exec.mjs';
const enc = new TextEncoder(), bytesOf = a => new Uint8Array(a.buffer, a.byteOffset, a.byteLength);
// 共享 arena 的结构上界（R5 实测 52 层最大值：arena 4,906,432 字、常量池 90,015,355 字、输出区 368,640 字、实例 131,072；上界留 6–7% 余量，越界即报错）
export const BOUNDS = { LITBASE: 5242880, LPCAP: 96000000, OUT: 1048576, MAXN: 131072 };
// R9：C512 的上界（R63 层：arena 与输出区约 ×1.8–4，单次调用最大实例 2·512·512 = 524288）；数值按 Python C512 追踪 52 层实测最大值留余量，越界即报错
export const boundsFor = C => C === 512 ? { LITBASE: 9961472, LPCAP: 96000000, OUT: 2621440, MAXN: 524288, CC: 48 * 1024 * 1024 } : BOUNDS;
export async function streamGenLoad(g, Wv, man, execMan, { nWorkers = 2, controller = 'model_control', log = () => { }, workerUrl, releaseChunks = null, onStage = () => { }, packSink = null, tool = false, C = 128 } = {}) {
  const BOUNDS = boundsFor(C);
  const device = g.device, U = GPUBufferUsage, t0 = performance.now(), T = { units: {}, layers: [], workers: nWorkers };
  // 共享 arena：字 0 = 0，字 1 = 全 1，常量区从 LITBASE 起，由常量池 sink 流式写入
  const words = BOUNDS.LITBASE + BOUNDS.LPCAP + BOUNDS.OUT + 64;
  const arena = device.createBuffer({ size: words * 4, usage: U.STORAGE | U.COPY_DST | U.COPY_SRC });
  const one = new Uint32Array(64); one[1] = 0xffffffff; device.queue.writeBuffer(arena, 0, one);
  const shared = {
    cm: new HashPool(null),
    lp: new HashPool((a, off) => { if (off + a.length > BOUNDS.LPCAP) throw new Error('litpool exceeds LPCAP'); lpStage.push(a); lpStageWords += a.length; }),
  };
  // 常量池新内容偏移连续追加：每层攒成一段，加载前一次写入 GPU（逐条 writeBuffer 会在一次提交里堆上百万个小拷贝，触发 GPU 环超时）
  let lpStage = [], lpStageWords = 0, lpFlushed = 0;
  const flushLp = () => { if (!lpStageWords) return null; const b = new Uint32Array(lpStageWords); let p = 0; for (const a of lpStage) { b.set(a, p); p += a.length; }
    device.queue.writeBuffer(arena, (BOUNDS.LITBASE + lpFlushed) * 4, b); const ap = [BOUNDS.LITBASE + lpFlushed, b]; lpFlushed += lpStageWords; lpStage = []; lpStageWords = 0; return ap; };
  const SH = { cache: new Map(), maxN: BOUNDS.MAXN, lpLen: BOUNDS.LPCAP, arena: { buffer: arena, litBase: BOUNDS.LITBASE, words, inited: true } };
  const cellBins = new Map(man.cells.map(c => [c, Wv.bytes(`cell.${c}.bin`)]));      // 单元库网表先拷出（约 6 MB），权重块之后可整体释放
  // 两段式加载：preparePack（纯 JS，产出可缓存的准备包）→ uploadPack（GPU）；packSink 可接收准备包（写 IndexedDB 缓存）
  g.tmCache2 ||= new Map(); g.ccHost ||= newCC(BOUNDS.CC || 16 * 1024 * 1024); const CCgpu = g.ccGpu ||= { buf: device.createBuffer({ size: g.ccHost.cap * 4, usage: U.STORAGE | U.COPY_DST }) };
  const loadPack = async (files, meta, sharedSpec, tag, lpAppend = null) => {
    const ir = { meta, ...files, outtab: files.outtab };
    const P = preparePack(ir, { manifest: execMan, getBin: n => cellBins.get(n), tmCache: g.tmCache2, strict: !!g.strict, CC: g.ccHost, shared: sharedSpec });
    if (lpAppend) P.lpAppend = lpAppend;
    const L = await uploadPack(g, P, { manifest: execMan, getBin: n => cellBins.get(n), tmCache: g.tmCache2, SH: sharedSpec ? SH : null, CCgpu });
    L.prepMs = P.stats.prepMs;
    if (packSink) await packSink(tag, P);                  // 上传之后再写缓存（写入 worker 会接管缓冲，主线程不再持有）
    return L;
  };
  // 任务：头尾（embedding 最先，暂存区按它的最大需求一次建好）、52 层
  const cellT = man.cells.map(c => `cell.${c}.json`);
  const need = job => job.kind === 'unit'
    ? [...cellT, ...({ control: [], k6: [], merge: [], glue3: [], embedding: ['model.embed_tokens.weight'], tail: ['model.norm.weight', 'head.codes', 'head.scales'] })[job.unit]]
    : [...cellT, ...PROJ.flatMap(p => ['shape', 'packed', 'scale', 'exc_index', 'exc_bits'].map(f => `model.layers.${job.L}.${p}.${f}`)), `model.layers.${job.L}.input_layernorm.weight`, `model.layers.${job.L}.post_attention_layernorm.weight`];
  const jobs = [{ kind: 'unit', unit: 'embedding' }, { kind: 'unit', unit: 'tail', opts: { controller } }, { kind: 'unit', unit: 'control', opts: { controller, C } },
    ...(tool ? ['k6', 'merge', 'glue3'].map(unit => ({ kind: 'unit', unit })) : []), ...[...Array(52).keys()].map(L => ({ kind: 'layer', L, C }))];   // R9：工具旁路三个单元；层带容量 C
  // 权重块逐步释放：每块记下最后一个需要它的任务，该任务派发（张量已拷出）后即释放这一块
  const CH = man.chunk_max_bytes, tByName = new Map(man.tensors.map(t => [t.name, t])), chunkLast = new Int32Array(man.chunks.length).fill(-1);
  jobs.forEach((job, qi_) => { for (const n of need(job)) { const t = tByName.get(n); for (let c = Math.floor(t.offset / CH); c <= Math.floor((t.offset + t.bytes - 1) / CH); c++) chunkLast[c] = Math.max(chunkLast[c], qi_); } });
  const units = {}, layers = [], pending = new Map(); let qi = 0, inflight = 0, nextL = 0, chain = Promise.resolve(), failed = null;
  const maxAhead = nWorkers + 1;                           // 背压：已完成未处理 + 在途 ≤ nWorkers + 1
  const unitDone = async (job, r) => {
    units[job.unit] = await loadPack(r.files, r.meta, null, job.unit); T.units[job.unit] = { gen: r.meta.gen_ms.total, prepMs: units[job.unit].prepMs, uploadMs: units[job.unit].loadMs };
    log(`unit ${job.unit} gen ${r.meta.gen_ms.total.toFixed(0)} ms prep ${(units[job.unit].prepMs || 0).toFixed(0)} upload ${units[job.unit].loadMs.toFixed(0)} ms`); onStage({ unit: job.unit });
  };
  const layerDone = async (L, st) => {
    const r = finishLayer(Wv.meta, st, shared, { runtime: true }); const lpAppend = flushLp();
    const files = { ...r.files, rows: r.runtime.rows, colmap: r.runtime.colmap };        // 运行时形式：局部列映射 + 局部偏移
    const t1 = performance.now(); layers[L] = await loadPack(files, r.meta, { litBase: BOUNDS.LITBASE, maxN: BOUNDS.MAXN, lpLen: BOUNDS.LPCAP, words }, 'L' + L, lpAppend);
    T.layers.push({ L, trace: st.traceMs, emit: r.meta.gen_ms.emit, prep: layers[L].prepMs, load: performance.now() - t1, local: r.runtime.colmap.length });
    delete SH.cm2; log(`L${L} trace ${st.traceMs.toFixed(0)} emit ${r.meta.gen_ms.emit.toFixed(0)} load ${(performance.now() - t1).toFixed(0)} ms`); onStage({ layer: L });
  };
  await new Promise((resolve, reject) => {
    const workers = [...Array(nWorkers)].map(() => new Worker(workerUrl, { type: 'module' }));
    const send = w => {
      if (qi >= jobs.length || failed) return false;
      if (inflight + pending.size >= maxAhead) return false;
      const job = jobs[qi++], names = need(job), tensors = names.map(n => ({ name: n, bytes: Wv.bytes(n) }));
      w.busy = true; inflight++;
      w.postMessage({ job, tensors, man: { tensors: man.tensors.filter(t => names.includes(t.name)), cells: man.cells } }, tensors.map(t => t.bytes.buffer));
      if (releaseChunks) for (let c = 0; c < chunkLast.length; c++) if (chunkLast[c] === qi - 1 || (chunkLast[c] < 0 && qi === 1)) releaseChunks(c);   // 该块的最后一个任务已拷出张量：释放
      return true;
    };
    const kick = () => { for (const w of workers) if (!w.busy) send(w); };
    let done = 0;
    const finish = () => { if (done === jobs.length) { workers.forEach(x => x.terminate()); resolve(); } };
    for (const w of workers) {
      w.onerror = e => { failed = e.message || String(e); reject(failed); };
      w.onmessage = ev => {
        w.busy = false; inflight--; const { job } = ev.data;
        const drain = async () => { while (pending.has(nextL) && units.embedding && units.tail && units.control) { const st = pending.get(nextL); pending.delete(nextL); const L = nextL++; await layerDone(L, st); done++; kick(); } finish(); };
        if (job.kind === 'unit') { const r = ev.data.unit; chain = chain.then(() => unitDone(job, r)).then(() => { done++; kick(); }).then(drain).catch(e => { failed = e; reject(e); }); }
        else { pending.set(job.L, ev.data.st); chain = chain.then(drain).catch(e => { failed = e; reject(e); }); }
        kick();
      };
    }
    kick();
  });
  if (nextL !== 52) throw new Error('layers incomplete ' + nextL);
  T.sharedWords = { cm: shared.cm.len, lp: shared.lp.len, cmEntries: shared.cm.entries, lpEntries: shared.lp.entries, ccWords: g.ccHost ? g.ccHost.len : (g.cc ? g.cc.len : 0) };
  shared.cm = shared.lp = null;
  T.totalMs = performance.now() - t0;
  const F = assembleFull(g, { ctl: units.control, emb: units.embedding, tail: units.tail, M: { layers } }, log);
  return { F, T, cellBins, toolUnits: tool ? { k6: units.k6, merge: units.merge, glue3: units.glue3 } : null };
}
export { weightsView };
// R8 W3：热启动——从准备包缓存直接上传（不下载权重块、不生成、不建表）；逐包校验摘要，任一不符返回 { fail } 由调用方改走冷启动
import { packDigest } from './pack_cache.mjs';
export async function loadFromCache(g, cache, execMan, { log = () => { }, verify = true, onStage = () => { }, C = 128 } = {}) {
  const BOUNDS = boundsFor(C);
  const t0 = performance.now(), done = await cache.get('_complete'); if (!done) return { miss: true };
  const device = g.device, U = GPUBufferUsage, cellBins = new Map(done.bins), T = { order: done.order.length, readMs: 0, verifyMs: 0, uploadMs: 0 };
  const words = BOUNDS.LITBASE + BOUNDS.LPCAP + BOUNDS.OUT + 64; let arena = null, SH = null, CCgpu = null;
  const alloc = () => { arena = device.createBuffer({ size: words * 4, usage: U.STORAGE | U.COPY_DST | U.COPY_SRC });
    const one = new Uint32Array(64); one[1] = 0xffffffff; device.queue.writeBuffer(arena, 0, one); SH = { arena: { buffer: arena, words } };
    g.tmCache2 ||= new Map(); CCgpu = g.ccGpuWarm = { buf: device.createBuffer({ size: (BOUNDS.CC || 16 * 1024 * 1024) * 4, usage: U.STORAGE | U.COPY_DST }) }; };
  const units = {}, layers = [];
  // 第一遍：只读取并校验全部包（不占 GPU）；全部通过才进入第二遍上传——任一不符时没有分配过任何 GPU 缓冲
  if (verify) for (const [tag, dg] of done.order) {
    let t = performance.now(); const P = await cache.get(tag); T.readMs += performance.now() - t;
    if (!P) return { fail: `缓存缺少 ${tag}` };
    t = performance.now(); const d = await packDigest(P); T.verifyMs += performance.now() - t; if (d !== dg || P.digest !== dg) return { fail: `缓存项 ${tag} 摘要不符` };
  }
  for (const [tag, dg] of done.order) {
    let t = performance.now(); const P = await cache.get(tag); T.readMs += performance.now() - t;
    if (!P || P.digest !== dg) return { fail: `缓存项 ${tag} 在两遍之间变化` };
    if (!arena) alloc();
    t = performance.now();
    if (P.lpAppend) device.queue.writeBuffer(arena, P.lpAppend[0] * 4, P.lpAppend[1]);
    const isLayer = tag.startsWith('L'), L = await uploadPack(g, P, { manifest: execMan, getBin: n => cellBins.get(n), tmCache: g.tmCache2, SH: isLayer ? SH : null, CCgpu });
    T.uploadMs += performance.now() - t;
    if (isLayer) layers[+tag.slice(1)] = L; else units[tag] = L;
    log(`warm ${tag}`); onStage({ tag });
  }
  T.totalMs = performance.now() - t0;
  const F = assembleFull(g, { ctl: units.control, emb: units.embedding, tail: units.tail, M: { layers } }, log);
  return { F, T, toolUnits: units.k6 ? { k6: units.k6, merge: units.merge, glue3: units.glue3 } : null };
}
// 冷启动时把准备包写进缓存：返回 packSink 与收尾函数
export function cacheWriter(cache, cellBins) {
  const order = [];
  return {
    sink: async (tag, P) => { P.digest = await packDigest(P); order.push([tag, P.digest]); await cache.put(tag, P); },
    finish: async () => { await cache.put('_complete', { order, bins: [...cellBins], at: Date.now() }); return order.length; },
  };
}
