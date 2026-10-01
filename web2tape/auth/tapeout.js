// 身份验证器 · TapeOut 链上读写。代码 MIT。
// 合约地址取自 TapeKit 内核配置（hashport/shortlink/src/kernel/config.js）。读链直连各链公共节点（页面 CSP 只放行这几个节点），
// 写入交易一律交给钱包签名发送。备份存成用户自己电路容器里的一个站点文件（SiteRegistry.putFile），不部署任何合约。
// 浏览器与 Node（≥ 20）通用。测试时可设 globalThis.__TAPEOUT_RPC__ 把读取指向本地分叉节点：字符串 = 所有链，{ xlayer: url } = 只换这条链。
import { t } from './i18n.js';

export const BACKUP_PATH = '.authenticator/backup.bin';
export const BACKUP_TYPE = 'application/octet-stream';
export const CHUNK = 24000;                                         // SiteRegistry 每块上限（TapeKit 规范附录 B.5）
const IMPL_SLOT = '0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc';
const MULTICALL3 = '0xca11bde05977b3631167028862be2a173976ca11';

export const SEL = {
  operatorOf: '0x636f35d3', operatorUntil: '0xc85cf62b',   // SiteRegistry：容器当前的操作员与到期时间（同一时间只有一个）
  cpuCount: '0xa94da8a7', cpuAt: '0x4bc7cbbd', balanceOf: '0x70a08231', nextId: '0x61b8ce8c', ownerOf: '0x6352211e',
  accountOf: '0x0c1905e5', isOpened: '0x8b508494', owner: '0x8da5cb5b',
  fileInfo: '0x6c609107', read: '0xccaa7afb', putFile: '0xfab2ed82', appendChunk: '0xe2b51347', aggregate3: '0x82ad56cb',
  pathCount: '0xb554782b', pathsRange: '0xb056072c', containerPaidUntil: '0x9ebfd859',
};

const L2 = { factory: '0x1f09daefa827f02cbb40967cc91b259763760761', opener: '0x536add8f30f03b69f6fbf29d425a816a0dc50106',
  registry: '0xd6efb7adcc9c83dc4924ad56f6a8e4e969b9adb6', registryImpl: ['0xa85c4143d1d4a77f54b8e4ecc9e6d1418afea45f'] };
export const NETS = [
  { key: 'bsc', name: 'BNB Chain', chainId: 56, tag: null, currency: 'BNB',
    factory: '0x68224f668083c29e9800be2a646d42d18cedf7e2', opener: '0x021745de2f42a7839d96f2d3634d0294487d81f1',
    registry: '0xd006ffdd5ae313b17729621a00999cd3c71ce5e6', registryImpl: ['0x1d279d138a4d803378a7d4557c056f1bed53c261'],
    rpcs: ['https://bsc-dataseed.bnbchain.org', 'https://bsc-rpc.publicnode.com'], explorer: 'https://bscscan.com/tx/',
    wallet: { chainId: '0x38', chainName: 'BNB Smart Chain', rpcUrls: ['https://bsc-dataseed.bnbchain.org'],
      nativeCurrency: { name: 'BNB', symbol: 'BNB', decimals: 18 }, blockExplorerUrls: ['https://bscscan.com'] } },
  { key: 'xlayer', name: 'X Layer', chainId: 196, tag: 2, currency: 'OKB', ...L2,
    rpcs: ['https://rpc.xlayer.tech', 'https://xlayerrpc.okx.com', 'https://xlayer.drpc.org'],   // 前两个都是 OKX 的：多节点核对要有一家别的运营方（dRPC）
    explorer: 'https://www.oklink.com/xlayer/tx/',
    wallet: { chainId: '0xc4', chainName: 'X Layer', rpcUrls: ['https://rpc.xlayer.tech'],
      nativeCurrency: { name: 'OKB', symbol: 'OKB', decimals: 18 }, blockExplorerUrls: ['https://www.oklink.com/xlayer'] } },
  { key: 'base', name: 'Base', chainId: 8453, tag: 3, currency: 'ETH', ...L2,
    rpcs: ['https://mainnet.base.org', 'https://base-rpc.publicnode.com'], explorer: 'https://basescan.org/tx/',
    wallet: { chainId: '0x2105', chainName: 'Base', rpcUrls: ['https://mainnet.base.org'],
      nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 }, blockExplorerUrls: ['https://basescan.org'] } },
];
export const netOf = (key) => NETS.find((n) => n.key === key);

