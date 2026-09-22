import { decodeNetlist } from './bench-brain.js';

const LIMIT = 128 * 1024 * 1024;
export async function readSelection(value = undefined) {
  const db = await new Promise((resolve, reject) => {
    const r = indexedDB.open('tapeout-brain', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('selection');
    r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error);
  });
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction('selection', value === undefined ? 'readonly' : 'readwrite');
      const s = tx.objectStore('selection');
      const r = value === undefined ? s.get('current') : value === null ? s.delete('current') : s.put(value, 'current');
      tx.oncomplete = () => resolve(r.result); tx.onerror = tx.onabort = () => reject(tx.error);
    });
  } finally { db.close(); }
}

export function progressText(p) {
  const stages = {manifest:'1/4 读取网表清单',records:'2/4 读取并解压网表',verify:'3/4 校验格式、线号与声明哈希',tokenizer:'4/4 准备分词器与映射'};
  const number = n => Number(n ?? 0).toLocaleString('en-US');
  return {stage:stages[p.phase] ?? '准备大脑',bytes:`累计读取 ${number(p.received)} B · ${String(p.path ?? '').split('/').pop()}${p.fileBytes != null ? ` · 本文件 ${number(p.fileBytes)} / ${p.fileTotal > 0 ? number(p.fileTotal) : '总量未知'} B` : ''}（读取量含压缩数据，不是解压后的网表大小）`};
}

