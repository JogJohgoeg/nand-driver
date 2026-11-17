// 门电路大脑：按链上登记核对权重。
// 信任链：BSC SiteRegistry.fileInfo(282.732 容器, "gate/weights.lock.json") 的大小与 sha256
//   → weights.lock.json（6.6 KB，网关取，不行就 readRange 直接读链）
//   → lock 里两份清单的 sha256、36 块原始/压缩的大小与 sha256 → gate-brain.mjs 逐块比。
// 只用 eth_call，不碰钱包。至少两家节点给的大小和 sha256 一致才算数（同 app/loader.js）。
export const LOCK_CFG = {
  registry: '0xd006ffdd5ae313b17729621a00999cd3c71ce5e6',
  container: '0x39d97ab281f04a5bc3aCc562f8DeA3f0b4266aA3',      // 282.732
  path: 'gate/weights.lock.json',
  // 门电路大脑页在主站（nand.aihashrate.stream），链上网关不返回 Access-Control-Allow-Origin，跨源取不到；
  // lock 只有 6.6 KB，readRange 一次就读完，所以默认直接读链。同源部署时可填网关（如 'https://282-732.aihashrate.stream/'）先试网关。
  gateways: [],
  rpcs: ['https://bsc-rpc.publicnode.com', 'https://bsc-dataseed.bnbchain.org', 'https://bsc-dataseed1.binance.org'],
  timeoutMs: 15000,
};
export const LOCK_FORMAT = 'gatebrain-weights-lock-v1';

export class LockError extends Error { constructor(code, message, detail) { super(message); this.code = code; this.detail = detail; } }
// code：lock_net（节点都连不上或不到两家）、lock_disagree（节点说法不一）、lock_missing（链上还没登记）——这三种是「没核对上」，页面照样能用但不显示 ✓；
//       lock_mismatch（拿到的 lock 和登记不符，或 lock 格式不对）——停下，不运行。
export const SOFT = new Set(['lock_net', 'lock_disagree', 'lock_missing']);

