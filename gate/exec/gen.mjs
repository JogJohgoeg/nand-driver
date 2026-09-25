// gatesim R1：网表 → 位切片 WGSL 的固定规则生成器（Deno / 浏览器 / node 通用，无依赖）。
// 语义逐条照官方 latch_ssm/nlrun.js：NAND 7B、LATCH 4B 变长；线 0=常0、1=常1、2..nIn+1=输入、其后依序为元件；
// LATCH 吐旧 Q，全部门算完后采样 D；NAND 引用「尚未计算」的线（线号 ≥ 自身）读 0；输出 = 线数组末 nOut 个。
// 位切片：一个 u32 字的 32 位 = 同一模板 32 个独立实例的同一条线。每个门只生成 `~(a & b)`。
// 常量 0/1 从 uniform 运行时读入（不是字面量），shader 编译器无法把它们折叠掉。

// 末尾截断的记录照 nlrun 的 parseInt(部分十六进制)：按实有字节大端取值，一个字节都没有则 NaN→0。
export function decode(bytes) {
  const op = [], a = [], b = [], n = bytes.length;
  const field = o => { let v = 0; for (let t = o; t < Math.min(o + 3, n); t++) v = (v << 8) | bytes[t]; return v; };
  for (let o = 0; o < n; ) {
    const o0 = bytes[o]; o += 1;
    a.push(field(o)); o += 3;
    if (o0 === 0) { b.push(field(o)); o += 3; } else b.push(0);
    op.push(o0);
  }
  return { op: Uint8Array.from(op), a: Int32Array.from(a), b: Int32Array.from(b),
           nGates: op.length, nLatch: op.reduce((t, v) => t + (v === 1 ? 1 : 0), 0) };
}

// 静态分析：有效引用（前向 → 常 0）、活门（从输出与 LATCH D 反向可达）、深度、结构去重后的活门数。
export function analyze(nl, nIn, nOut) {
  const { op, a, b, nGates } = nl, base = 2 + nIn, nW = base + nGates;
  if (op.some(v => v > 1)) throw new Error('unknown op');
  if (nOut > nW) throw new Error('nOut > wires');
  const ea = new Int32Array(nGates), eb = new Int32Array(nGates);
  let forward = 0;
  for (let i = 0; i < nGates; i++) {
    if (op[i] !== 0) continue;
    const k = base + i;
    ea[i] = a[i] >= k ? 0 : a[i]; eb[i] = b[i] >= k ? 0 : b[i];
    if (a[i] >= k || b[i] >= k) forward++;
  }
  const latchIdx = new Int32Array(nGates).fill(-1), latchD = [];
  for (let i = 0, j = 0; i < nGates; i++) if (op[i] === 1) {
    latchIdx[i] = j++; latchD.push(a[i] >= nW ? 0 : a[i]);   // 越界 D：nlrun 读到 undefined → 0
  }
  const outW = []; for (let j = 0; j < nOut; j++) outW.push(nW - nOut + j);
  const live = new Uint8Array(nW);
  const stack = [...outW, ...latchD];
  while (stack.length) {
    const r = stack.pop(); if (live[r]) continue; live[r] = 1;
    const i = r - base; if (i >= 0 && op[i] === 0) { stack.push(ea[i], eb[i]); }
  }
  const depth = new Int32Array(nW); let maxDepth = 0, nNand = 0, nLive = 0, constIn = 0;
  for (let i = 0; i < nGates; i++) {
    if (op[i] !== 0) continue; nNand++;
    const d = 1 + Math.max(depth[ea[i]], depth[eb[i]]); depth[base + i] = d;
    if (live[base + i]) { nLive++; if (d > maxDepth) maxDepth = d; if (ea[i] < 2 || eb[i] < 2) constIn++; }
  }
  // 结构去重（hash-consing）：GPU 编译器可能做 CSE，因此另报这一保守门数。
  const canon = new Int32Array(nW); for (let r = 0; r < nW; r++) canon[r] = r;
  const seen = new Map(); let nUnique = 0;
  for (let i = 0; i < nGates; i++) {
    const r = base + i; if (op[i] !== 0 || !live[r]) continue;
    let x = canon[ea[i]], y = canon[eb[i]]; if (x > y) [x, y] = [y, x];
    const key = x * 4294967296 + y;
    const hit = seen.get(key); if (hit !== undefined) canon[r] = hit; else { seen.set(key, r); nUnique++; }
  }
  return { base, nW, ea, eb, latchIdx, latchD, outW, live, depth, maxDepth, nNand, nLive, nUnique, constIn, forward };
}