// ---------------- 编码 ----------------
const te = new TextEncoder(), td = new TextDecoder();
export const hex = (u8) => Array.from(u8, (b) => b.toString(16).padStart(2, '0')).join('');
export function unhex(s) {
  s = String(s).replace(/^0x/, '');
  if (s.length % 2) s = '0' + s;
  return Uint8Array.from(s.match(/../g) || [], (b) => parseInt(b, 16));
}
const w = (x) => BigInt(x).toString(16).padStart(64, '0');
const wa = (a) => a.toLowerCase().replace(/^0x/, '').padStart(64, '0');
const dyn = (u8) => w(u8.length) + hex(u8).padEnd(Math.ceil(u8.length / 32) * 64, '0');
/** 按 ABI 编码参数：{ t: 'addr' | 'uint' | 'b32' | 'str' | 'bytes', v } */
export function encodeArgs(args) {
  let head = '', tail = '';
  for (const a of args) {
    if (a.t === 'addr') head += wa(a.v);
    else if (a.t === 'uint') head += w(a.v);
    else if (a.t === 'b32') head += a.v.replace(/^0x/, '').padStart(64, '0');
    else { head += w(args.length * 32 + tail.length / 2); tail += dyn(a.t === 'str' ? te.encode(a.v) : a.v); }
  }
  return head + tail;
}
export const call = (sel, args = []) => sel + encodeArgs(args);
const big = (b) => BigInt('0x' + (hex(b) || '0'));
const wordAt = (d, off) => d.subarray(off, off + 32);
const addrAt = (d, off) => '0x' + hex(d.subarray(off + 12, off + 32));
const dynAt = (d, off) => d.subarray(off + 32, off + 32 + Number(big(wordAt(d, off))));

export function encodeAggregate3(calls) {
  const elems = calls.map((c) => wa(c.target) + w(1) + w(0x60) + dyn(unhex(c.data)));
  let offsets = '', acc = calls.length * 32;
  for (const e of elems) { offsets += w(acc); acc += e.length / 2; }
  return SEL.aggregate3 + w(0x20) + w(calls.length) + offsets + elems.join('');
}
export function decodeAggregate3(retHex) {
  const d = unhex(retHex);
  const arr = Number(big(wordAt(d, 0))), n = Number(big(wordAt(d, arr))), base = arr + 32;
  return Array.from({ length: n }, (_, i) => {
    const off = base + Number(big(wordAt(d, base + 32 * i)));
    return { ok: big(wordAt(d, off)) === 1n, data: dynAt(d, off + Number(big(wordAt(d, off + 32)))) };
  });
}

// ---------------- 读链 ----------------
let rid = 0;
export async function rpc(net, method, params) {
  const o = globalThis.__TAPEOUT_RPC__;
  const urls = typeof o === 'string' ? [o] : o && o[net.key] ? [o[net.key]] : net.rpcs;
  let last = null;
  for (const url of urls) {
    let j;
    try {
      const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: ++rid, method, params }) });
      j = await r.json();
    } catch (e) { last = e; continue; }                             // 节点连不上：换下一个
    if (!j.error) return j.result;
    // 节点的原话会显示在应用的提示条里：加上前缀、截短，免得作假的节点借它说「请访问……修复」
    const raw = String(j.error.message || '');
    const e = Object.assign(new Error(raw ? t('节点返回错误：{0}', raw.slice(0, 100)) : t('节点返回错误')), { code: j.error.code, data: j.error.data, raw });
    if (j.error.code === 3 || /revert/i.test(raw)) throw e;          // 合约回滚是真结果，不换节点
    last = e;
  }
  if (last && !(last instanceof TypeError)) throw last;                // 节点返回的错误原样抛出；fetch 失败换成看得懂的说法
  throw Object.assign(new Error(t('连不上 {0} 的节点，检查网络后重试', net.name)), { cause: last });
}
export async function ethCall(net, to, data, block = 'latest') {
  return unhex(await rpc(net, 'eth_call', [{ to, data }, block]));
}
/** Multicall3 批量只读调用（允许单个失败），每批 batch 个、同时最多 parallel 批；返回 [{ ok, data }]，与 calls 一一对应 */
export async function multicall(net, calls, batch = 400, parallel = 4) {
  const parts = [];
  for (let i = 0; i < calls.length; i += batch) parts.push(calls.slice(i, i + batch));
  const out = new Array(parts.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(parallel, parts.length) }, async () => {
    while (next < parts.length) {
      const k = next++;
      out[k] = decodeAggregate3(await rpc(net, 'eth_call', [{ to: MULTICALL3, data: encodeAggregate3(parts[k]) }, 'latest']));
    }
  }));
  return out.flat();
}
export const tapeIdOf = (net, circuitId, cpuIndex) => (net.tag == null ? `${circuitId}.${cpuIndex}` : `${circuitId}.${net.tag}.${cpuIndex}`);

