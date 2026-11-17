// 图库核对。
// 信任链：BSC SiteRegistry.fileInfo(282.732, "gallery/gallery.lock.json") 的大小和 sha256（至少两家节点一致，读法同 gate/chain_lock.mjs）
//   → gallery.lock.json（4 KB；先取同源那份，对不上再 readRange 直接读链）
//   → lock 里每颗芯片的瓦片清单 / 大图 / pic 数据的大小和 sha256 → 瓦片清单里每张瓦片的大小和 sha256。
// 每个文件都用 fetch() 取字节、比大小和 sha256，对上了才转成 blob: URL 给页面用；不用 <img src> 直取（那样核不了）。
// 文件对不上：绕开缓存重下一次，还不对就报错（出错文案由页面写）。同一个文件核过一次就记在内存里。
//
// 失败分级（和门电路大脑的做法相同）：
//   读不到链上登记（断网、节点说法不一、链上还没登记）→ 照样用同源的 lock 核文件，lockState().chain = 'soft'，页面写「这次没核对上链登记」；
//   链上登记读到了，lock 却对不上 → loadLock() 抛 CheckError('mismatch')，页面整页不显示图；
//   本机样板（127.0.0.1 / localhost）：这批还没上链，按发布清单 pending.json 核 lock，chain = 'pending'（同 app/loader.js 的做法，正式网址上不读）。
// 只用 eth_call，不碰钱包。
// chain_lock.mjs 用动态 import：这个模块加载失败（404、类型不对、一直不回）不能拖垮整页，落到「这次没核对上链登记」。
const CHAIN_MODULE = new URL('../gate/chain_lock.mjs', import.meta.url).href;
const MODULE_TIMEOUT_MS = 8000, FILE_TIMEOUT_MS = 30000;
const timed = (p, ms, what) => { let t; return Promise.race([p, new Promise((_, rej) => { t = setTimeout(() => rej(new Error(what + '超时')), ms); })]).finally(() => clearTimeout(t)); };

const HERE = new URL('./', import.meta.url);     // 本目录：…/gallery/
const ROOT = new URL('../', import.meta.url);    // 站点根（282.732 网关 / 主站 / 本机）
export const LOCAL = /^(127\.0\.0\.1|localhost|\[::1\])$/.test(location.hostname);
export const LOCK_PATH = 'gallery/gallery.lock.json';
export const BASE = 'https://nand.aihashrate.stream/gallery/';
// lock 只有 4 KB：同源那份先试（网关、主站上都有同一份），不对再直接读链
// 页面读的：onChain = 这次和链上登记核对上了；pending = 本机样板，按这批待上链的发布清单核的
export const CFG = { get onChain() { return state.chain === 'ok'; }, get pending() { return state.chain === 'pending'; } };
// 自测负控用（只在本机）：?files=/bad/gallery/ 换一个会改字节的来源；正式网址上不认
const FILES_OVERRIDE = LOCAL && new URLSearchParams(location.search).get('files');

const hex = (b) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join('');
export const sha256 = async (buf) => hex(await crypto.subtle.digest('SHA-256', buf));

export class CheckError extends Error {
  constructor(kind, path, detail = '') { super(kind === 'net' ? '下载不到' : '和登记的不一样'); this.kind = kind; this.path = path; this.detail = detail; }
}

export const stats = { ok: 0, bad: 0, bytes: 0 };
let state = { chain: 'checking', sha256: '', bytes: 0, source: '', detail: '' };
// chain：'ok' 和链上登记一致 / 'pending' 本机样板，和这批待上链的发布清单一致 / 'soft' 这次没核对上链登记 / 'checking'
export const lockState = () => ({ ...state });
// 页面写的话：没核到链上登记时要明说，不能只有一个 ✓
export const chainNote = () => { const s = state.chain;
  return s === 'ok' ? '' : s === 'pending' ? '本机样板：这批还没上链，这次按待上链的发布清单核。' : '这次没核对上链登记（节点连不上，或核对模块没加载成功），只核到了登记清单。可以刷新再试。'; };
export const okWord = () => (state.chain === 'ok' ? '已核对' : state.chain === 'pending' ? '已核对（本机）' : '只核到清单');

