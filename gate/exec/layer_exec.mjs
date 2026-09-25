// gatesim R3 整层执行器（Deno 与浏览器共用）：执行 trace_layer.py 产出的静态中间表示（R60 第 0 层调用程序）。
// 每次调用 = 一个 gather（连线搬运：按静态连线表把来源位挪进本调用的位切片输入字）+ R2 的模板段 shader（门运算，只有 ~(a&b)）。
// arena（u32）：常量区 | 本拍输入区 | 旧状态区（LATCH Q）| 各调用输出区 [n_out][W]。
// 拍末：按 D 表把 2097162 个 D 位打包进新状态缓冲（全部组合求值之后），再整体复制进旧状态区（提交）；输出按输出表打包读回。
import { decode, analyze, genWGSL } from './gen.mjs';
import { MEGA_SET, megaCase, megaWGSL, planSegments, buildStepTable, megaCase2, megaWGSL2, buildStepTable2, planSegments3, buildStepTable3, megaCase3, megaWGSL3, planSegments4, buildBitTable4, megaCase4, megaWGSL4, planSegments6, buildStepTable6, megaWGSL6, buildStepTable7, megaWGSL7, splitChains, buildChainTable, chainWGSL, megaCase3 as megaCaseC, pkCase, pkWGSL } from './mega.mjs';