/** 找出 owner 在这条链上持有的电路与容器：逐台处理器查 balanceOf → 有持仓的查 ownerOf(0..nextId) → accountOf / isOpened。
 *  与 tapeid_coin/src/holdings.js 同一做法（处理器合约没有 tokenOfOwnerByIndex，也不扫日志）。 */
export async function findCircuits(net, owner, onProgress) {
  const n = Number(big(await ethCall(net, net.factory, SEL.cpuCount)));
  const cpus = (await multicall(net, Array.from({ length: n }, (_, i) => ({ target: net.factory, data: call(SEL.cpuAt, [{ t: 'uint', v: i }]) }))))
    .map((r) => (r.ok && r.data.length >= 32 ? addrAt(r.data, 0) : null));
  const live = cpus.map((c, i) => [i, c]).filter(([, c]) => c);
  const bals = await multicall(net, live.map(([, c]) => ({ target: c, data: call(SEL.balanceOf, [{ t: 'addr', v: owner }]) })));
  const held = live.filter((_, k) => bals[k].ok && big(bals[k].data) > 0n);
  if (onProgress) onProgress(t('{0}：{1} 台处理器，{2} 台上有你的电路', net.name, n, held.length));
  if (!held.length) return [];
  const nexts = await multicall(net, held.map(([, c]) => ({ target: c, data: SEL.nextId })));
  const pairs = held.flatMap(([i, c], k) => (nexts[k].ok ? Array.from({ length: Number(big(nexts[k].data)) + 1 }, (_, id) => [i, c, id]) : []));
  const owners = await multicall(net, pairs.map(([, c, id]) => ({ target: c, data: call(SEL.ownerOf, [{ t: 'uint', v: id }]) })));
  const me = owner.toLowerCase();
  const mine = pairs.filter((_, k) => owners[k].ok && owners[k].data.length >= 32 && addrAt(owners[k].data, 0) === me);
  const acc = await multicall(net, mine.flatMap(([, c, id]) => [
    { target: net.opener, data: call(SEL.accountOf, [{ t: 'addr', v: c }, { t: 'uint', v: id }]) },
    { target: net.opener, data: call(SEL.isOpened, [{ t: 'addr', v: c }, { t: 'uint', v: id }]) }]));
  return mine.map(([cpuIndex, cpu, circuitId], k) => ({
    net: net.key, cpuIndex, cpu, circuitId, tapeId: tapeIdOf(net, circuitId, cpuIndex),
    container: acc[2 * k].ok ? addrAt(acc[2 * k].data, 0) : null,
    opened: acc[2 * k + 1].ok && big(acc[2 * k + 1].data) === 1n,
  }));
}

/** 容器里某个文件的信息；没有这个文件时 size = 0 */
const decodeFileInfo = (d) => ({ size: Number(big(wordAt(d, 0))), contentType: td.decode(dynAt(d, Number(big(wordAt(d, 32))))),
  sha: '0x' + hex(wordAt(d, 64)), updatedAt: Number(big(wordAt(d, 96))), chunks: Number(big(wordAt(d, 128))) });
export async function fileInfo(net, container, path = BACKUP_PATH, block = 'latest') {
  return decodeFileInfo(await ethCall(net, net.registry, call(SEL.fileInfo, [{ t: 'addr', v: container }, { t: 'str', v: path }]), block));
}
/** 同时问这条链的每个公共节点，核对文件信息一致。一个节点就能把链上历史里的旧密文当成最新的给你、再把写入时间改成刚刚
 *  （新设备第一次恢复时察觉不到），或者藏起新备份；两个不同运营方的节点都这么做才骗得过。
 *  返回 { info, checked（参与核对的节点数） }；不一致时抛 { conflict: true }。测试里指定了单个节点时不核对 */
