// gatesim R8 W3：准备包缓存。键 = 权重清单 SHA + 生成器 / 加载器代码 SHA；每个包存入时记摘要（各字段 SHA-256 → 字段摘要列表再 SHA-256），
// 命中时逐包重算比对，任一不符即整份作废（共享池按层号顺序去重，不能单独重生成某一层）。浏览器用 IndexedDB，Deno 用内存（只为验证热启动路径）。
const hex = async b => [...new Uint8Array(await crypto.subtle.digest('SHA-256', b))].map(x => x.toString(16).padStart(2, '0')).join('');
const enc = new TextEncoder();
export async function packDigest(P) {
  const parts = [];
  for (const k of Object.keys(P).sort()) {
    const v = P[k];
    if (k === 'digest') continue;
    if (ArrayBuffer.isView(v)) parts.push(k + ':' + await hex(new Uint8Array(v.buffer, v.byteOffset, v.byteLength)));
    else if (k === 'ccAppends' || k === 'lpAppend') { const arr = k === 'lpAppend' ? (v ? [v] : []) : v; const hs = []; for (const [o, a] of arr) hs.push(o + '=' + await hex(new Uint8Array(a.buffer, a.byteOffset, a.byteLength))); parts.push(k + ':' + hs.join(',')); }
    else if (k === 'bins') { const hs = []; for (const [n, a] of v) hs.push(n + '=' + await hex(a)); parts.push(k + ':' + hs.join(',')); }
    else parts.push(k + ':' + await hex(enc.encode(JSON.stringify(v))));
  }
  return hex(enc.encode(parts.join('\n')));
}
export async function sourceKey(manifestBytes, codeTexts) {
  return (await hex(manifestBytes)).slice(0, 32) + '-' + (await hex(enc.encode(codeTexts.join('\n\u0000\n')))).slice(0, 32);
}
// 序列化：JSON 头（定型数组记类型 / 偏移 / 长度，其余字段原样）+ 定型数组字节原样拼接（按 8 字节对齐）
const TA = { Uint8Array, Uint16Array, Uint32Array, Int32Array, Float32Array, Float64Array, Int8Array };
export function serializePack(P) {
  const head = {}, parts = []; let off = 0;
  const addTA = a => { const b = new Uint8Array(a.buffer, a.byteOffset, a.byteLength); const pad = (8 - off % 8) % 8; if (pad) { parts.push(new Uint8Array(pad)); off += pad; } const o = off; parts.push(b); off += b.byteLength; return { t: a.constructor.name, o, n: a.length }; };
  for (const [k, v] of Object.entries(P)) {
    if (ArrayBuffer.isView(v)) head[k] = { ta: addTA(v) };
    else if (k === 'ccAppends' || k === 'lpAppend' || k === 'bins') { const arr = k === 'lpAppend' ? (v ? [v] : []) : v; head[k] = { pairs: arr.map(([a, t]) => [a, addTA(t)]), single: k === 'lpAppend' && !!v }; }
    else head[k] = { j: v };
  }
  const hb = new TextEncoder().encode(JSON.stringify(head)), pre = new Uint8Array(8); new DataView(pre.buffer).setUint32(0, hb.byteLength, true);
  return new Blob([pre, hb, new Uint8Array((8 - hb.byteLength % 8) % 8), ...parts]);
}
export function deserializePack(buf) {
  const u8 = new Uint8Array(buf), hl = new DataView(buf).getUint32(0, true), head = JSON.parse(new TextDecoder().decode(u8.subarray(8, 8 + hl))), base = 8 + hl + (8 - hl % 8) % 8, P = {};
  const ta = d => new TA[d.t](buf, base + d.o, d.n);
  for (const [k, h] of Object.entries(head)) {
    if (h.ta) P[k] = ta(h.ta);
    else if (h.pairs) { const arr = h.pairs.map(([a, d]) => [a, ta(d)]); P[k] = k === 'lpAppend' ? (h.single ? arr[0] : null) : arr; }
    else P[k] = h.j;
  }
  return P;
}
// OPFS（源私有文件系统）缓存：每个准备包一个文件，流式写入，内存开销小于 IndexedDB 的结构化克隆路径
export class OPFSCache {
  async open(key) { this.key = key.replace(/[^A-Za-z0-9._-]/g, '_'); const root = await navigator.storage.getDirectory(); this.root = root; this.dir = await root.getDirectoryHandle('gatesim-' + this.key, { create: true }); return this; }
  async get(name) { try { const fh = await this.dir.getFileHandle(name + '.pack'); const f = await fh.getFile(); return deserializePack(await f.arrayBuffer()); } catch { return undefined; } }
  async put(name, P) { const fh = await this.dir.getFileHandle(name + '.pack', { create: true }); const w = await fh.createWritable(); await w.write(serializePack(P)); await w.close(); }
  async clear() { for await (const [n] of this.root.entries()) if (n.startsWith('gatesim-')) await this.root.removeEntry(n, { recursive: true }); this.dir = await this.root.getDirectoryHandle('gatesim-' + this.key, { create: true }); }
}
// OPFS + 写入 worker：put 在上传之后调用；除 keep 中的字段（上传后 L 仍引用，拷贝发送）外，其余缓冲转移给 worker，主线程不再持有
export class OPFSWorkerCache extends OPFSCache {
  async open(key, workerUrl) { await super.open(key); this.w = new Worker(workerUrl, { type: 'module' }); this.wait = new Map(); this.w.onmessage = ev => { const f = this.wait.get(ev.data.name); if (f) { this.wait.delete(ev.data.name); f(ev.data); } }; return this; }
  async idle() { while (this.wait && this.wait.size) await new Promise(r => setTimeout(r, 20)); }
  async clear() { await this.idle(); return super.clear(); }   // 清缓存前等写入 worker 空闲（写入与清理不交错）
  async put(name, P, keep = ['calls', 'groups']) {
    const head = {}, parts = [], transfer = new Set(); let off = 0;
    const addTA = (a, copy) => { if (copy) a = a.slice(); const pad = (8 - off % 8) % 8; off += pad; const o = off; parts.push([a.buffer, a.byteOffset, a.byteLength]); off += a.byteLength; transfer.add(a.buffer); return { t: a.constructor.name, o, n: a.length }; };
    for (const [k, v] of Object.entries(P)) {
      if (ArrayBuffer.isView(v)) head[k] = { ta: addTA(v, keep.includes(k)) };
      else if (k === 'ccAppends' || k === 'lpAppend' || k === 'bins') { const arr = k === 'lpAppend' ? (v ? [v] : []) : v; head[k] = { pairs: arr.map(([a, t]) => [a, addTA(t, false)]), single: k === 'lpAppend' && !!v }; }
      else head[k] = { j: v };
    }
    const r = await new Promise(res => { this.wait.set(name, res); this.w.postMessage({ dir: this.dir.name, name, head, parts }, [...transfer]); });
    if (!r.ok) throw new Error('cache write ' + name + ': ' + r.error);
    return r.bytes;
  }
}
// 不写缓存时：上传后把准备包缓冲转移给 worker 丢弃（主线程堆大、V8 回收外部内存滞后；转移后主线程立即不再持有）
export class DiscardSink {
  constructor(workerUrl) { this.w = new Worker(workerUrl, { type: 'module' }); this.wait = new Map(); this.w.onmessage = ev => { const f = this.wait.get(ev.data.name); if (f) { this.wait.delete(ev.data.name); f(); } }; }
  async put(name, P, keep = ['calls', 'groups']) {
    const bufs = new Set();
    for (const [k, v] of Object.entries(P)) { if (keep.includes(k)) continue; if (ArrayBuffer.isView(v)) bufs.add(v.buffer); else if (k === 'ccAppends' || k === 'lpAppend') for (const [, t] of (k === 'lpAppend' ? (v ? [v] : []) : v)) bufs.add(t.buffer); }
    await new Promise(res => { this.wait.set(name, res); this.w.postMessage({ name, discard: true }, [...bufs]); });
  }
}

