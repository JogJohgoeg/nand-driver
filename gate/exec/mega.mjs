// gatesim R4 串行段内核（megakernel）：一次派发、一个 wave（32 线程）按拓扑序执行一段窄组。
// 每步：按组表 switch 到该组模板 → 每线程负责字 w = t, t+32, …：按静态连线表（与 gather2 同规则）搬入输入位 → 内联模板直线门代码（genWGSL 生成，门只以 ~(a & b) 出现）
// → 输出写回 arena 中与 R3 相同的地址 → storageBarrier + workgroupBarrier 后下一步。只改执行方式，不改门、连线与地址。
import { decode, analyze, genWGSL } from './gen.mjs';

export const MEGA_SET = ['add', 'mux32', 'mux16', 'gt', 'umax', 'or', 'and', 'not', 'nf', 'eq8', 'bf16', 'i2f', 'f2i', 'clip', 'sub', 'mul', 'control', 'div', 'sqrt', 'ternary32', 'scale_exact', 'mul_bb', 'ternary32pm', 'tern4', 'iadd16'];

// 某模板的内联体：输入 → gw(wm0, w, k)（按表搬运），输出 → arena[out + j*W + w]
export function megaCase(bytes, nIn, nOut, opts) {
  const nl = decode(bytes), an = analyze(nl, nIn, nOut), gw = genWGSL(nl, nIn, nOut, an, 1 << 22, 32, false, { ...opts, K: 1 << 22, cut: 'gates' });
  if (gw.nSeg !== 1) throw new Error('mega template must be single segment');
  let body = gw.shaders[0].split('let k1 = p.k1;')[1].replace(/\}\s*$/, '');
  body = body.replace(/let x(\d+) = inp\[(\d+)u \* W \+ w\];/g, (m, r, k) => `let x${r} = gin(sb + ${k}u * 4u, wm0, w, ${k}u);`);
  body = body.replace(/  outb\[(\d+)u \* W \+ w\] = ([a-z0-9]+);/g, (m, j, v) => `  arena[out + ${j}u * W + w] = ${v};`);
  if (/inp\[|outb\[|st0\[|st1\[|sc\[/.test(body)) throw new Error('unexpected buffer ref in mega body');
  return { body, nNand: an.nNand };
}

export function megaWGSL(cases) {   // cases: [{id, body}]
  return `// gatesim R4 串行段内核：门只以 ~(a & b) 出现；搬运只用 >> & | <<，来源/移位量来自静态表；switch 条件来自组表
struct P { g0: u32, g1: u32, k0: u32, k1: u32 }
@group(0) @binding(0) var<uniform> p: P;
@group(0) @binding(1) var<storage, read> grp: array<u32>;
@group(0) @binding(2) var<storage, read> rows: array<u32>;
@group(0) @binding(3) var<storage, read> colmap: array<u32>;
@group(0) @binding(4) var<storage, read> members: array<u32>;
@group(0) @binding(5) var<storage, read> wordmap: array<u32>;
@group(0) @binding(6) var<storage, read_write> arena: array<u32>;
@group(0) @binding(7) var<storage, read> stab: array<u32>;
@group(0) @binding(8) var<storage, read> sbase: array<u32>;
// 步输入表 stab[4 项/输入]：[形态, a, b, c]；形态只来自表（标量分支）。0 单比特：位号 a；1 字对齐：arena[a + w]；2 单成员一般映射：行基 a、列映射偏移 b、n=c；3 多成员：回退 gw
fn gin(e: u32, wm0: u32, w: u32, k: u32) -> u32 {
  let mode = stab[e];
  let a = stab[e + 1u];
  if (mode == 0u) { return (arena[a >> 5u] >> (a & 31u)) & 1u; }
  if (mode == 1u) { return arena[a + w]; }
  if (mode == 2u) {
    let off = stab[e + 2u];
    let n = stab[e + 3u];
    var acc = 0u;
    let nb = min(32u, n - min(n, w * 32u));
    for (var b = 0u; b < nb; b++) {
      let gi = a + colmap[off + w * 32u + b];
      acc = acc | (((arena[gi >> 5u] >> (gi & 31u)) & 1u) << b);
    }
    return acc;
  }
  return gw(wm0, w, k);
}
fn gw(wm0: u32, fw: u32, k: u32) -> u32 {
  let mo = 5u * wordmap[wm0 + fw];
  let w = fw - members[mo + 1u];
  let n = members[mo + 3u];
  let e = 3u * (members[mo + 4u] + k);
  let rb = rows[e + 1u];
  let off = rows[e + 2u];
  var acc = 0u;
  let nb = min(32u, n - min(n, w * 32u));
  for (var b = 0u; b < nb; b++) {
    let gi = rb + colmap[off + w * 32u + b];
    acc = acc | (((arena[gi >> 5u] >> (gi & 31u)) & 1u) << b);
  }
  return acc;
}
@compute @workgroup_size(32)
fn main(@builtin(local_invocation_index) t: u32) {
  let k0 = p.k0;
  let k1 = p.k1;
  for (var gi = p.g0; gi < p.g1; gi++) {
    let tpl = grp[9u * gi];
    let W = grp[9u * gi + 1u];
    let out = grp[9u * gi + 2u];
    let wm0 = grp[9u * gi + 8u];
    let sb = sbase[gi];
    switch tpl {
${cases.map(c => `      case ${c.id}u: {
        for (var w = t; w < W; w += 32u) {
${c.body.split('\n').filter(l => l.trim()).map(l => '        ' + l).join('\n')}
        }
      }`).join('\n')}
      default: {}
    }
    storageBarrier();
    workgroupBarrier();
  }
}
`;
}

// 调度切分：连续的窄组（模板 ∈ 集合、W ≤ wmax）合成一段；其余照 R3 派发
export function planSegments(L, wmax) {
  const T = L.meta.templates, items = [];
  for (let i = 0; i < L.NG; i++) {
    const q = L.GR(i), narrow = MEGA_SET.includes(T[q[0]]) && q[1] <= wmax;
    const last = items[items.length - 1];
    if (narrow && last && last.kind === 'seg' && last.g1 === i) last.g1 = i + 1;
    else items.push(narrow ? { kind: 'seg', g0: i, g1: i + 1 } : { kind: 'grp', g: i });
  }
  return items;
}

// 为段内各组构造步输入表（加载时一次，按静态表推导，不看运行值）
export function buildStepTable(L, rowsA, cm, members) {
  const out = [], sbase = new Uint32Array(L.NG), st = { single: 0, aligned: 0, general: 0, multi: 0 };
  for (const it of L.items) if (it.kind === 'seg') for (let gi = it.g0; gi < it.g1; gi++) {
    const q = L.GR(gi), ni = q[3], m0 = q[4], nm = q[5]; sbase[gi] = out.length;
    for (let k = 0; k < ni; k++) {
      if (nm !== 1) { out.push(3, 0, 0, 0); st.multi++; continue; }
      const mo = 5 * m0, n = members[mo + 3], e = 3 * (members[mo + 4] + k), rb = rowsA[e + 1], off = rowsA[e + 2];
      if (n === 1) { out.push(0, rb + cm[off], 0, 0); st.single++; continue; }
      const c0 = cm[off]; let ident = (rb + c0) % 32 === 0;
      for (let c = 1; ident && c < n; c++) if (cm[off + c] !== c0 + c) ident = false;
      if (ident) { out.push(1, (rb + c0) / 32, 0, 0); st.aligned++; } else { out.push(2, rb, off, n); st.general++; }
    }
  }
  return { stab: Uint32Array.from(out.length ? out : [0, 0, 0, 0]), sbase, st };
}

// ---------------- v2：两阶段步（lane 并行搬入 LDS → 模板体读 LDS） ----------------
export function megaCase2(bytes, nIn, nOut, opts, strict = false) {
  const nl = decode(bytes), an = analyze(nl, nIn, nOut), gw = genWGSL(nl, nIn, nOut, an, 1 << 22, 32, strict, { ...opts, K: 1 << 22, cut: 'gates' });
  if (gw.nSeg !== 1) throw new Error('mega template must be single segment');
  let body = gw.shaders[0].split('let k1 = p.k1;')[1].replace(/\}\s*$/, '').replace('let km = p.pad;', '');   // strict 的 km 由段内核 main 定义
  body = body.replace(/let x(\d+) = inp\[(\d+)u \* W \+ w\];/g, (m, r, k) => `let x${r} = xin[${k}u * W + w];`);
  body = body.replace(/  outb\[(\d+)u \* W \+ w\] = ([a-z0-9]+);/g, (m, j, v) => `  arena[out + ${j}u * W + w] = ${v};`);
  if (/inp\[|outb\[|st0\[|st1\[|sc\[/.test(body)) throw new Error('unexpected buffer ref in mega body');
  return { body, nNand: an.nNand };
}
export function megaWGSL2(cases, WMAX, NIMAX = 65) {
  return `// gatesim R4 串行段内核 v2：阶段一 32 lane 并行按静态表把输入搬进 LDS（无按值分支：快速部分 (arena[a+w*inc]>>sh)&mask，一般部分按表查成员逐位），
// 阶段二模板直线门代码（门只以 ~(a & b) 出现）从 LDS 取输入、输出写回 arena（地址同 R3）。switch 条件、移位量、掩码、地址全部来自静态表。
struct P { g0: u32, g1: u32, k0: u32, k1: u32 }
@group(0) @binding(0) var<uniform> p: P;
@group(0) @binding(1) var<storage, read> grp: array<u32>;
@group(0) @binding(2) var<storage, read> rows: array<u32>;
@group(0) @binding(3) var<storage, read> colmap: array<u32>;
@group(0) @binding(4) var<storage, read> members: array<u32>;
@group(0) @binding(5) var<storage, read> wordmap: array<u32>;
@group(0) @binding(6) var<storage, read_write> arena: array<u32>;
@group(0) @binding(7) var<storage, read> stab: array<u32>;
@group(0) @binding(8) var<storage, read> sbase: array<u32>;
var<workgroup> xin: array<u32, ${NIMAX * WMAX}>;
@compute @workgroup_size(32)
fn main(@builtin(local_invocation_index) t: u32) {
  let k0 = p.k0;
  let k1 = p.k1;
  let km = p.k1;
  for (var gi = p.g0; gi < p.g1; gi++) {
    let tpl = grp[9u * gi];
    let W = grp[9u * gi + 1u];
    let ni = grp[9u * gi + 3u];
    let out = grp[9u * gi + 2u];
    let wm0 = grp[9u * gi + 8u];
    let sb = sbase[gi];
    for (var it = t; it < ni * W; it += 32u) {
      let k = it / W;
      let w = it % W;
      let e = sb + 8u * k;
      let fast = (arena[stab[e] + w * stab[e + 3u]] >> stab[e + 1u]) & stab[e + 2u];
      let mo = 5u * wordmap[wm0 + w];
      let wl = w - members[mo + 1u];
      let n = members[mo + 3u];
      let r = 3u * (members[mo + 4u] + k);
      let rb = rows[r + 1u];
      let off = rows[r + 2u];
      let nb = min(32u, n - min(n, wl * 32u)) * stab[e + 4u];
      var acc = fast;
      for (var b = 0u; b < nb; b++) {
        let g2 = rb + colmap[off + wl * 32u + b];
        acc = acc | (((arena[g2 >> 5u] >> (g2 & 31u)) & 1u) << b);
      }
      xin[it] = acc;
    }
    workgroupBarrier();
    switch tpl {
${cases.map(c => `      case ${c.id}u: {
        for (var w = t; w < W; w += 32u) {
${c.body.split('\n').filter(l => l.trim()).map(l => '        ' + l).join('\n')}
        }
      }`).join('\n')}
      default: {}
    }
    storageBarrier();
    workgroupBarrier();
  }
}
`;
}
export function buildStepTable2(L, rowsA, cm, members) {
  const out = [], sbase = new Uint32Array(L.NG), st = { single: 0, aligned: 0, general: 0, multi: 0 };
  for (const it of L.items) if (it.kind === 'seg') for (let gi = it.g0; gi < it.g1; gi++) {
    const q = L.GR(gi), ni = q[3], m0 = q[4], nm = q[5]; sbase[gi] = out.length;
    for (let k = 0; k < ni; k++) {
      // [字地址, 移位, 掩码, 字步长, 一般部分标志, 0, 0, 0]
      if (nm !== 1) { out.push(0, 0, 0, 0, 1, 0, 0, 0); st.multi++; continue; }
      const mo = 5 * m0, n = members[mo + 3], e = 3 * (members[mo + 4] + k), rb = rowsA[e + 1], off = rowsA[e + 2];
      if (n === 1) { const gi2 = rb + cm[off]; out.push(Math.floor(gi2 / 32), gi2 % 32, 1, 0, 0, 0, 0, 0); st.single++; continue; }
      const c0 = cm[off]; let ident = (rb + c0) % 32 === 0;
      for (let c = 1; ident && c < n; c++) if (cm[off + c] !== c0 + c) ident = false;
      if (ident) { out.push((rb + c0) / 32, 0, 0xffffffff, 1, 0, 0, 0, 0); st.aligned++; } else { out.push(0, 0, 0, 0, 1, 0, 0, 0); st.general++; }
    }
  }
  return { stab: Uint32Array.from(out.length ? out : [0, 0, 0, 0, 0, 0, 0, 0]), sbase, st };
}

// ---------------- v3：只收全快速输入的步 + LDS 进位 ----------------
// 输入形态（加载时由静态表判定）：单比特（n=1）或字对齐恒等映射；若来源恰是段内上一步的输出行，则从 LDS 取（yout），否则从 arena 取。
function inputForms(L, gi, rowsA, cm, members) {
  const q = L.GR(gi), ni = q[3], m0 = q[4], nm = q[5];
  if (nm !== 1) return null;
  const mo = 5 * m0, n = members[mo + 3], f = [];
  for (let k = 0; k < ni; k++) {
    const e = 3 * (members[mo + 4] + k), rb = rowsA[e + 1], off = rowsA[e + 2];
    if (n === 1) { f.push({ single: true, gi: rb + cm[off] }); continue; }
    const c0 = cm[off]; if ((rb + c0) % 32 !== 0) return null;
    for (let c = 1; c < n; c++) if (cm[off + c] !== c0 + c) return null;
    f.push({ single: false, word: (rb + c0) / 32 });
  }
  return f;
}
export function planSegments3(L, wmax, rowsA, cm, members, set = MEGA_SET) {
  const T = L.meta.templates, items = [], forms = new Array(L.NG);
  for (let i = 0; i < L.NG; i++) {
    const q = L.GR(i);
    const narrow = set.includes(T[q[0]]) && q[1] <= wmax && (forms[i] = inputForms(L, i, rowsA, cm, members)) !== null;
    const last = items[items.length - 1];
    if (narrow && last && last.kind === 'seg' && last.g1 === i) last.g1 = i + 1;
    else items.push(narrow ? { kind: 'seg', g0: i, g1: i + 1 } : { kind: 'grp', g: i });
  }
  L._forms = forms;
  return items;
}
export function buildStepTable3(L) {
  // 每输入 8 项：[arena 字地址, 移位, 掩码, 字步长, yout 基址, yout 字步长, yout 掩码, 0]；值 = ((arena[a+w*inc]>>sh)&mask) | (yout[ya+w*yinc]&ymask)
  const out = [], sbase = new Uint32Array(L.NG), st = { single: 0, aligned: 0, ldsCarry: 0 };
  for (const it of L.items) if (it.kind === 'seg') for (let gi = it.g0; gi < it.g1; gi++) {
    sbase[gi] = out.length / 4;                                         // vec4 单位
    const f = L._forms[gi], prev = gi > it.g0 ? L.GR(gi - 1) : null, q = L.GR(gi);
    for (const x of f) {
      // 来源是否为段内上一步的输出：上一步输出区 [out, out + nout*W)
      let word = x.single ? Math.floor(x.gi / 32) : x.word, bit = x.single ? x.gi % 32 : 0;
      if (prev && word >= prev[2] && word < prev[2] + prev[7] * prev[1] && (x.single ? true : prev[1] === q[1])) {
        const rel = word - prev[2];                                   // = j*Wprev + w0
        if (x.single) out.push(0, 0, 0, 0, rel, 0, (1 << bit) >>> 0, bit); else out.push(0, 0, 0, 0, rel, 1, 0xffffffff, 0);
        st.ldsCarry++; continue;
      }
      if (x.single) { out.push(word, bit, 1, 0, 0, 0, 0, 0); st.single++; } else { out.push(word, 0, 0xffffffff, 1, 0, 0, 0, 0); st.aligned++; }
    }
  }
  return { stab: Uint32Array.from(out.length ? out : [0, 0, 0, 0, 0, 0, 0, 0]), sbase, st };
}
export function megaCase3(bytes, nIn, nOut, opts, strict = false) {
  const r = megaCase2(bytes, nIn, nOut, opts, strict);
  r.body = r.body.replace(/  arena\[out \+ (\d+)u \* W \+ w\] = ([a-z0-9]+);/g, (m, j, v) => `  arena[out + ${j}u * W + w] = ${v};\n  yout[${j}u * W + w] = ${v};`);
  return r;
}
export function megaWGSL3(cases, WMAX, NIMAX = 65, NOMAX = 33) {
  const R = Math.ceil(NIMAX * WMAX / 32);
  return `// gatesim R4 串行段内核 v3：只收全快速输入的步；阶段一 32 lane 并行搬入 LDS（值 = ((arena[a+w*inc]>>sh)&mask) | ((yout[ya+w*yinc]&ymask)>>ysh)，全部参数来自静态表，无按值分支；常数次展开以并发发出读），
// 阶段二模板直线门代码（门只以 ~(a & b) 出现）从 LDS 取输入，输出写回 arena（地址同 R3）并留一份在 LDS 供下一步取进位。
struct P { g0: u32, g1: u32, k0: u32, k1: u32 }
@group(0) @binding(0) var<uniform> p: P;
@group(0) @binding(1) var<storage, read> grp: array<u32>;
@group(0) @binding(6) var<storage, read_write> arena: array<u32>;
@group(0) @binding(7) var<storage, read> stab: array<vec4<u32>>;
@group(0) @binding(8) var<storage, read> sbase: array<u32>;
var<workgroup> xin: array<u32, ${NIMAX * WMAX}>;
var<workgroup> yout: array<u32, ${NOMAX * WMAX}>;
@compute @workgroup_size(32)
fn main(@builtin(local_invocation_index) t: u32) {
  let k0 = p.k0;
  let k1 = p.k1;
  let km = p.k1;
  for (var gi = p.g0; gi < p.g1; gi++) {
    let tpl = grp[9u * gi];
    let W = grp[9u * gi + 1u];
    let ni = grp[9u * gi + 3u];
    let out = grp[9u * gi + 2u];
    let sb = sbase[gi];
    let nit = ni * W;
    for (var r = 0u; r < ${R}u; r++) {
      let it = min(t + 32u * r, nit - 1u);          // 越界项重复算最后一项（写同值），保持无分支
      let k = it / W;
      let w = it % W;
      let e = sb + 2u * k;
      let s0 = stab[e];
      let s1 = stab[e + 1u];
      let fromArena = (arena[s0.x + w * s0.w] >> s0.y) & s0.z;
      let fromLds = (yout[s1.x + w * s1.y] & s1.z) >> s1.w;
      xin[it] = fromArena | fromLds;
    }
    workgroupBarrier();
    switch tpl {
${cases.map(c => `      case ${c.id}u: {
        for (var w = t; w < W; w += 32u) {
${c.body.split('\n').filter(l => l.trim()).map(l => '        ' + l).join('\n')}
        }
      }`).join('\n')}
      default: {}
    }
    storageBarrier();
    workgroupBarrier();
  }
}
`;
}

// ---------------- v4：所有窄步（W ≤ 2）入段；逐位来源表 + lane 按位并行搬运（LDS 原子或拼字）+ LDS 进位 ----------------
// 逐位表：每步 [k][c]（c < npad，npad = 32*W），项 = 全局位号 | (来自上一步输出 ? 1<<31 : 0)；来自上一步时为 yout 的位号
export function planSegments4(L, wmax, set = MEGA_SET) {
  const T = L.meta.templates, items = [];
  for (let i = 0; i < L.NG; i++) {
    const q = L.GR(i), narrow = set.includes(T[q[0]]) && q[1] <= wmax;
    const last = items[items.length - 1];
    if (narrow && last && last.kind === 'seg' && last.g1 === i) last.g1 = i + 1;
    else items.push(narrow ? { kind: 'seg', g0: i, g1: i + 1 } : { kind: 'grp', g: i });
  }
  return items;
}
export function buildBitTable4(L, rowsA, cm, members, wordmap) {
  let total = 0;
  for (const it of L.items) if (it.kind === 'seg') for (let gi = it.g0; gi < it.g1; gi++) { const q = L.GR(gi); total += q[3] * 32 * q[1]; }
  const tab = new Uint32Array(Math.max(4, total)), tbase = new Uint32Array(L.NG), st = { bits: 0, lds: 0 };
  let p = 0;
  for (const it of L.items) if (it.kind === 'seg') for (let gi = it.g0; gi < it.g1; gi++) {
    const q = L.GR(gi), W = q[1], ni = q[3], npad = 32 * W, prev = gi > it.g0 ? L.GR(gi - 1) : null; tbase[gi] = p;
    for (let k = 0; k < ni; k++) for (let fw = 0; fw < W; fw++) {
      const mo = 5 * wordmap[q[8] + fw], wOff = members[mo + 1], n = members[mo + 3], e = 3 * (members[mo + 4] + k), rb = rowsA[e + 1], off = rowsA[e + 2], wl = fw - wOff;
      for (let b = 0; b < 32; b++) {
        const c = wl * 32 + b, idx = p + k * npad + fw * 32 + b;
        if (c >= n) { tab[idx] = 0; continue; }                    // 超出实例：读常 0
        const g = rb + cm[off + c];
        if (prev) { const w = Math.floor(g / 32); if (w >= prev[2] && w < prev[2] + prev[7] * prev[1]) { tab[idx] = (((w - prev[2]) * 32 + g % 32) | 0x80000000) >>> 0; st.lds++; continue; } }
        tab[idx] = g; st.bits++;
      }
    }
    p += ni * npad;
  }
  return { tab, tbase, st };
}
export function megaCase4(bytes, nIn, nOut, opts) {
  const r = megaCase3(bytes, nIn, nOut, opts);
  
  return r;
}
export function megaWGSL4(cases, WMAX, NIMAX = 65, NOMAX = 33) {
  // 阶段一展开：每 (fw, k) 一块直线代码，下标夹到有效范围（重复项的原子或幂等），读可并发发出
  const blocks = [];
  for (let fw = 0; fw < WMAX; fw++) for (let k = 0; k < NIMAX; k++) blocks.push(`    {
      let fw = min(${fw}u, W - 1u);
      let k = min(${k}u, ni - 1u);
      let e = btab[tb + k * npad + fw * 32u + t];
      let am = 0u - (e >> 31u);
      let gidx = e & 0x7fffffffu;
      let va = (arena[gidx >> 5u] >> (gidx & 31u)) & 1u & ~am;
      let vl = (yout[min(gidx >> 5u, ${NOMAX * WMAX - 1}u)] >> (gidx & 31u)) & 1u & am;
      xb[(k * W + fw) * 32u + t] = va | vl;
    }`);
  const UNROLL = blocks.join('\n');
  return `// gatesim R4 串行段内核 v5：窄步（W ≤ ${WMAX}）全部入段。阶段 1a lane b 负责第 b 位：按逐位来源表（静态）取位写入 LDS 独立槽；阶段 1b 每 lane 拼一个输入字（移位量为循环常数）；
// 来源位号 bit31 标记「来自上一步输出（LDS yout）」，两路都读、按表掩码选取（无按值分支）。阶段二模板直线门代码（门只以 ~(a & b) 出现），输出写回 arena（地址同 R3）并留 LDS。
struct P { g0: u32, g1: u32, k0: u32, k1: u32 }
@group(0) @binding(0) var<uniform> p: P;
@group(0) @binding(1) var<storage, read> grp: array<u32>;
@group(0) @binding(6) var<storage, read_write> arena: array<u32>;
@group(0) @binding(7) var<storage, read> btab: array<u32>;
@group(0) @binding(8) var<storage, read> tbase: array<u32>;
var<workgroup> xin: array<u32, ${NIMAX * WMAX}>;
var<workgroup> xb: array<u32, ${NIMAX * WMAX * 32}>;
var<workgroup> yout: array<u32, ${NOMAX * WMAX}>;
@compute @workgroup_size(32)
fn main(@builtin(local_invocation_index) t: u32) {
  let k0 = p.k0;
  let k1 = p.k1;
  let km = p.k1;
  for (var gi = p.g0; gi < p.g1; gi++) {
    let tpl = grp[9u * gi];
    let W = grp[9u * gi + 1u];
    let ni = grp[9u * gi + 3u];
    let out = grp[9u * gi + 2u];
    let tb = tbase[gi];
    let npad = 32u * W;
${UNROLL}
    workgroupBarrier();
    for (var i = t; i < ni * W; i += 32u) {
      var acc = 0u;
      for (var b = 0u; b < 32u; b++) { acc = acc | (xb[i * 32u + b] << b); }
      xin[i] = acc;
    }
    workgroupBarrier();
    switch tpl {
${cases.map(c => `      case ${c.id}u: {
        for (var w = t; w < W; w += 32u) {
${c.body.split('\n').filter(l => l.trim()).map(l => '        ' + l).join('\n')}
        }
      }`).join('\n')}
      default: {}
    }
    storageBarrier();
    workgroupBarrier();
  }
}
`;
}

// ---------------- v6：v3 的步表改为每 (输入 k, 字 fw) 一项精确来源 → 多成员单比特步也可入段 ----------------
function inputForms6(L, gi, rowsA, cm, members, wordmap) {
  const q = L.GR(gi), ni = q[3], W = q[1], f = [];
  for (let k = 0; k < ni; k++) for (let fw = 0; fw < W; fw++) {
    const mo = 5 * wordmap[q[8] + fw], wOff = members[mo + 1], n = members[mo + 3], e = 3 * (members[mo + 4] + k), rb = rowsA[e + 1], off = rowsA[e + 2], wl = fw - wOff;
    if (n === 1) { f.push({ single: true, gi: rb + cm[off] }); continue; }
    const c0 = cm[off]; let ident = (rb + c0) % 32 === 0, bc = true;
    for (let c = 1; c < n && (ident || bc); c++) { const v = cm[off + c]; if (v !== c0 + c) ident = false; if (v !== c0) bc = false; }
    if (ident) { f.push({ single: false, word: (rb + c0) / 32 + wl }); continue; }
    if (bc) { f.push({ single: true, bcast: true, gi: rb + c0 }); continue; }
    return null;
  }
  return f;
}
export function planSegments6(L, wmax, rowsA, cm, members, wordmap, set = MEGA_SET) {
  const T = L.meta.templates, items = [], forms = new Array(L.NG);
  for (let i = 0; i < L.NG; i++) {
    const q = L.GR(i);
    const narrow = set.includes(T[q[0]]) && q[1] <= wmax && (forms[i] = inputForms6(L, i, rowsA, cm, members, wordmap)) !== null;
    const last = items[items.length - 1];
    if (narrow && last && last.kind === 'seg' && last.g1 === i) last.g1 = i + 1;
    else items.push(narrow ? { kind: 'seg', g0: i, g1: i + 1 } : { kind: 'grp', g: i });
  }
  L._forms = forms;
  return items;
}
export function buildStepTable6(L) {
  // 每 (k, fw) 两个 vec4：[arena 字, 移位, 掩码, 0] [yout 字, 0, yout 掩码, yout 移位]；值 = ((arena[a]>>sh)&mask) | ((yout[ya]&ymask)>>ysh)
  const out = [], sbase = new Uint32Array(L.NG), st = { single: 0, aligned: 0, ldsCarry: 0 };
  for (const it of L.items) if (it.kind === 'seg') for (let gi = it.g0; gi < it.g1; gi++) {
    sbase[gi] = out.length / 4;
    const prev = gi > it.g0 ? L.GR(gi - 1) : null;
    for (const x of L._forms[gi]) {
      const word = x.single ? Math.floor(x.gi / 32) : x.word, bit = x.single ? x.gi % 32 : 0;
      if (prev && !x.bcast && word >= prev[2] && word < prev[2] + prev[7] * prev[1]) {
        const rel = word - prev[2];
        if (x.single) out.push(0, 0, 0, 0, rel, 0, (1 << bit) >>> 0, bit); else out.push(0, 0, 0, 0, rel, 0, 0xffffffff, 0);
        st.ldsCarry++; continue;
      }
      if (x.single) { out.push(word, bit, 1, 0, 0, x.bcast ? 0xffffffff : 0, 0, 0); st[x.bcast ? 'bcast' : 'single'] = (st[x.bcast ? 'bcast' : 'single'] || 0) + 1; } else { out.push(word, 0, 0xffffffff, 0, 0, 0, 0, 0); st.aligned++; }
    }
  }
  return { stab: Uint32Array.from(out.length ? out : [0, 0, 0, 0, 0, 0, 0, 0]), sbase, st };
}
export function megaWGSL6(cases, WMAX) {
  // 与 v3 相同，唯一差别：项下标 e = sb + 2*it（每 (k,fw) 一项），字步长恒为 0
  return megaWGSL3(cases, WMAX).replace('let e = sb + 2u * k;', 'let e = sb + 2u * it;')
    .replace('let fromArena = (arena[s0.x + w * s0.w] >> s0.y) & s0.z;', 'let fa = (arena[s0.x + w * s0.w] >> s0.y) & s0.z;\n      let fromArena = (fa & ~s1.y) | (bitcast<u32>(extractBits(bitcast<i32>(fa << 31u), 31u, 1u)) & s1.y);')
    .replace('let fromLds = (yout[s1.x + w * s1.y] & s1.z) >> s1.w;', 'let fromLds = (yout[s1.x] & s1.z) >> s1.w;')
    .replace('// gatesim R4 串行段内核 v3：只收全快速输入的步', '// gatesim R4 串行段内核 v6：只收全快速输入的步（每 (输入, 字) 一项精确来源）');
}

// ---------------- v7：v6 + 下一步 arena 输入预取（与本步门代码重叠）+ 按需内存栅栏 ----------------
export function buildStepTable7(L) {
  const b = buildStepTable6(L), fence = new Uint32Array(L.NG);
  // 段内：若更靠后的步（非紧邻下一步，紧邻的走 LDS）从 arena 读本步输出，则本步写后需栅栏
  for (const it of L.items) if (it.kind === 'seg') {
    for (let gi = it.g0; gi < it.g1; gi++) {
      const q = L.GR(gi), lo = q[2], hi = q[2] + q[7] * q[1];
      outer: for (let gj = gi + 2; gj < it.g1; gj++) for (const x of L._forms[gj]) {
        const w = x.single ? Math.floor(x.gi / 32) : x.word;
        if (w >= lo && w < hi) { fence[gi] = 1; break outer; }
      }
    }
  }
  b.fence = fence; b.st.fences = fence.reduce((a, v) => a + v, 0);
  return b;
}
export function megaWGSL7(cases, WMAX, NIMAX = 65, NOMAX = 33) {
  const R = Math.ceil(NIMAX * WMAX / 32);
  const pre = [], asm = [], st = [];
  for (let r = 0; r < R; r++) {
    pre.push(`      let n${r} = min(t + ${32 * r}u, nnit - 1u);
      let q${r} = stab[nsb + 2u * n${r}];
      let pf${r} = (arena[q${r}.x] >> q${r}.y) & q${r}.z;`);
    asm.push(`      let c${r} = min(t + ${32 * r}u, nit - 1u);
      let s${r} = stab[sb + 2u * c${r} + 1u];
      xin[c${r}] = xa[cur * ${NIMAX * WMAX}u + c${r}] | ((yout[s${r}.x] & s${r}.z) >> s${r}.w);`);
    st.push(`      xa[(1u - cur) * ${NIMAX * WMAX}u + n${r}] = pf${r};`);
  }
  return `// gatesim R4 串行段内核 v7：v6 + 预取（本步开始即发出下一步的 arena 输入读，与本步门代码重叠）+ 按需内存栅栏（表决定）。
// 搬运：值 = ((arena[a]>>sh)&mask) | ((yout[ya]&ymask)>>ysh)，全部参数来自静态表，无按值分支；门代码由 genWGSL 生成，门只以 ~(a & b) 出现。
struct P { g0: u32, g1: u32, k0: u32, k1: u32 }
@group(0) @binding(0) var<uniform> p: P;
@group(0) @binding(1) var<storage, read> grp: array<u32>;
@group(0) @binding(2) var<storage, read> fence: array<u32>;
@group(0) @binding(6) var<storage, read_write> arena: array<u32>;
@group(0) @binding(7) var<storage, read> stab: array<vec4<u32>>;
@group(0) @binding(8) var<storage, read> sbase: array<u32>;
var<workgroup> xin: array<u32, ${NIMAX * WMAX}>;
var<workgroup> xa: array<u32, ${2 * NIMAX * WMAX}>;
var<workgroup> yout: array<u32, ${NOMAX * WMAX}>;
@compute @workgroup_size(32)
fn main(@builtin(local_invocation_index) t: u32) {
  let k0 = p.k0;
  let k1 = p.k1;
  {                                                  // 段首步的 arena 部分
    let sb = sbase[p.g0];
    let nit = grp[9u * p.g0 + 3u] * grp[9u * p.g0 + 1u];
    for (var it = t; it < nit; it += 32u) { let q = stab[sb + 2u * it]; xa[it] = (arena[q.x] >> q.y) & q.z; }
  }
  workgroupBarrier();
  for (var gi = p.g0; gi < p.g1; gi++) {
    let cur = (gi - p.g0) & 1u;
    let tpl = grp[9u * gi];
    let W = grp[9u * gi + 1u];
    let out = grp[9u * gi + 2u];
    let sb = sbase[gi];
    let nit = grp[9u * gi + 3u] * W;
    let nx = min(gi + 1u, p.g1 - 1u);                // 最后一步时预取自身（无害，结果不用）
    let nsb = sbase[nx];
    let nnit = grp[9u * nx + 3u] * grp[9u * nx + 1u];
${pre.join('\n')}
${asm.join('\n')}
    workgroupBarrier();
    switch tpl {
${cases.map(c => `      case ${c.id}u: {
        for (var w = t; w < W; w += 32u) {
${c.body.split('\n').filter(l => l.trim()).map(l => '        ' + l).join('\n')}
        }
      }`).join('\n')}
      default: {}
    }
${st.join('\n')}
    if (fence[gi] != 0u) { storageBarrier(); }
    workgroupBarrier();
  }
}
`;
}

// ---------------- R5 W1：同构串行链内核（单实例 add 链，进位留寄存器） ----------------
// 链：段内连续的组，模板都是 add、W=1、单成员 n=1，且第 2 步起前 32 个输入恰为上一步的 32 个输出（位 0）。
export function splitChains(L, minLen = 8) {
  const T = L.meta.templates, out = [];
  const isAdd1 = gi => { const q = L.GR(gi); return T[q[0]] === 'add' && q[1] === 1 && q[5] === 1 && L._forms[gi] && L._forms[gi].length === 64 && L._forms[gi].every(x => x.single); };
  const carries = gi => { const p = L.GR(gi - 1), f = L._forms[gi]; for (let k = 0; k < 32; k++) if (f[k].gi !== (p[2] + k) * 32) return false; return true; };
  for (const it of L.items) {
    if (it.kind !== 'seg') { out.push(it); continue; }
    let i = it.g0, segStart = it.g0;
    while (i < it.g1) {
      if (!isAdd1(i)) { i++; continue; }
      let j = i + 1; while (j < it.g1 && isAdd1(j) && carries(j)) j++;
      // 预取安全：链内各步的非进位输入不得来自链内任何一步的输出
      const lo = Math.min(...Array.from({ length: j - i }, (_, d) => L.GR(i + d)[2])), hi = Math.max(...Array.from({ length: j - i }, (_, d) => L.GR(i + d)[2] + 32));
      for (let gi = i; gi < j; gi++) for (let k = 32; k < 64; k++) { const w = Math.floor(L._forms[gi][k].gi / 32); if (w >= lo && w < hi) for (let d = i; d < j; d++) { const o = L.GR(d)[2]; if (w >= o && w < o + 32) throw new Error('chain non-carry input from chain output'); } }
      if (j - i >= minLen) { if (i > segStart) out.push({ kind: 'seg', g0: segStart, g1: i }); out.push({ kind: 'chain', g0: i, g1: j }); segStart = j; }
      i = j;
    }
    if (segStart < it.g1) out.push({ kind: 'seg', g0: segStart, g1: it.g1 });
  }
  return out;
}
// 链表 ctab：每链 [首步 32 个进位来源位号][每步：输出字, 32 个非进位输入来源位号]
// consumed：arena 字是否被「链内寄存器进位」之外的任何读者读取（由 layer_exec 按全部输入行/D 表/输出表静态算出）
export function buildChainTable(L, consumed = null) {
  const tab = []; let n = 0, skipped = 0;
  for (const it of L.items) if (it.kind === 'chain') {
    it.base = tab.length; const f0 = L._forms[it.g0];
    for (let k = 0; k < 32; k++) tab.push(f0[k].gi);
    for (let gi = it.g0; gi < it.g1; gi++) {
      const f = L._forms[gi], o = L.GR(gi)[2];
      let st = 1; if (consumed) { st = 0; for (let j = 0; j < 32; j++) if (consumed[o + j]) { st = 1; break; } }
      if (!st) skipped++;
      tab.push(o, st); for (let k = 32; k < 64; k++) tab.push(f[k].gi);
    }
    n += it.g1 - it.g0;
  }
  return { ctab: Uint32Array.from(tab.length ? tab : [0]), steps: n, skippedStores: skipped };
}
export function chainWGSL(addBody) {
  // 三级软件流水 + 向量化：地址加 lane 相关的运行时零（t & p.zero，p.zero 为 uniform 干净字段），防止编译器把整条链标量化到 SALU
  // （标量化既慢又会用 s_bitcmp 取位）；32 lane 算同一结果，只有 lane 0 写回
  let body = addBody.replace(/let x(\d+) = xin\[(\d+)u \* W \+ w\];/g, (m, r, k) => +k < 32 ? `let x${r} = c${k};` : `let x${r} = b${k};`);
  body = body.replace(/  arena\[out \+ (\d+)u \* W \+ w\] = ([a-z0-9]+);/g, (m, j, v) => `  if (t == 0u && wr != 0u) { arena[o + ${j}u] = ${v}; }\n  n${j} = ${v};`);
  body = body.replace(/  yout\[\d+u \* W \+ w\] = [a-z0-9]+;\n?/g, '');
  if (/xin\[|yout\[|inp\[|outb\[/.test(body)) throw new Error('chain body refs');
  const R = n => [...Array(32).keys()].map(n).join('\n');
  const bit = g => `(arena[(${g} >> 5u) + lz] >> (${g} & 31u)) & 1u`;
  return `// gatesim R5 同构串行链内核（add，单实例，三级软件流水，向量化）：进位留寄存器；非进位输入按静态表取位；门代码由 genWGSL 生成，门只以 ~(a & b) 出现
struct P { base: u32, L: u32, k0: u32, k1: u32, zero: u32, pad0: u32, pad1: u32, pad2: u32 }
@group(0) @binding(0) var<uniform> p: P;
@group(0) @binding(1) var<storage, read> ctab: array<u32>;
@group(0) @binding(2) var<storage, read_write> arena: array<u32>;
@compute @workgroup_size(32)
fn main(@builtin(local_invocation_index) t: u32) {
  let lz = t & p.zero;
  let k0 = p.k0;
  let k1 = p.k1;
  let km = p.k1;
  let last = p.L - 1u;
${R(k => `  var c${k} = ${bit(`ctab[p.base + ${k}u + lz]`)};`)}
  let e0 = p.base + 32u + lz;
${R(i => `  let ga${32 + i} = ctab[e0 + ${2 + i}u];`)}
${R(i => `  var b${32 + i} = ${bit(`ga${32 + i}`)};`)}
  let e1 = p.base + 32u + min(1u, last) * 34u + lz;
${R(i => `  var gb${32 + i} = ctab[e1 + ${2 + i}u];`)}
  for (var s = 0u; s < p.L; s++) {
    let e = p.base + 32u + s * 34u + lz;
    let o = ctab[e];
    let wr = ctab[e + 1u];
    let e2 = p.base + 32u + min(s + 2u, last) * 34u + lz;
${R(i => `    let gc${32 + i} = ctab[e2 + ${2 + i}u];`)}
${R(i => `    let nb${32 + i} = ${bit(`gb${32 + i}`)};`)}
${R(k => `    var n${k} = 0u;`)}
${body.split('\n').filter(l => l.trim()).map(l => '  ' + l).join('\n')}
${R(k => `    c${k} = n${k};`)}
${R(i => `    b${32 + i} = nb${32 + i};`)}
${R(i => `    gb${32 + i} = gc${32 + i};`)}
  }
}
`;
}

// ---------------- R5 W4：持久内核（一串连续残余组一次派发，组间原子全局屏障；跨工作组数据一律原子读写） ----------------
export function pkCase(bytes, nIn, nOut, opts, strict = false) {
  const nl = decode(bytes), an = analyze(nl, nIn, nOut), gw = genWGSL(nl, nIn, nOut, an, 1 << 22, 64, strict, { ...opts, K: 1 << 22, cut: 'gates' });
  if (gw.nSeg !== 1) return null;
  let body = gw.shaders[0].split('let k1 = p.k1;')[1].replace(/\}\s*$/, '').replace('let km = p.pad;', '');
  body = body.replace(/let x(\d+) = inp\[(\d+)u \* W \+ w\];/g, (m, r, k) => `let x${r} = g6(${k}u, w, W, wm0);`);
  body = body.replace(/  outb\[(\d+)u \* W \+ w\] = ([a-z0-9]+);/g, (m, j, v) => `  atomicStore(&arena[out + ${j}u * W + w], ${v});`);
  if (/inp\[|outb\[|st0\[|st1\[|sc\[/.test(body)) return null;
  return body;
}
export function pkWGSL(cases) {
  return `// gatesim R5 持久内核：一串连续残余组一次派发；每线程负责字 w（跨工作组步进），输入按 gather4 行分类表搬运（对齐/广播/一般，无按值分支），
// 门代码由 genWGSL 生成（门只以 ~(a & b) 出现）；跨工作组共享的 arena 一律 atomicLoad/atomicStore（RADV 跨 CU 一致性）；组间原子全局屏障。
struct P { g0: u32, g1: u32, k0: u32, k1: u32, G: u32, barBase: u32, pad0: u32, pad1: u32 }
@group(0) @binding(0) var<uniform> p: P;
@group(0) @binding(1) var<storage, read> grp: array<u32>;
@group(0) @binding(2) var<storage, read> rows4: array<vec4<u32>>;
@group(0) @binding(3) var<storage, read> colmap: array<u32>;
@group(0) @binding(4) var<storage, read> members: array<u32>;
@group(0) @binding(5) var<storage, read> wordmap: array<u32>;
@group(0) @binding(6) var<storage, read_write> arena: array<atomic<u32>>;
@group(0) @binding(7) var<storage, read_write> bar: array<atomic<u32>>;
fn g6(r: u32, fw: u32, W: u32, wm0: u32) -> u32 {
  let mo = 5u * wordmap[wm0 + fw];
  let wl = fw - members[mo + 1u];
  let n = members[mo + 3u];
  let e = 2u * (members[mo + 4u] + r);
  let d0 = rows4[e];
  let d1 = rows4[e + 1u];
  let vA = atomicLoad(&arena[d0.x + wl * (d0.y & 1u)]) & d0.y;
  let bit = (atomicLoad(&arena[d0.z >> 5u]) >> (d0.z & 31u)) & 1u;
  let vB = bitcast<u32>(extractBits(bitcast<i32>(bit << 31u), 31u, 1u)) & d0.w;
  let nb = min(32u, n - min(n, wl * 32u)) * d1.z;
  var acc = vA | vB;
  for (var b = 0u; b < nb; b++) {
    let gi = d1.x + colmap[d1.y + wl * 32u + b];
    acc = acc | (((atomicLoad(&arena[gi >> 5u]) >> (gi & 31u)) & 1u) << b);
  }
  return acc;
}
@compute @workgroup_size(64)
fn main(@builtin(workgroup_id) wg: vec3<u32>, @builtin(local_invocation_index) li: u32) {
  let k0 = p.k0;
  let k1 = p.k1;
  let km = p.k1;
  let T = 64u * p.G;
  var tgt = p.barBase;
  for (var gi = p.g0; gi < p.g1; gi++) {
    let tpl = grp[9u * gi];
    let W = grp[9u * gi + 1u];
    let out = grp[9u * gi + 2u];
    let wm0 = grp[9u * gi + 8u];
    switch tpl {
${cases.map(c => `      case ${c.id}u: {
        for (var w = wg.x * 64u + li; w < W; w += T) {
${c.body.split('\n').filter(l => l.trim()).map(l => '        ' + l).join('\n')}
        }
      }`).join('\n')}
      default: {}
    }
    // 全局屏障：本组所有写完成后，每工作组到达一次；等全部 G 个到达
    storageBarrier();
    workgroupBarrier();
    tgt = tgt + p.G;
    if (li == 0u) {
      atomicAdd(&bar[0], 1u);
      var guard = 0u;
      loop { if (atomicLoad(&bar[0]) >= tgt || guard > 20000000u) { break; } guard++; }
      if (guard > 20000000u) { atomicStore(&bar[1], 1u); }
    }
    workgroupBarrier();
  }
}
`;
}