/** 同一个 eth_call 问这条链的每个公共节点，取各自的结果（连不上的是 null）。测试里指定了单个节点时只问它 */
async function callEach(net, to, data) {
  const o = globalThis.__TAPEOUT_RPC__;
  if (typeof o === 'string' || (o && o[net.key])) return [await ethCall(net, to, data)];
  const got = await Promise.all(net.rpcs.map(async (url) => {
    try {
      const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: ++rid, method: 'eth_call', params: [{ to, data }, 'latest'] }) });
      const j = await r.json();
      return j.error ? null : unhex(j.result);
    } catch { return null; }
  }));
  return got.some(Boolean) ? got.filter(Boolean) : [await ethCall(net, to, data)];   // 都连不上：走平常的换节点逻辑（它会报错）
}
export async function fileInfoCross(net, container, path = BACKUP_PATH) {
  const got = (await callEach(net, net.registry, call(SEL.fileInfo, [{ t: 'addr', v: container }, { t: 'str', v: path }]))).map(decodeFileInfo);
  if (got.some((x) => x.sha !== got[0].sha || x.size !== got[0].size)) throw Object.assign(new Error(t('{0} 的两个公共节点给出的备份不一样：可能有节点被篡改，也可能刚备份过、还没同步。过一会儿再试；一直不一样的话先别恢复。', net.name)), { conflict: true });
  return { info: got[0], checked: got.length };
}
/** 最近一小时多（约 65 分钟）里这个文件有没有被「原样写回」过：每次备份都用新的随机数加密，同一份密文不会合法地出现两次。
 *  当前这份的 SHA-256 在更早的写入事件里出现过、中间又写过别的，就是有人把旧密文写回来了（回滚）。更早的回滚由「生成时间比
 *  上链时间早一小时以上」那条查（见 app.js applyRemote）；两条合起来，新设备第一次恢复也查得出。
 *  公共节点给事件的范围各不相同（BNB Chain：publicnode 约 1 万块内、每次 5000 块，bsc-dataseed 不给；Base 较宽；X Layer 每次只给
 *  100 块、限流）：限时查，没看全又没找到时返回 null（不知道），不下结论 */
