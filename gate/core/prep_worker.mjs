// 准备 worker（主线程只做 GPU 上传，页面不卡）：层的 finishLayer（共享池去重、写行表）与全部 preparePack 都在这里做，
// 结果（准备包，可转移缓冲）送回主线程上传。共享常量池 / 列映射去重池 / 全局紧凑列映射只存在于本 worker，
// 请求按到达顺序串行处理，层必须按层号依次送来（与原先主线程按层号串行完成相同，偏移分配顺序不变）。
import { finishLayer } from '../gen_ir/gen_core.mjs';
import { HashPool } from '../gen_ir/engine.mjs';
import { preparePack, newCC } from '../exec/layer_pack.mjs';
let S = null;
const transferOf = P => {
  const bufs = new Set();
  for (const v of Object.values(P)) if (ArrayBuffer.isView(v)) bufs.add(v.buffer);
  for (const [, a] of P.ccAppends || []) bufs.add(a.buffer);
  if (P.lpAppend) bufs.add(P.lpAppend[1].buffer);
  return [...bufs];
};
self.onmessage = ev => {
  const m = ev.data;
  try {
    if (m.type === 'init') {
      const { BOUNDS } = m;
      S = { execMan: m.execMan, bins: new Map(m.bins), meta: m.meta, strict: m.strict, BOUNDS, words: m.words, tm: new Map(), CC: newCC(m.ccCap), lpStage: [], lpWords: 0, lpFlushed: 0 };
      S.shared = { cm: new HashPool(null), lp: new HashPool((a, off) => { if (off + a.length > BOUNDS.LPCAP) throw new Error('litpool exceeds LPCAP'); S.lpStage.push(a); S.lpWords += a.length; }) };
      return;
    }
    const opts = { manifest: S.execMan, getBin: n => S.bins.get(n), tmCache: S.tm, strict: S.strict, CC: S.CC };
    let P, info = {};
    if (m.type === 'unit') P = preparePack({ meta: m.meta, ...m.files, outtab: m.files.outtab }, { ...opts, shared: null });
    else {
      const r = finishLayer(S.meta, m.st, S.shared, { runtime: true });
      let lpAppend = null;
      if (S.lpWords) { const b = new Uint32Array(S.lpWords); let p = 0; for (const a of S.lpStage) { b.set(a, p); p += a.length; } lpAppend = [S.BOUNDS.LITBASE + S.lpFlushed, b]; S.lpFlushed += S.lpWords; S.lpStage = []; S.lpWords = 0; }
      const files = { ...r.files, rows: r.runtime.rows, colmap: r.runtime.colmap };
      P = preparePack({ meta: r.meta, ...files, outtab: files.outtab }, { ...opts, shared: { litBase: S.BOUNDS.LITBASE, maxN: S.BOUNDS.MAXN, lpLen: S.BOUNDS.LPCAP, words: S.words } });
      if (lpAppend) P.lpAppend = lpAppend;
      info = { emit: r.meta.gen_ms.emit, local: r.runtime.colmap.length };
    }
    info.ccWords = S.CC.len; if (S.shared) info.shared = { cm: S.shared.cm.len, lp: S.shared.lp.len, cmEntries: S.shared.cm.entries, lpEntries: S.shared.lp.entries };
    self.postMessage({ id: m.id, P, info }, transferOf(P));
  } catch (e) { self.postMessage({ id: m.id, error: String(e && e.stack || e) }); }
};