const hexOf = b => [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('');
export const sha256hex = async b => hexOf(await crypto.subtle.digest('SHA-256', b));
const word = n => n.toString(16).padStart(64, '0');
const addr = a => '0'.repeat(24) + a.slice(2).toLowerCase();
const str = s => { const h = hexOf(new TextEncoder().encode(s)); return word(h.length / 2) + h + '0'.repeat((64 - h.length % 64) % 64); };
export const SEL = { fileInfo: '6c609107', readRange: '15a4cae2' };   // fileInfo(address,string) / readRange(address,string,uint256,uint256)

async function call(cfg, url, data, fetchImpl) {
  const ac = new AbortController(), tm = setTimeout(() => ac.abort(), cfg.timeoutMs);
  try {
    const r = await fetchImpl(url, { signal: ac.signal, method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_call', params: [{ to: cfg.registry, data }, 'latest'] }) });
    const j = await r.json(); if (!j.result) throw new Error((j.error && j.error.message) || 'no result'); return j.result;
  } finally { clearTimeout(tm); }
}

// fileInfo → (uint32 size, string type, bytes32 sha256, uint40 updatedAt, uint256 chunks)
export async function chainInfo(cfg = LOCK_CFG, fetchImpl = fetch) {
  const data = '0x' + SEL.fileInfo + addr(cfg.container) + word(64) + str(cfg.path);
  const rs = await Promise.all(cfg.rpcs.map(u => call(cfg, u, data, fetchImpl).then(res => {
    const w = i => res.slice(2 + 64 * i, 2 + 64 * (i + 1));
    return { rpc: u, size: parseInt(w(0), 16), sha256: w(2), updatedAt: parseInt(w(3), 16), chunks: parseInt(w(4), 16) };
  }, e => ({ rpc: u, err: String(e && e.message || e) }))));
  const ok = rs.filter(r => !r.err);
  if (ok.length < 2) throw new LockError('lock_net', '连不上区块链节点', rs.map(r => r.err ? `${r.rpc}: ${r.err}` : `${r.rpc}: ok`).join('; '));
  if (ok.some(r => r.sha256 !== ok[0].sha256 || r.size !== ok[0].size)) throw new LockError('lock_disagree', '区块链节点给的记录不一样');
  if (!ok[0].chunks) throw new LockError('lock_missing', '链上还没有登记权重清单', cfg.path);
  return ok[0];
}

export async function readRange(cfg, size, fetchImpl = fetch) {
  const out = new Uint8Array(size); let off = 0;
  while (off < size) {
    const len = Math.min(96000, size - off);
    const res = await call(cfg, cfg.rpcs[0], '0x' + SEL.readRange + addr(cfg.container) + word(128) + word(off) + word(len) + str(cfg.path), fetchImpl);
    const h = res.slice(2), n = parseInt(h.slice(64, 128), 16), d = h.slice(128, 128 + 2 * n);
    if (!n) throw new Error('0 bytes');
    for (let i = 0; i < n; i++) out[off + i] = parseInt(d.substr(2 * i, 2), 16);
    off += n;
  }
  return out;
}

export function validLock(j) {
  return j && j.format === LOCK_FORMAT && j.manifest && /^[0-9a-f]{64}$/.test(j.manifest.sha256) && Number.isInteger(j.manifest.bytes)
    && Array.isArray(j.chunks) && j.chunks.length > 0
    && j.chunks.every(r => Array.isArray(r) && r.length === 5 && typeof r[0] === 'string' && /^[0-9a-f]{64}$/.test(r[2]) && /^[0-9a-f]{64}$/.test(r[4]));
}

// 读链上登记并取回 lock。返回 { lock, sha256, size, source, info }；失败抛 LockError。
export async function readLock(cfg = LOCK_CFG, { fetchImpl = fetch } = {}) {
  const info = await chainInfo(cfg, fetchImpl);
  const tries = [];
  const sources = cfg.gateways.map(g => ['gateway', () => fetchImpl(g + cfg.path, { cache: 'no-store' }).then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.arrayBuffer(); }).then(b => new Uint8Array(b))]);
  sources.push(['chain', () => readRange(cfg, info.size, fetchImpl)]);
  for (const [name, get] of sources) {
    let b; try { b = await get(); } catch (e) { tries.push(`${name}: ${e.message || e}`); continue; }
    const h = await sha256hex(b);
    if (b.length !== info.size || h !== info.sha256) { tries.push(`${name}: ${h.slice(0, 12)}… ${b.length} B ≠ 登记 ${info.sha256.slice(0, 12)}… ${info.size} B`); continue; }
    let j; try { j = JSON.parse(new TextDecoder().decode(b)); } catch { j = null; }
    if (!validLock(j)) throw new LockError('lock_mismatch', '链上登记的权重清单格式不对', name);
    return { lock: j, sha256: h, size: b.length, source: name, info };
  }
  // 登记读到了，但每个来源拿到的都对不上：网关坏了也会走到直接读链；直接读链都对不上就是真不符
  const allNet = tries.every(t => !t.includes('≠'));
  throw new LockError(allNet ? 'lock_net' : 'lock_mismatch', allNet ? '取不到权重清单' : '取到的权重清单和链上登记的不一样', tries.join('; '));
}

// 给 gate-brain.mjs 用：清单字节是否等于 lock 里登记的那份
export async function manifestMatches(lock, manBytes) {
  return manBytes.length === lock.manifest.bytes && (await sha256hex(manBytes)) === lock.manifest.sha256;
}
// lock 的每块是否和（已核过的）manifest 的每块一致——两者本该同源，多核一道便宜
export function chunksAgree(lock, man) {
  return lock.chunks.length === man.chunks.length && lock.chunks.every((r, i) => r[0] === man.chunks[i].file && r[1] === man.chunks[i].bytes && r[2] === man.chunks[i].sha256);
}
// 由 lock 直接给出压缩块列表（不再另取 manifest.gz.json）
export function gzFromLock(lock) {
  return { format: 'gatesim-weights-gz-v1', total_bytes: lock.total_gz_bytes, chunks: lock.chunks.map(r => ({ file: r[0] + '.gz', bytes: r[3], sha256: r[4], of: r[0] })) };
}

// 下载一块并核对。raw = { file, bytes, sha256 }（manifest 的一块），gz = 同块压缩包 { file, bytes, sha256 } 或 null。
// checkGz：压缩包先比 gz.sha256（有 lock 时为真），坏包不解压。网络出错按 retryDelays 只重试这一块；内容不符绕开缓存重下 1 次，再不符抛 fail('chunk_sha')。
// abort()：别的块已失败时返回那个错误，本块不再重试。返回原始字节（Uint8Array）。
export async function fetchVerifiedChunk({ base, raw, gz = null, checkGz = false, retryDelays = [2000, 5000, 10000], fetchImpl = fetch,
  sleep = ms => new Promise(r => setTimeout(r, ms)), abort = () => null, onRetry = () => { }, onRecheck = () => { },
  fail = (code, name) => new LockError(code, `${code} ${name}`) }) {
  const name = gz ? gz.file : raw.file; let bad = 0, netTry = 0;
  for (; ;) {
    let b;
    try {
      const r = await fetchImpl(base + name, netTry || bad ? { cache: 'reload' } : undefined); if (!r.ok) throw new Error('HTTP ' + r.status);
      b = new Uint8Array(await r.arrayBuffer());   // 托管端若已按 Content-Encoding 解过压，拿到的就是原始字节；只在见到 gzip 魔数时自己解
      if (gz && b[0] === 0x1f && b[1] === 0x8b) {
        if (checkGz && (b.length !== gz.bytes || (await sha256hex(b)) !== gz.sha256)) b = null;
        else b = new Uint8Array(await new Response(new Blob([b]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer());
      }
    } catch (e) {
      const other = abort(); if (other) throw other;
      if (netTry >= retryDelays.length) throw fail(String(e.message || e), name);
      onRetry(++netTry, e); await sleep(retryDelays[netTry - 1]); continue;
    }
    if (b && b.length === raw.bytes && (await sha256hex(b)) === raw.sha256) return b;
    if (++bad > 1) throw fail('chunk_sha', name);
    onRecheck();
  }
}