// 直线段代码生成。K = 每段最多活门数；段间活线走 scratch 槽位（静态 liveness 区间着色复用）。
// strict=true：每门写成 ~(a & b & km)，km 为运行时全 1 掩码（uniform），阻止编译器把多门合并成 bfi/or 等（R1 ISA 实测动机）。
// R2：门序与切段只改「求值顺序与分段」，门集合、连线、前向引用语义（已在 analyze 固定为常 0）都不变。
//   opts.order = 'orig'（网表序，R1 默认） | 'dfs'（从输出/LATCH D 出发后序 DFS，先算需要寄存器多的子树，Sethi–Ullman 式）
//   opts.cut   = 'gates'（每段 K 门，R1 默认） | 'live'（段长 ≥ Kmin 且当前活线数 ≤ R 处切，最长 K）
export function gateOrder(nl, an, order = 'orig') {
  const { op, nGates } = nl, { base, ea, eb, live, latchD, outW } = an;
  const isGate = r => r >= base && op[r - base] === 0 && live[r];
  if (order === 'orig') { const g = []; for (let i = 0; i < nGates; i++) if (op[i] === 0 && live[base + i]) g.push(i); return g; }
  if (order !== 'dfs') throw new Error('unknown order ' + order);
  // 标号：叶子（输入/常量/Q）0；门 = 两子标号不等取大，相等则 +1（DAG 上的近似）
  const lab = new Int32Array(an.nW);
  for (let i = 0; i < nGates; i++) if (op[i] === 0 && live[base + i]) {
    const x = lab[ea[i]], y = lab[eb[i]]; lab[base + i] = x === y ? x + 1 : Math.max(x, y);
  }
  const done = new Uint8Array(an.nW), res = [], roots = [...outW, ...latchD];
  for (const root of roots) {
    if (!isGate(root) || done[root]) continue;
    const stack = [[root, 0]];
    while (stack.length) {
      const top = stack[stack.length - 1], r = top[0];
      if (done[r]) { stack.pop(); continue; }
      const i = r - base;
      let kids = [ea[i], eb[i]]; if (lab[kids[1]] > lab[kids[0]]) kids = [kids[1], kids[0]];
      if (top[1] < 2) { const k = kids[top[1]++]; if (isGate(k) && !done[k]) stack.push([k, 0]); continue; }
      done[r] = 1; res.push(i); stack.pop();
    }
  }
  return res;
}
export function segmentize(order, an, K, cut = 'gates', R = 128, Kmin = 1024) {
  if (cut === 'gates') { const n = Math.max(1, Math.ceil(order.length / K)); return Array.from({ length: n }, (_, s) => order.slice(s * K, (s + 1) * K)); }
  // 活线数：已算出、之后仍有使用者（门/输出/LATCH D）的门值个数
  const { base, ea, eb, outW, latchD } = an, pos = new Int32Array(an.nW).fill(-1), lastUse = new Int32Array(an.nW).fill(-1);
  order.forEach((i, t) => { pos[base + i] = t; });
  order.forEach((i, t) => { for (const r of [ea[i], eb[i]]) if (pos[r] >= 0) lastUse[r] = Math.max(lastUse[r], t); });
  for (const r of [...outW, ...latchD]) if (pos[r] >= 0) lastUse[r] = order.length;   // 输出/次态在定义段写出，但保守视作活到末尾
  const segs = []; let cur = [], L = 0; const dieAt = new Int32Array(order.length + 1);
  for (let r = 0; r < an.nW; r++) if (pos[r] >= 0 && lastUse[r] >= 0 && lastUse[r] < order.length) dieAt[lastUse[r]]++;
  order.forEach((i, t) => {
    cur.push(i); if (lastUse[base + i] > t) L++; L -= dieAt[t];
    if ((cur.length >= Kmin && L <= R) || cur.length >= K) { segs.push(cur); cur = []; }
  });
  if (cur.length || !segs.length) segs.push(cur);
  return segs;
}