async function fetchT(url, opt = {}, ms = FILE_TIMEOUT_MS) {   // 一直不回的请求也要落到「下载不到」，不能永远转圈
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), ms);
  try { const r = await fetch(url, { ...opt, signal: ctl.signal }); if (!r.ok) throw new Error(String(r.status)); return await r.arrayBuffer(); }
  finally { clearTimeout(t); }
}

async function getChecked(url, row, path) {
  for (let i = 0; i < 2; i++) {
    let buf;
    try {
      buf = await fetchT(url, { cache: i ? 'reload' : 'default' });
    } catch (e) { if (i) throw Object.assign(new CheckError('net', path), { slow: !!e && e.name === 'AbortError' }); continue; }      // slow：是等到超时才失败的，不是立刻取不到
    if (buf.byteLength === row.bytes && (await sha256(buf)) === row.sha256) return buf;
    if (i) throw new CheckError('mismatch', path);
  }
}

async function sameOrigin() {
  try {
    return new Uint8Array(await fetchT(new URL(LOCK_PATH, ROOT), { cache: 'no-cache' }, 15000));
  } catch { return null; }
}

async function pendingRow() {
  if (!LOCAL) return null;
  try {
    const r = await fetch(new URL('pending.json', ROOT), { cache: 'no-store' });
    const j = r.ok ? await r.json() : {};
    return (j.files || {})[LOCK_PATH] || null;
  } catch { return null; }
}

const same = async (b, size, h) => b && b.length === size && (await sha256(b)) === h;

export function validLock(j) {
  return j && j.format === 'gallery-lock-v1' && String(j.cols) === 'path,bytes,sha256' && typeof j.base === 'string' && /^https:\/\//.test(j.base)
    && Array.isArray(j.files) && j.files.every((r) => Array.isArray(r) && r.length === 3 && typeof r[0] === 'string' && Number.isInteger(r[1]) && /^[0-9a-f]{64}$/.test(r[2]));
}

// 读出并核对登记清单。→ { rows: Map(path → {bytes, sha256}), sha256, bytes, base, files（取文件的地址）, chain }
async function readLock() {
  let b = await sameOrigin(), chain = 'soft', detail = '', source = 'same-origin';
  let info = null, err = null, mod = null;
  try { mod = await timed(import(CHAIN_MODULE), MODULE_TIMEOUT_MS, '加载核对模块'); } catch (e) { detail = '核对链上登记的模块没加载成功：' + (e.message || e); }
  const LCFG = mod && { ...mod.LOCK_CFG, path: LOCK_PATH, gateways: [ROOT.href], timeoutMs: 8000 };
  if (mod) { try { info = await mod.chainInfo(LCFG); } catch (e) { err = e; } }
  if (info) {
    if (await same(b, info.size, info.sha256)) chain = 'ok';
    else {
      const p = await pendingRow();     // 本机样板：同源这份是这批要传的新版
      if (p && (await same(b, p.size, p.sha256))) { chain = 'pending'; detail = '链上是上一版，本机是这批待上链的'; }
      else {
        let c = null;
        try { c = await mod.readRange(LCFG, info.size); } catch (e) { detail = String(e.message || e); }
        if (await same(c, info.size, info.sha256)) { b = c; chain = 'ok'; source = 'chain'; }
        else if (c) throw new CheckError('mismatch', 'gallery.lock.json', '取到的登记清单和链上登记的不一样');
        else { chain = 'soft'; detail = detail || '直接读链也没读到'; }
      }
    }
  } else if (!mod || mod.SOFT.has(err.code)) {
    const p = await pendingRow();
    if (p) {
      if (!(await same(b, p.size, p.sha256))) throw new CheckError('mismatch', 'gallery.lock.json', '和这批待上链的发布清单不一样');
      chain = 'pending';
    }
    if (err) detail = err.message;
  } else throw new CheckError('mismatch', 'gallery.lock.json', err.message);
  if (!b) throw new CheckError('net', 'gallery.lock.json', detail);
  let j; try { j = JSON.parse(new TextDecoder().decode(b)); } catch { j = null; }
  if (!validLock(j)) throw new CheckError('mismatch', 'gallery.lock.json', '登记清单格式不对');
  const h = await sha256(b);
  // 取文件：本机和主站同源就读本目录；从 282.732 网关打开时跨站读 lock 里写的主站（主站 _headers 给 /gallery/* 开了 CORS）
  const files = FILES_OVERRIDE ? new URL(FILES_OVERRIDE, location.href) : LOCAL || HERE.origin === new URL(j.base).origin ? HERE : new URL(j.base);
  state = { chain, sha256: h, bytes: b.length, source, detail };
  return { rows: new Map(j.files.map(([p, bytes, s]) => [p, { bytes, sha256: s }])), sha256: h, bytes: b.length, base: j.base, files, chain };
}