export const GATHER5_WGSL = `// gatesim R8 gather5：模式/地址/移位量/掩码来自静态表（掩码是表里的字，不由条件生成）；线值只经 >> & | << 与 bfe（位复制）搬运
struct G { W: u32, k0: u32, k1: u32, km: u32, ni: u32, wm0: u32, pad0: u32, pad1: u32 }
@group(0) @binding(0) var<uniform> g: G;
@group(0) @binding(1) var<storage, read> rows5: array<vec4<u32>>;
@group(0) @binding(2) var<storage, read> colmap: array<u32>;
@group(0) @binding(3) var<storage, read> members: array<u32>;
@group(0) @binding(4) var<storage, read> wordmap: array<u32>;
@group(0) @binding(5) var<storage, read> arena: array<u32>;
@group(0) @binding(6) var<storage, read_write> dst: array<u32>;
@group(0) @binding(7) var<storage, read> wtab: array<vec2<u32>>;
@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) gid: vec3<u32>, @builtin(num_workgroups) nw: vec3<u32>) {
  let x = gid.x + gid.y * nw.x * 64u;
  if (x >= g.ni * g.W) { return; }
  let r = x / g.W;
  let fw = x % g.W;
  let mo = 5u * wordmap[g.wm0 + fw];
  let wl = fw - members[mo + 1u];
  let n = members[mo + 3u];
  let d = rows5[members[mo + 4u] + r];                // [地址（对齐字基 / 广播位号 / 一般行基）, 对齐掩码字, 偏移 | 类别<<30, 广播掩码字]
  let cls = d.z >> 30u;
  let off = d.z & 0x3fffffffu;
  let isA = u32(cls == 0u); let isB = u32(cls == 1u); let isG = u32(cls == 2u); let isW = u32(cls == 3u);
  let wt = wtab[(off + wl) * isW];                    // 类别 3：[对齐字地址 或 一般段偏移, 对齐掩码字]；其余类别读第 0 项 (0, 0)
  let wGen = u32(wt.y == 0u) * isW;
  let vA = arena[(d.x + wl) * isA + wt.x * (isW - wGen)] & (d.y | wt.y);
  let bit = (arena[(d.x >> 5u) * isB] >> ((d.x & 31u) * isB)) & 1u;
  let vB = bitcast<u32>(extractBits(bitcast<i32>(bit << 31u), 31u, 1u)) & d.w;
  let nb = min(32u, n - min(n, wl * 32u)) * (isG | wGen);
  let rb = d.x * isG;
  let co = (off + wl * 32u) * isG + wt.x * wGen;
  var acc = vA | vB;
  for (var b = 0u; b < nb; b++) {
    let gi = rb + colmap[co + b];
    acc = acc | (((arena[gi >> 5u] >> (gi & 31u)) & 1u) << b);
  }
  dst[x] = acc;
}
`;
export const PACK_WGSL = `// gatesim R3 pack（拍末采 D / 读输出）：来源位号来自静态表
struct Q { count: u32, a: u32, b: u32, c: u32 }
@group(0) @binding(0) var<uniform> q: Q;
@group(0) @binding(1) var<storage, read> tab: array<u32>;
@group(0) @binding(2) var<storage, read> arena: array<u32>;
@group(0) @binding(3) var<storage, read_write> dst: array<u32>;
@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let i = gid.x;
  if (i * 32u >= q.count) { return; }
  var acc = 0u;
  for (var b = 0u; b < 32u; b++) {
    let idx = i * 32u + b;
    if (idx < q.count) {
      let gi = tab[idx];
      acc = acc | (((arena[gi >> 5u] >> (gi & 31u)) & 1u) << b);
    }
  }
  dst[i] = acc;
}
`;
// 一拍：写输入 → 按调用顺序（拓扑序）gather+模板段 → 采 D 打包 → 读输出打包 → 提交新状态（复制进旧状态区）→ 读回输出
// chunk：每次提交的调用数（R2 环超时防护：单次提交 GPU 时长须远小于超时）
export async function tick(g, L, raw16, valid, reset, { chunk = 1500, readState = false, onChunk, commitAfter = null, inputFrom = null, vrFrom = null, noRead = false, inputNone = false, noCommit = false } = {}) {
  const device = g.device, m = L.meta;
  if (inputNone) { }                                   // R6：输入已由调用方在 GPU 内装好（总线取位 / 复制）
  else if (inputFrom) {                                    // R5 串接：输入取自上一层的输出字（GPU 内复制），valid/reset 另写
    const enc = device.createCommandEncoder(); enc.copyBufferToBuffer(inputFrom, 0, L.arena, m.off_in * 4, 768 * 4);
    if (vrFrom) enc.copyBufferToBuffer(vrFrom, 0, L.arena, (m.off_in + 768) * 4, 4);   // R9：valid/reset 字取自 GPU 内（门控后的 core_valid 与宿主 reset），整字复制
    device.queue.submit([enc.finish()]);
    if (!vrFrom) device.queue.writeBuffer(L.arena, (m.off_in + 768) * 4, Uint32Array.from([(valid ? 1 : 0) | (reset ? 2 : 0)]));
  } else {
    const inW = new Uint32Array(769);
    inW.set(new Uint32Array(raw16.buffer, raw16.byteOffset, 768)); inW[768] = (valid ? 1 : 0) | (reset ? 2 : 0);
    device.queue.writeBuffer(L.arena, m.off_in * 4, inW);
  }
  if (L.items) return tickItems(g, L, { chunk, readState, commitAfter, noRead, noCommit });
  const early = commitAfter !== null;                                  // 负控：提交提前到第 commitAfter 次调用之后（求值中途）
  if (early) chunk = commitAfter;
  for (let s = 0; s < L.NG; s += chunk) {
    const enc = device.createCommandEncoder(), pass = enc.beginComputePass();
    for (let i = s; i < Math.min(L.NG, s + chunk); i++) {
      const q = L.GR(i), t = L.tm[m.templates[q[0]]], uo = i * 256;
      pass.setPipeline(L.gatherPipe); pass.setBindGroup(0, L.gatherBG, [uo]); pass.dispatchWorkgroups(Math.ceil(q[3] * q[1] / 64));
      for (let k = 0; k < t.pipes.length; k++) { pass.setPipeline(t.pipes[k]); pass.setBindGroup(0, t.bg, [uo, q[2] * 4]); pass.dispatchWorkgroups(Math.ceil(q[1] / t.WG)); }
    }
    if (early && s === 0) {
      pass.setPipeline(L.packPipe); pass.setBindGroup(0, L.packD, [0]); pass.dispatchWorkgroups(Math.ceil(Math.ceil(m.nstate / 32) / 64));
      pass.end(); enc.copyBufferToBuffer(L.newState, 0, L.arena, m.off_st * 4, L.newState.size); device.queue.submit([enc.finish()]); continue;
    }
    if (s + chunk >= L.NG) {
      if (!early) { pass.setPipeline(L.packPipe); pass.setBindGroup(0, L.packD, [0]); pass.dispatchWorkgroups(Math.ceil(Math.ceil(m.nstate / 32) / 64));
      }
      pass.setPipeline(L.packPipe); pass.setBindGroup(0, L.packO, [256]); pass.dispatchWorkgroups(Math.ceil(L.outWordsN / 64));
    }
    pass.end();
    if (s + chunk >= L.NG) {
      if (!early) enc.copyBufferToBuffer(L.newState, 0, L.arena, m.off_st * 4, L.newState.size);      // 提交：全部求值之后
      enc.copyBufferToBuffer(L.outWords, 0, L.rbOut, 0, L.rbOut.size);
      if (readState) enc.copyBufferToBuffer(L.newState, 0, L.rbState, 0, L.rbState.size);
    }
    device.queue.submit([enc.finish()]);
    if (onChunk) await onChunk(s);
  }
  await L.rbOut.mapAsync(GPUMapMode.READ); const ob_ = L.rbOut.getMappedRange().slice(0); const out = L.meta.nout ? new Uint32Array(ob_) : new Uint16Array(ob_); L.rbOut.unmap();
  let state = null;
  if (readState) { await L.rbState.mapAsync(GPUMapMode.READ); state = new Uint8Array(L.rbState.getMappedRange().slice(0, Math.ceil(m.nstate / 8))); L.rbState.unmap(); }
  return { out, state };
}
export function gatherDispatch(pass, L, q) {
  if (L.gather4) { const n = Math.ceil(q[3] * q[1] / 64), x = Math.min(n, 65535); return pass.dispatchWorkgroups(x, Math.ceil(n / x)); }
  if (!L.gather3) return pass.dispatchWorkgroups(Math.ceil(q[3] * q[1] / 64));
  const n = q[3] * q[1], x = Math.min(n, 65535); pass.dispatchWorkgroups(x, Math.ceil(n / x));
}
// R4：按条目（串行段 / 宽组）派发的一拍；拍末采 D、打包输出、提交同 R3
async function tickItems(g, L, { chunk, readState, commitAfter, noRead = false, noCommit = false }) {
  const device = g.device, m = L.meta, items = L.items, early = commitAfter !== null;
  if (L.bar) device.queue.writeBuffer(L.bar, 0, new Uint32Array(4));        // 持久内核屏障计数每拍清零
  if (L.stateStore) { const e0 = device.createCommandEncoder(); e0.copyBufferToBuffer(L.stateStore, 0, L.arena, m.off_st * 4, L.stateStore.size); device.queue.submit([e0.finish()]); }
  const commitDst = L.stateStore || L.arena, commitOff = L.stateStore ? 0 : m.off_st * 4;
  const ck = early ? commitAfter : chunk;
  for (let s = 0; s < items.length; s += ck) {
    const enc = device.createCommandEncoder(), pass = enc.beginComputePass();
    for (let x = s; x < Math.min(items.length, s + ck); x++) {
      const it = items[x];
      if (it.kind === 'seg') { pass.setPipeline(L.megaPipe); pass.setBindGroup(0, L.megaBG, [it.u]); pass.dispatchWorkgroups(1); continue; }
      if (it.kind === 'chain') { pass.setPipeline(L.chainPipe); pass.setBindGroup(0, L.chainBG, [it.u]); pass.dispatchWorkgroups(1); continue; }
      if (it.kind === 'pk') { pass.setPipeline(L.pkPipe); pass.setBindGroup(0, L.pkBG, [it.u]); pass.dispatchWorkgroups(L.pkG); continue; }
      const i = it.g, q = L.GR(i), t = L.tm[m.templates[q[0]]], uo = i * 256;
      if (L.readFused) { for (let k = 0; k < t.fpipes.length; k++) { pass.setPipeline(t.fpipes[k]); pass.setBindGroup(0, t.fbg, [uo]); pass.dispatchWorkgroups(Math.ceil(q[1] / t.WG)); } continue; }
      if (L.readFast && L.fastOK[i]) { for (let k = 0; k < t.rpipes.length; k++) { pass.setPipeline(t.rpipes[k]); pass.setBindGroup(0, t.rbg, [uo]); pass.dispatchWorkgroups(Math.ceil(q[1] / t.WG)); } continue; }
      pass.setPipeline(L.gatherPipe); pass.setBindGroup(0, L.gatherBG, [uo]); gatherDispatch(pass, L, q);
      for (let k = 0; k < t.pipes.length; k++) { pass.setPipeline(t.pipes[k]); pass.setBindGroup(0, t.bg, [uo, q[2] * 4]); pass.dispatchWorkgroups(Math.ceil(q[1] / t.WG)); }
    }
    const lastChunk = s + ck >= items.length;
    if ((early && s === 0) || (!early && lastChunk)) { pass.setPipeline(L.packPipe); pass.setBindGroup(0, L.packD, [0]); pass.dispatchWorkgroups(Math.ceil(Math.ceil(m.nstate / 32) / 64)); }
    if (lastChunk) { pass.setPipeline(L.packPipe); pass.setBindGroup(0, L.packO, [256]); pass.dispatchWorkgroups(Math.ceil(L.outWordsN / 64)); }
    pass.end();
    if (early && s === 0) enc.copyBufferToBuffer(L.newState, 0, commitDst, commitOff, L.newState.size);
    if (lastChunk) {
      if (!early && !noCommit && m.nstate) enc.copyBufferToBuffer(L.newState, 0, commitDst, commitOff, L.newState.size);   // noCommit：control_begin 只读旧状态
      if (!noRead || readState) enc.copyBufferToBuffer(L.outWords, 0, L.rbOut, 0, L.rbOut.size);
      if (readState) enc.copyBufferToBuffer(L.newState, 0, L.rbState, 0, L.rbState.size);
    }
    device.queue.submit([enc.finish()]);
  }
  if (noRead && !readState) return { out: null, state: null };
  await L.rbOut.mapAsync(GPUMapMode.READ); const ob_ = L.rbOut.getMappedRange().slice(0); const out = L.meta.nout ? new Uint32Array(ob_) : new Uint16Array(ob_); L.rbOut.unmap();
  let state = null;
  if (readState) { await L.rbState.mapAsync(GPUMapMode.READ); state = new Uint8Array(L.rbState.getMappedRange().slice(0, Math.ceil(m.nstate / 8))); L.rbState.unmap(); }
  return { out, state };
}