export function genWGSL(nl, nIn, nOut, an, K = 8192, WG = 64, strict = false, opts = {}) {
  const { op, nGates } = nl, { base, ea, eb, latchIdx, latchD, outW, live } = an;
  const segOf = new Int32Array(an.nW).fill(-1);          // -1：常量/输入/LATCH Q（任何段都可直接读）
  const liveGates = gateOrder(nl, an, opts.order || 'orig');
  const segGates = segmentize(liveGates, an, K, opts.cut || 'gates', opts.R ?? 128, opts.Kmin ?? 1024);
  const nSeg = segGates.length;
  segGates.forEach((g, s) => g.forEach(i => { segOf[base + i] = s; }));
  const lastUse = new Int32Array(an.nW).fill(-1);
  for (const g of segGates) for (const i of g) {
    const s = segOf[base + i];
    for (const r of [ea[i], eb[i]]) if (segOf[r] >= 0 && s > lastUse[r]) lastUse[r] = s;
  }
  // 槽位分配：线 r 在 segOf[r] 末写入、在 (segOf[r], lastUse[r]] 读取。
  const slot = new Int32Array(an.nW).fill(-1), free = [], ends = []; let nSlots = 0;
  for (let s = 0; s < nSeg; s++) {
    for (let t = ends.length - 1; t >= 0; t--) if (ends[t][0] < s) { free.push(ends[t][1]); ends.splice(t, 1); }
    for (const i of segGates[s]) {
      const r = base + i;
      if (lastUse[r] > s) { const sl = free.length ? free.pop() : nSlots++; slot[r] = sl; ends.push([lastUse[r], sl]); }
    }
  }
  const isLatchWire = r => r >= base && op[r - base] === 1;
  const shaders = [];
  for (let s = 0; s < nSeg; s++) {
    const L = [], pre = [], loaded = new Set();
    const ref = r => {
      if (r === 0) return 'k0';
      if (r === 1) return 'k1';
      if (r < base) { if (!loaded.has(r)) { loaded.add(r); pre.push(`  let x${r} = inp[${r - 2}u * W + w];`); } return `x${r}`; }
      if (isLatchWire(r)) { if (!loaded.has(r)) { loaded.add(r); pre.push(`  let q${r} = st0[${latchIdx[r - base]}u * W + w];`); } return `q${r}`; }
      if (segOf[r] === s) return `v${r}`;
      if (segOf[r] < 0 || segOf[r] > s) throw new Error('bad ref ' + r);
      if (!loaded.has(r)) { loaded.add(r); pre.push(`  let v${r} = sc[${slot[r]}u * W + w];`); }
      return `v${r}`;
    };
    for (const i of segGates[s]) { const r = base + i; L.push(strict ? `  let v${r} = ~(${ref(ea[i])} & ${ref(eb[i])} & km);` : `  let v${r} = ~(${ref(ea[i])} & ${ref(eb[i])});`); }
    for (const i of segGates[s]) { const r = base + i; if (slot[r] >= 0) L.push(`  sc[${slot[r]}u * W + w] = v${r};`); }
    // 输出与 LATCH 次态：在定义所在段写出；非门线（常量/输入/Q）在第 0 段写出。
    const home = r => (segOf[r] >= 0 ? segOf[r] : 0);
    outW.forEach((r, j) => { if (home(r) === s) L.push(`  outb[${j}u * W + w] = ${ref(r)};`); });
    latchD.forEach((r, j) => { if (home(r) === s) L.push(`  st1[${j}u * W + w] = ${ref(r)};`); });
    shaders.push(`// gatesim R1 seg ${s}/${nSeg}: ${segGates[s].length} NAND
struct P { W: u32, k0: u32, k1: u32, pad: u32 }
@group(0) @binding(0) var<uniform> p: P;
@group(0) @binding(1) var<storage, read> inp: array<u32>;
@group(0) @binding(2) var<storage, read> st0: array<u32>;
@group(0) @binding(3) var<storage, read_write> st1: array<u32>;
@group(0) @binding(4) var<storage, read_write> outb: array<u32>;
@group(0) @binding(5) var<storage, read_write> sc: array<u32>;
@compute @workgroup_size(${WG})
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let W = p.W;
  let w = gid.x;
  if (w >= W) { return; }
  let k0 = p.k0;
  let k1 = p.k1;${strict ? '\n  let km = p.pad;' : ''}
${pre.join('\n')}
${L.join('\n')}
}
`);
  }
  return { shaders, nSeg, nSlots, nLiveEmitted: liveGates.length };
}

// 位切片解释器（对照）：门表在 storage，线值全存全局 wv[wire][W]。仍是每门一次 ~(a&b)。
export function interpTables(nl, an) {
  const { op, nGates } = nl, t = new Uint32Array(nGates * 2);
  for (let i = 0; i < nGates; i++) {
    if (op[i] === 0) { t[2 * i] = an.ea[i]; t[2 * i + 1] = an.eb[i]; }
    else { t[2 * i] = 0x80000000 | an.latchIdx[i]; t[2 * i + 1] = 0; }
  }
  return t;
}
export const INTERP_WGSL = `// gatesim R1 位切片解释器（对照内核）
struct P { W: u32, nIn: u32, nGates: u32, nOut: u32, nLatch: u32, nW: u32, k0: u32, k1: u32 }
@group(0) @binding(0) var<uniform> p: P;
@group(0) @binding(1) var<storage, read> inp: array<u32>;
@group(0) @binding(2) var<storage, read> st0: array<u32>;
@group(0) @binding(3) var<storage, read_write> st1: array<u32>;
@group(0) @binding(4) var<storage, read_write> outb: array<u32>;
@group(0) @binding(5) var<storage, read_write> wv: array<u32>;
@group(0) @binding(6) var<storage, read> gt: array<u32>;
@group(0) @binding(7) var<storage, read> ld: array<u32>;
@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let W = p.W;
  let w = gid.x;
  if (w >= W) { return; }
  wv[w] = p.k0;
  wv[W + w] = p.k1;
  for (var k = 0u; k < p.nIn; k++) { wv[(2u + k) * W + w] = inp[k * W + w]; }
  let base = 2u + p.nIn;
  for (var i = 0u; i < p.nGates; i++) {
    let x = gt[2u * i];
    if ((x & 0x80000000u) != 0u) {
      wv[(base + i) * W + w] = st0[(x & 0x7fffffffu) * W + w];
    } else {
      wv[(base + i) * W + w] = ~(wv[x * W + w] & wv[gt[2u * i + 1u] * W + w]);
    }
  }
  for (var j = 0u; j < p.nOut; j++) { outb[j * W + w] = wv[(p.nW - p.nOut + j) * W + w]; }
  for (var j = 0u; j < p.nLatch; j++) { st1[j * W + w] = wv[ld[j] * W + w]; }
}
`;