const WRITE_TOPIC = '0x13b9b0f05b22c496a9d9a29e7041c56c04670dc98ab327448870f18eb07b6773';   // SiteRegistry 写文件（putFile）：container 索引；data = path, size, sha256, contentType
const BLOCK_SEC = { bsc: 0.45, xlayer: 1, base: 2 };
export async function replayedRecently(net, container, sha, path = BACKUP_PATH, budgetMs = 6000) {
  const r = await recentWrites(net, container, path, budgetMs);
  if (!r) return null;
  const last = r.writes.map((w) => w.sha).lastIndexOf(sha);
  for (let i = 0; i < last; i++) if (r.writes[i].sha === sha && r.writes.slice(i + 1, last).some((w) => w.sha !== sha)) return true;
  return r.complete ? false : null;                  // 没看全又没找到：不知道
}
/** 最近约 65 分钟里有没有写入过这份（SHA-256）：true 有，false 看全了没有，null 不知道。备份后核对「真的上链了没有」用 */
export async function writtenRecently(net, container, sha, path = BACKUP_PATH, budgetMs = 6000) {
  const r = await recentWrites(net, container, path, budgetMs);
  if (!r) return null;
  return r.writes.some((w) => w.sha === sha) ? true : r.complete ? false : null;
}
/** 最近约 65 分钟里这个文件的写入事件（按先后），{ writes: [{ block, index, sha }], complete }；没有节点给事件时 null */
async function recentWrites(net, container, path, budgetMs) {
  const deadline = Date.now() + budgetMs;              // 最多查这么久：X Layer 的节点一次只给 100 块、还限流，查满一小时要 20 秒以上
  const o = globalThis.__TAPEOUT_RPC__;
  const urls = typeof o === 'string' ? [o] : o && o[net.key] ? [o[net.key]] : net.rpcs;
  for (const url of urls) {
    const call = async (method, params) => { const j = await (await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: ++rid, method, params }) })).json(); if (j.error) throw new Error(j.error.message); return j.result; };
    const topics = [WRITE_TOPIC, '0x' + container.slice(2).toLowerCase().padStart(64, '0')];
    const logs = (from, to) => call('eth_getLogs', [{ address: net.registry, topics, fromBlock: '0x' + from.toString(16), toBlock: '0x' + to.toString(16) }]);
    let head;
    try { head = parseInt(await call('eth_blockNumber', []), 16); await logs(Math.max(0, head - 7), head); } catch { continue; }   // 先试一小段：不给事件的节点直接换下一个
    // 要往回看多少块：按实测的出块间隔（链会提速，写死的间隔会让「约 65 分钟」缩水，和「早于上链一小时」那条之间漏出空档）；量不了才用常数
    let perBlock = BLOCK_SEC[net.key] || 1;
    try {
      const ts = async (n) => parseInt((await call('eth_getBlockByNumber', ['0x' + n.toString(16), false])).timestamp, 16);
      const [t1, t0] = await Promise.all([ts(head), ts(Math.max(0, head - 1000))]);
      if (t1 > t0) perBlock = Math.min(perBlock, (t1 - t0) / Math.min(1000, head));
    } catch { /* 用常数 */ }
    const want = Math.ceil(3900 / perBlock);
    // 每个节点一次能查的范围不同（BNB Chain publicnode 约 5000 块、X Layer 只有 100 块），更早的块有的节点也不给（分叉链上
    // 分叉点之前同样取不到）。从最新往回取；一段取不到就对半拆开再取（先新后旧），拆到很小还不行才放弃那一小段，边界两边能取的都取到
    const floor = Math.max(0, head - want + 1), writes = [];
    let complete = true;
    const grab = async (from, to) => {
      if (Date.now() > deadline) { complete = false; return; }
      try {
        for (const l of await logs(from, to)) {
          const d = unhex(l.data);
          if (td.decode(dynAt(d, Number(big(wordAt(d, 0))))) !== path) continue;
          writes.push({ block: parseInt(l.blockNumber, 16), index: parseInt(l.logIndex, 16), sha: '0x' + hex(wordAt(d, 64)) });
        }
      } catch {
        if (to - from < 8) { complete = false; return; }
        const mid = Math.floor((from + to) / 2);
        await grab(mid + 1, to); await grab(from, mid);
      }
    };
    await grab(floor, head);
    writes.sort((a, b) => a.block - b.block || a.index - b.index);
    return { writes, complete };
  }
  return null;
}
/** 容器里的文件数，每个公共节点核对一致（授权设备钥匙前要确认容器里没有网站文件，单个节点可以瞒报） */
export async function pathCountCross(net, container) {
  const got = (await callEach(net, net.registry, call(SEL.pathCount, [{ t: 'addr', v: container }]))).map((d) => Number(big(d)));
  if (got.some((x) => x !== got[0])) throw Object.assign(new Error(t('{0} 的两个公共节点给出的容器文件数不一样，先别授权，过一会儿再试。', net.name)), { conflict: true });
  return got[0];
}
/** 容器里的全部文件路径（SiteRegistry.pathCount / pathsRange） */
export async function listFiles(net, container) {
  const n = Number(big(await ethCall(net, net.registry, call(SEL.pathCount, [{ t: 'addr', v: container }]))));
  const out = [];
  for (let i = 0; i < n; i += 200) {
    const d = await ethCall(net, net.registry, call(SEL.pathsRange, [{ t: 'addr', v: container }, { t: 'uint', v: i }, { t: 'uint', v: Math.min(200, n - i) }]));
    const arr = Number(big(wordAt(d, 0))), len = Number(big(wordAt(d, arr))), base = arr + 32;
    for (let j = 0; j < len; j++) out.push(td.decode(dynAt(d, base + Number(big(wordAt(d, base + 32 * j))))));
  }
  return out;
}
/** 名字（DomainBinding）付费到什么时候（秒；0 = 没付）。网关只显示付过费的容器 */
export async function paidUntil(net, binding, container) {
  return Number(big(await ethCall(net, binding, call(SEL.containerPaidUntil, [{ t: 'addr', v: container }]))));
}
export const sha256 = async (bytes) => '0x' + hex(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)));
/** 读文件并与链上记录的 SHA-256 核对 */
export const MAX_BACKUP = 256 * 1024;
export async function readFile(net, container, path = BACKUP_PATH) {
  // 文件信息和内容在同一个区块上取：分两次按 latest 取，中间别的设备刚好写了一次，就会对不上、被当成坏文件（进而问要不要覆盖掉那台设备刚写的）。
  // 真对不上再换个区块重取一次，还不对才算坏
  for (let attempt = 0; ; attempt++) {
    const block = await rpc(net, 'eth_blockNumber', []);
    const info = await fileInfo(net, container, path, block);
    if (!info.size) return null;
    // 备份很小（30 个帐号约 800 字节，1000 个也不到 30 KB）：大得离谱的是有写入权限的人塞进来的，不去读它
    // badFile：文件本身不对（太大、哈希对不上），调用方当「解不开」处理、给人覆盖的机会——不然写一次就能让人再也备份不了
    if (path === BACKUP_PATH && info.size > MAX_BACKUP) throw Object.assign(new Error(t('容器里的备份文件大得不正常（{0} 字节），没有读取。可能有人往里面塞了别的东西。', info.size)), { badFile: true });
    const d = await ethCall(net, net.registry, call(SEL.read, [{ t: 'addr', v: container }, { t: 'str', v: path }]), block);
    const bytes = dynAt(d, Number(big(wordAt(d, 0)))).slice();
    if (bytes.length === info.size && (await sha256(bytes)) === info.sha) return { bytes, info };
    if (attempt) throw Object.assign(new Error(t('链上文件与记录的哈希不符')), { badFile: true });
  }
}
/** SiteRegistry 是可升级代理：实现换成了没核对过的版本就停用（与 TapeKit 内核的做法一致） */
export async function checkRegistry(net) {
  // 每个公共节点都读实现地址：一个节点可以假装合约没被换过
  const o = globalThis.__TAPEOUT_RPC__;
  const single = typeof o === 'string' || (o && o[net.key]);
  const slots = single ? [await rpc(net, 'eth_getStorageAt', [net.registry, IMPL_SLOT, 'latest'])]
    : (await Promise.all(net.rpcs.map(async (url) => {
      try { const j = await (await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: ++rid, method: 'eth_getStorageAt', params: [net.registry, IMPL_SLOT, 'latest'] }) })).json(); return j.error ? null : j.result; } catch { return null; }
    }))).filter(Boolean);
  if (!slots.length) slots.push(await rpc(net, 'eth_getStorageAt', [net.registry, IMPL_SLOT, 'latest']));   // 都连不上：走平常的换节点逻辑（它会报错）
  for (const slot of slots) {
    const impl = '0x' + slot.replace(/^0x/, '').padStart(64, '0').slice(24);
    if (!net.registryImpl.includes(impl)) throw new Error(t('{0} 的 TapeOut 文件合约被升级到了未核对的版本（{1}），先暂停链上备份', net.name, impl));
  }
}
/** 容器现在的操作员（同一时间只有一个）：{ op, until }；没有或已过期时 op 为 null。撤销、授权新钥匙前要知道是谁占着 */
export async function currentOperator(net, container) {
  // 每个公共节点都问：一个节点能把别人的授权藏起来（设备钥匙页就不报警），所以任何一个节点报了有效的操作员都算有（宁可多报）
  const arg = [{ t: 'addr', v: container }];
  const [as, us] = await Promise.all([callEach(net, net.registry, call(SEL.operatorOf, arg)), callEach(net, net.registry, call(SEL.operatorUntil, arg))]);
  const seen = as.map((a, i) => ({ op: addrAt(a, 0), until: us[i] ? Number(big(wordAt(us[i], 0))) : 0 }))
    .filter((x) => !/^0x0{40}$/.test(x.op) && x.until * 1000 > Date.now()).sort((x, y) => y.until - x.until);
  return seen.length ? seen[0] : { op: null, until: us[0] ? Number(big(wordAt(us[0], 0))) : 0 };
}
/** 容器持有人，每个公共节点核对一致（回执链接、授权前靠它确认「这是谁的容器」，单个节点可以谎报）；不一致抛 { conflict: true } */
export async function containerOwnerCross(net, container) {
  const got = (await callEach(net, container, SEL.owner)).map((d) => addrAt(d, 0));
  if (got.some((x) => x !== got[0])) throw Object.assign(new Error(t('{0} 的两个公共节点给出的容器持有人不一样，先别继续，过一会儿再试。', net.name)), { conflict: true });
  return got[0];
}
export async function containerOwner(net, container) {
  return addrAt(await ethCall(net, container, SEL.owner), 0);
}
export const putFileData = (container, chunk, sha, path = BACKUP_PATH, type = BACKUP_TYPE) =>
  call(SEL.putFile, [{ t: 'addr', v: container }, { t: 'str', v: path }, { t: 'str', v: type }, { t: 'b32', v: sha }, { t: 'bytes', v: chunk }]);