let lockP;
export function loadLock() {
  return (lockP ??= readLock().catch((e) => { lockP = null; state = { ...state, chain: 'failed', detail: e.detail || e.message }; throw e; }));
}

const blobs = new Map();
function typeOf(p) { return p.endsWith('.webp') ? 'image/webp' : p.endsWith('.json') ? 'application/json' : 'application/octet-stream'; }

// 核过的文件 → blob: URL（同一路径只核一次；失败的不缓存，可以重试）
export function checkedURL(path, row) {
  if (!blobs.has(path)) {
    blobs.set(path, loadLock().then((L) => getChecked(new URL(path, L.files), row, path)).then(
      (buf) => { stats.ok++; stats.bytes += buf.byteLength; return URL.createObjectURL(new Blob([buf], { type: typeOf(path) })); },
      (e) => { stats.bad++; blobs.delete(path); throw e; }));
  }
  return blobs.get(path);
}

export async function checkedJSON(path, row) {
  const url = await checkedURL(path, row);
  return (await fetch(url)).json();
}

// 这颗芯片的瓦片清单：先比登记清单里的那一行，再查格式头。没有瓦片的芯片返回 null。
export async function chipManifest(tid) {
  const L = await loadLock();
  const p = `tiles/${tid}/manifest.json`, row = L.rows.get(p);
  if (!row) return null;
  const buf = await getChecked(new URL(p, L.files), row, p);
  let m; try { m = JSON.parse(new TextDecoder().decode(buf)); } catch { m = null; }
  if (!m || m.format !== 'gallery-tiles-v1' || m.tid !== tid || String(m.cols) !== 'path,bytes,sha256'
    || !m.files.every(([q]) => q.startsWith(`tiles/${tid}/`))) throw new CheckError('mismatch', p);
  return { rows: new Map(m.files.map(([q, bytes, h]) => [q, { bytes, sha256: h }])), sha256: row.sha256, n: m.files.length };
}

// 只读 eth_call：circuitInfo(id) → [输入, 输出, 状态位, 门数]；两家节点答案一致才算数
export async function circuitInfo(chain, cpu, id) {
  const data = '0x084d60f1' + id.toString(16).padStart(64, '0');
  const got = []; let busy = false;
  for (const rpc of chain.rpcs) {   // 哪家限流（429）或不通就换下一家，直到凑够两家
    try { got.push(await ethCall(rpc, cpu, data).then((h) => [0, 1, 2, 3].map((k) => parseInt(h.slice(k * 64, k * 64 + 64), 16)))); } catch (e) { busy ||= !!e.busy; continue; }
    if (got.length === 2) break;
  }
  if (got.length < 2 && busy) throw Object.assign(new Error('busy'), { busy: true });
  if (got.length < 2 || String(got[0]) !== String(got[1])) return null;
  return got[0];
}

// 只读 eth_call，返回去掉 0x 的十六进制；8 秒超时。节点限流（HTTP 429 或限流报错）时抛出带 busy 标记的错误，调用方换下一家
export async function ethCall(rpc, to, data) {
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 8000);
  try {
    const r = await fetch(rpc, { method: 'POST', headers: { 'content-type': 'application/json' }, signal: ctl.signal,
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_call', params: [{ to, data }, 'latest'] }) });
    if (r.status === 429) throw Object.assign(new Error('busy'), { busy: true });
    const j = await r.json();
    if (!j.result) throw Object.assign(new Error((j.error && j.error.message) || 'no result'), { busy: !!j.error && (j.error.code === -32005 || j.error.code === 429 || /rate|limit|too many|capacity/i.test(j.error.message || '')) });
    return j.result.slice(2);
  } finally { clearTimeout(t); }
}
