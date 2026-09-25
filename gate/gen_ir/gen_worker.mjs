// gatesim R7：生成 worker。收到本层（或头尾单元）所需的权重张量字节与单元库元数据，做追踪与行分类后把结果（可转移缓冲）送回主线程。
import { weightsView, traceLayerState, genUnit } from './gen_core.mjs';
self.onmessage = ev => {
  const { job, tensors, man } = ev.data;
  const byName = new Map(tensors.map(t => [t.name, t.bytes]));
  const Wv = weightsView(man, t => byName.get(t.name));
  if (job.kind === 'layer') { const { st, transfer } = traceLayerState(Wv, job.L, job.C || 128); self.postMessage({ job, st }, transfer); }
  else { const r = genUnit(Wv, job.unit, job.opts || {}); const transfer = [...new Set(Object.values(r.files).map(a => a.buffer))]; self.postMessage({ job, unit: r }, transfer); }
};