export const appendChunkData = (container, index, chunk, path = BACKUP_PATH) =>
  call(SEL.appendChunk, [{ t: 'addr', v: container }, { t: 'str', v: path }, { t: 'uint', v: index }, { t: 'bytes', v: chunk }]);

export async function waitReceipt(net, hash, { pollMs = 1500, tries = 200 } = {}) {
  for (let i = 0; i < tries; i++) {
    const r = await rpc(net, 'eth_getTransactionReceipt', [hash]).catch(() => null);
    if (r) return r;
    await new Promise((res) => setTimeout(res, pollMs));
  }
  throw new Error(t('等交易确认超时，稍后再看'));
}
/** 用钱包（或 operator 时用设备钥匙的发送者，见 device.js）把 bytes 写成容器里的备份文件（超过 24000 字节分块，每块一笔交易）；写完读回核对。
 *  onStatus(phase, i, n)：phase = 'sign'（等钱包确认第 i 笔）| 'sent'（已发出，等上链） */
export async function writeFile(provider, net, from, container, bytes, { path = BACKUP_PATH, pollMs, onStatus, operator = false } = {}) {
  await checkRegistry(net);
  if (operator) {                                                   // 设备钥匙：由持有人授权的操作员
    try { await rpc(net, 'eth_call', [{ from, to: net.registry, data: putFileData(container, new Uint8Array([1]), '0x' + '00'.repeat(32), '.probe') }, 'latest']); }
    catch { throw new Error(t('设备钥匙没有这个容器的写入授权（没授权、已过期或被撤销），请在钱包 App 里重新授权')); }
  } else if ((await containerOwner(net, container)) !== from.toLowerCase()) throw new Error(t('这个钱包已经不是该电路的持有人'));
  const sha = await sha256(bytes);
  const chunks = [];
  for (let i = 0; i < bytes.length; i += CHUNK) chunks.push(bytes.subarray(i, i + CHUNK));
  if (!chunks.length) chunks.push(new Uint8Array());
  const txs = [];
  let first = null;
  for (let i = 0; i < chunks.length; i++) {
    const data = i === 0 ? putFileData(container, chunks[0], sha, path) : appendChunkData(container, i, chunks[i], path);
    if (onStatus) onStatus('sign', i + 1, chunks.length);
    const hash = await provider.request({ method: 'eth_sendTransaction', params: [{ from, to: net.registry, data, value: '0x0' }] });
    if (onStatus) onStatus('sent', i + 1, chunks.length);
    const rc = await waitReceipt(net, hash, { pollMs });
    if (rc.status !== '0x1') throw new Error(t('写入交易失败'));
    if (i === 0) first = rc;
    txs.push(hash);
  }
  const info = await fileInfo(net, container, path);
  if (info.size !== bytes.length || info.sha !== sha) {
    // 别的设备紧接着也写了（同一个块或下一个块）：我们这笔的写入事件里是这份，就是写上了、又被盖掉——交给调用方去合并，不当失败
    const ours = (first.logs || []).some((l) => l.address && l.address.toLowerCase() === net.registry.toLowerCase() && l.topics && l.topics[0] === WRITE_TOPIC
      && l.topics[1] === '0x' + container.slice(2).toLowerCase().padStart(64, '0')
      && l.data && l.data.length >= 2 + 64 * 3 && '0x' + l.data.slice(2 + 128, 2 + 192) === sha);
    if (!ours || chunks.length > 1) throw new Error(t('写入后链上记录与本地不符'));
    return { txs, info: { ...info, size: bytes.length, sha, overwritten: true } };
  }
  return { txs, info };
}