// 单实例按深度分层并行（单流口径）：一个工作组，同层门分给线程，层间屏障。线值存全局 u32（只用 bit0 所在的 lane 0 实例）。
export function levelTables(nl, an) {
  const { op, nGates } = nl, { base, ea, eb, depth, live } = an;
  const byLevel = [];
  for (let i = 0; i < nGates; i++) if (op[i] === 0 && live[base + i]) {
    const d = depth[base + i]; (byLevel[d] ||= []).push(i);
  }
  const lv = [0], g = [];
  for (let d = 1; d < byLevel.length; d++) { for (const i of byLevel[d] || []) g.push(base + i, ea[i], eb[i]); lv.push(g.length / 3); }
  return { levels: Uint32Array.from(lv), gates: Uint32Array.from(g), nLevels: lv.length - 1 };
}
// 注：初版用普通 storage 读写 + storageBarrier，在 RADV（RDNA WGP 模式）上 ≥1 万门的网表出错（R1 实测），
// 故线值改用 atomicLoad/atomicStore（走 L2，跨 CU 可见）；小网表另有 workgroup 内存版本 LEVEL_WG_WGSL。
const levelSrc = (decl, ld, st) => `// gatesim R1 单实例分层并行（单流口径）
struct P { nIn: u32, nLevels: u32, nOut: u32, nLatch: u32, nW: u32, k0: u32, k1: u32, nLatchWires: u32 }
@group(0) @binding(0) var<uniform> p: P;
@group(0) @binding(1) var<storage, read> inp: array<u32>;
@group(0) @binding(2) var<storage, read> st0: array<u32>;
@group(0) @binding(3) var<storage, read_write> st1: array<u32>;
@group(0) @binding(4) var<storage, read_write> outb: array<u32>;
${decl}
@group(0) @binding(6) var<storage, read> lv: array<u32>;
@group(0) @binding(7) var<storage, read> gs: array<u32>;
@group(0) @binding(8) var<storage, read> lw: array<u32>;
@compute @workgroup_size(256)
fn main(@builtin(local_invocation_id) lid: vec3<u32>) {
  let t = lid.x;
  if (t == 0u) { ${st('0u', 'p.k0')} ${st('1u', 'p.k1')} }
  for (var k = t; k < p.nIn; k += 256u) { ${st('2u + k', 'inp[k]')} }
  for (var j = t; j < p.nLatchWires; j += 256u) { ${st('lw[2u * j]', 'st0[lw[2u * j + 1u]]')} }
  storageBarrier();
  workgroupBarrier();
  for (var d = 0u; d < p.nLevels; d++) {
    let e = lv[d + 1u];
    for (var q = lv[d] + t; q < e; q += 256u) {
      ${st('gs[3u * q]', `~(${ld('gs[3u * q + 1u]')} & ${ld('gs[3u * q + 2u]')})`)}
    }
    storageBarrier();
    workgroupBarrier();
  }
  for (var j = t; j < p.nOut; j += 256u) { outb[j] = ${ld('p.nW - p.nOut + j')}; }
  for (var j = t; j < p.nLatch; j += 256u) { st1[j] = ${ld('lw[2u * p.nLatchWires + j]')}; }
}
`;
export const LEVEL_WGSL = levelSrc('@group(0) @binding(5) var<storage, read_write> wv: array<atomic<u32>>;',
  i => `atomicLoad(&wv[${i}])`, (i, v) => `atomicStore(&wv[${i}], ${v});`);
export const LEVEL_WG_WORDS = 16384;
export const LEVEL_WG_WGSL = levelSrc(`@group(0) @binding(5) var<storage, read_write> wv_unused: array<u32>;
var<workgroup> wv: array<u32, ${LEVEL_WG_WORDS}>;`, i => `wv[${i}]`, (i, v) => `wv[${i}] = ${v};`);