export async function loadSource(source, fetchImpl = fetch, onProgress = () => {}) {
  let received = 0;
  const report = p => onProgress({received, ...p});
  const files = new Map();
  for (const f of source.files ?? []) {
    if (files.has(f.name)) throw new Error(`重复文件名：${f.name}`);
    files.set(f.name, f);
  }
  let base;
  if (!files.size) {
    try { base = new URL(source.url); } catch { throw new Error('请输入完整的 http(s) 网表 JSON 地址'); }
    if (!['http:', 'https:'].includes(base.protocol)) throw new Error('网表 URL 只支持 http(s)');
  }
  const get = async (path, kind = 'json', phase = 'tokenizer') => {
    let response, fileTotal = 0, fileBytes = 0, last = 0;
    report({phase, path, fileBytes});
    if (files.size) {
      if (typeof path !== 'string' || path.includes('/') || path.includes('\\')) throw new Error('本地网表只支持同目录文件名');
      const file = files.get(path);
      if (!file) throw new Error(`缺少文件 ${path}：请同时选择 netlist.json、records 和分词器文件`);
      if (file.size > LIMIT) throw new Error(`${path} 超过 128 MiB 加载上限`);
      fileTotal = file.size;
      response = new Response(file);
    } else {
      const url = new URL(path, base);
      if (!['https:', 'http:'].includes(url.protocol)) throw new Error('资源 URL 只支持 http(s)');
      try { response = await fetchImpl(url.href, { signal: AbortSignal.timeout(60000), credentials: 'omit' }); }
      catch { throw new Error(`无法读取 ${url.href}：可能是 CORS / 容器限制；请下载后选本地文件`); }
      if (!response.ok) throw new Error(`${path} HTTP ${response.status}；可改选本地文件`);
      // Content-Encoding is decoded by fetch itself; its header length is not
      // comparable to stream bytes. Never invent a total in that case.
      if (!response.headers.get('content-encoding')) fileTotal = Number(response.headers.get('content-length')) || 0;
    }
    report({phase, path, fileBytes, fileTotal});
    let stream = response.body.pipeThrough(new TransformStream({transform(chunk, controller) {
      fileBytes += chunk.length; received += chunk.length;
      if (Date.now() - last >= 100) { report({phase, path, fileBytes, fileTotal}); last = Date.now(); }
      controller.enqueue(chunk);
    }}));
    if (/\.gz(?:[?#]|$)/.test(path)) stream = stream.pipeThrough(new DecompressionStream('gzip'));
    const reader = stream.getReader(), chunks = []; let size = 0;
    for (;;) {
      const { value, done } = await reader.read(); if (done) break;
      size += value.length;
      if (size > LIMIT) { await reader.cancel(); throw new Error(`${path} 解压后超过 128 MiB 加载上限`); }
      chunks.push(value);
    }
    report({phase, path, fileBytes, fileTotal});
    const bytes = new Uint8Array(size); let offset = 0;
    for (const b of chunks) { bytes.set(b, offset); offset += b.length; }
    if (kind === 'bin') return bytes;
    const text = new TextDecoder().decode(bytes);
    if (kind === 'text') return text;
    try { return JSON.parse(text); } catch { throw new Error(`${path} 不是有效 JSON`); }
  };
  const net = await get(files.size ? source.manifest ?? 'netlist.json' : base.href, 'json', 'manifest');
  if (!net || typeof net !== 'object' || Array.isArray(net)) throw new Error('网表 JSON 必须是对象');
  if (net.recordsFormat && net.recordsFormat !== 'raw') throw new Error('换脑入口支持 raw 变长 records，不支持压缩编码 nlz1（可用 .bin.gz）');
  const records = net.nl_hex ? null : await get(net.records ?? 'netlist.bin', 'bin', 'records');
  report({phase:'verify', path:'NAND / LATCH'});
  const nl = decodeNetlist(net, records);
  if (net.recordsSha256) {
    const raw = records ?? Uint8Array.from(net.nl_hex.replace(/^0x/, '').match(/../g), b => parseInt(b, 16));
    const sha = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', raw)), b => b.toString(16).padStart(2, '0')).join('');
    if (sha !== net.recordsSha256) throw new Error('records SHA-256 不符，文件可能损坏或版本不匹配');
  }
  // Bare build.py recall artifacts are raw bit circuits, never pretend they speak chat.
  net.outputMode ??= net.tokenizer ? 'top-index' : 'bits';
  if (!['bits', 'top-index', 'escape18', 'token-id'].includes(net.outputMode)) throw new Error('未知 outputMode：支持 bits / top-index / escape18 / token-id');
  if (net.outputMode === 'bits') {
    if (net.tokenizer && net.tokenizer.type !== 'integer') throw new Error('bits 模式的 tokenizer 必须是 {"type":"integer"}');
    return { net, records, nl, get };
  }
  const width = net.tokenBits ?? net.wrappedFrom?.width ?? net.nIn - 4;
  const extra = net.wrappedFrom?.extra ?? 0;
  if (net.nOut > 24 || (net.outputMode === 'escape18' && net.nOut !== 18)) throw new Error('聊天输出位数无效；escape18 必须为 18 位');
  if (net.nLatch ? !Number.isInteger(width) || width < 1 || width > 24 || !Number.isInteger(extra) || extra < 0 || extra > 1 || net.nIn - width - extra < 0 || net.nIn - width > 8 : net.nIn < 102 || net.nIn > 110)
    throw new Error('聊天输入布局不支持：递归 tokenBits + 最多 8 控制/随机位；无状态为 6×17 位 + 随机位');
  if (net.toolReplayMaxTokens != null && (!Number.isInteger(net.toolReplayMaxTokens) || net.toolReplayMaxTokens < 1 || net.toolReplayMaxTokens > 512)) throw new Error('toolReplayMaxTokens 必须在 1..512');
  const [tj, tc, top] = await Promise.all([
    get(net.tokenizer ?? 'tokenizer.json'), get(net.tokenizerConfig ?? 'tokenizer_config.json'),
    net.outputMode === 'token-id' ? [] : get(net.top ?? 'top8192.json'),
  ]);
  if (!tj?.model || !tc || typeof tc !== 'object') throw new Error('分词器格式错误：需要 HuggingFace tokenizer JSON 和 config');
  const size = 2 ** (net.outputMode === 'escape18' ? 13 : net.nOut);
  if (net.outputMode !== 'token-id' && (!Array.isArray(top) || top.length !== size || top.some(x => !Number.isInteger(x) || x < 0 || x >= 2 ** 24))) throw new Error(`top 映射必须包含 ${size} 个非负 token ID`);
  if (net.chatTemplate) await get(net.chatTemplate, 'text');
  return { net, records, nl, tj, tc, top, get };
}
