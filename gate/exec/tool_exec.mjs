// gatesim 生产包：工具旁路合并拍（R64 K6 + 合并选择器 + 胶合 A″ k6_glue3）。由 R9 exec/tool_exec.mjs 的 A3 分支整理而来（去掉 A / A′ 胶合、负控与对拍读回）；
// 静态位表与 R9 A3 逐项相同（rounds/R10/accept/tables_check.mjs 核对）。
// 一拍（全部在 GPU 内串接，单元之间只做整字复制与静态位表取位；宿主只写宿主字、只读端口）：
//   宿主字：external17 | prompt_valid<<17 | reset<<18 | end_prompt<<19 | gen<<20 | cancel<<21 | stop<<22；字 2 = max_tokens9
//   1 核心控制器旧 Q → 总线 QOLD   2 K6（提交状态）   3 胶合（核心前）：run = (prompt_valid & ce) | (gen & ~owner & ~ce_prev)
//   4 核心整拍（控制器与 52 层的 valid 取 run）   5 胶合（核心后，提交 ce_prev）：core_valid = mode_old & ~reset & (emit | ~run)，core_id = (emit & mode_old) ? action : held_old
//   6 合并选择器   7 读回端口
// 拍序与 R64 FORMAT 原文一致：仲裁拍核心不计算、只放 held 或由 K6 抢占；不抢占时核心此后每拍照常出 token；抢占时核心冻结直到 K6 结束。
import { tick } from './layer_exec.mjs';
export const TB = { HOST: 1, HOST2: 2, ONE: 3, BEGIN: 4, TAIL: 8, ERR: 16, QOLD: 70, K6: 72, GLUE: 73, MERGE: 74, END: 76 };
const BUS_WORDS = 256;
const B = (w, b) => w * 32 + b, ZERO = B(0, 0), H = i => B(TB.HOST, i), seq = (n, f) => [...Array(n).keys()].map(f);
// 静态位表（纯函数：Q = 核心控制器状态位数；tCtlBegin / tCtlEnd = assembleFull 的控制器取位表）
export function toolTables(Q, tCtlBegin, tCtlEnd) {
  const T = {
    tK6: [...seq(17, H), H(17), H(20), H(18), H(21), ...seq(9, i => B(TB.HOST2, i))],                      // K6：token17, valid, gen, reset, cancel, max_tokens9
    tGlueB: [B(TB.QOLD, 17), H(18), B(TB.K6, 20), B(TB.K6, 17), ZERO, H(17), H(20), ...Array(17).fill(ZERO), ...seq(17, i => B(TB.QOLD, i))],   // 胶合（核心前）：emit / action 为 0
    tGlueE: [B(TB.QOLD, 17), H(18), B(TB.K6, 20), B(TB.K6, 17), B(TB.END, 19), H(17), H(20), ...seq(17, i => B(TB.END, 23 + Q + i)), ...seq(17, i => B(TB.QOLD, i))],
    tMerge: [...seq(17, i => B(TB.GLUE, 2 + i)), ...seq(17, i => B(TB.K6, i)), B(TB.K6, 17), B(TB.GLUE, 1), B(TB.K6, 18), B(TB.K6, 19), B(TB.K6, 20), H(22)],   // 选择器 40
    tCtlBegin: [...tCtlBegin], tCtlEnd: [...tCtlEnd],
    tVR: [B(TB.GLUE, 0), H(18)],                                                                          // 52 层的 valid / reset 字
  };
  T.tCtlBegin[17] = B(TB.GLUE, 0); T.tCtlEnd[17] = B(TB.GLUE, 0);                                          // 核心控制器 valid = run
  return T;
}
export function assembleTool(g, F, { k6, merge, glue3 }) {
  const device = g.device, U = GPUBufferUsage, bus = F.bus, glue = glue3;
  if (!k6 || !merge || !glue) throw new Error('tool units missing');
  if (F.bus.size < BUS_WORDS * 4) throw new Error('bus too small');
  device.queue.writeBuffer(bus, TB.ONE * 4, Uint32Array.of(0xffffffff));
  const Q = F.ctl.meta.nstate, T = toolTables(Q, F.tabs.tCtlBegin, F.tabs.tCtlEnd);
  const pL = g.bglCache.get('ud,r,r,w');
  const mkU = n => { const b = device.createBuffer({ size: 256, usage: U.UNIFORM | U.COPY_DST }); device.queue.writeBuffer(b, 0, Uint32Array.from([n, 0, 0, 0])); return b; };
  const mkT = a => { const b = device.createBuffer({ size: Math.max(16, a.length * 4 + 128), usage: U.STORAGE | U.COPY_DST }); device.queue.writeBuffer(b, 0, Uint32Array.from(a)); return b; };
  const bg = (tab, dst, off, words) => device.createBindGroup({ layout: pL, entries: [{ binding: 0, resource: { buffer: mkU(tab.length), size: 16 } },
    { binding: 1, resource: { buffer: mkT(tab) } }, { binding: 2, resource: { buffer: bus } }, { binding: 3, resource: { buffer: dst, offset: off, size: words * 4 } }] });
  const vr = device.createBuffer({ size: 256, usage: U.STORAGE | U.COPY_SRC | U.COPY_DST });
  const iw = u => Math.ceil(u.meta.ninput / 32);
  const G = {
    k6: bg(T.tK6, k6.arena, k6.meta.off_in * 4, iw(k6)), glueB: bg(T.tGlueB, glue.arena, glue.meta.off_in * 4, iw(glue)), glueE: bg(T.tGlueE, glue.arena, glue.meta.off_in * 4, iw(glue)),
    merge: bg(T.tMerge, merge.arena, merge.meta.off_in * 4, iw(merge)), ctlBegin: bg(T.tCtlBegin, F.ctl.arena, F.ctl.meta.off_in * 4, 2), ctlEnd: bg(T.tCtlEnd, F.ctl.arena, F.ctl.meta.off_in * 4, 2),
    vr: bg(T.tVR, vr, 0, 1),
  };
  // 底线断言：embedding 只取 control_begin 输出（自产反馈）；K6 输入只来自宿主字
  const selfFed = F.selfFed && T.tK6.every(x => x === ZERO || Math.floor(x / 32) === TB.HOST || Math.floor(x / 32) === TB.HOST2);
  if (!selfFed) throw new Error('self-feed assertion failed');
  const rb = device.createBuffer({ size: 64, usage: U.MAP_READ | U.COPY_DST });
  return { ...F, tool: { k6, merge, glue, T, G, vr, rb, Q } };
}
const pack = (g, F, bgp, n) => { const e = g.device.createCommandEncoder(), p = e.beginComputePass(); p.setPipeline(F.pipe); p.setBindGroup(0, bgp, [0]); p.dispatchWorkgroups(Math.ceil(Math.ceil(n / 32) / 64)); p.end(); g.device.queue.submit([e.finish()]); };
const copy = (g, a, ao, b, bo, n) => { const e = g.device.createCommandEncoder(); e.copyBufferToBuffer(a, ao, b, bo, n); g.device.queue.submit([e.finish()]); };
// 一拍。host：{ external, promptValid, gen, reset, endPrompt, cancel, stop, maxTokens }；返回端口解读
export async function toolBeat(g, F, host, { chunk = 250 } = {}) {
  const dev = g.device, X = F.tool;
  const hw = (host.external & 0x1ffff) | (host.promptValid ? 1 << 17 : 0) | (host.reset ? 1 << 18 : 0) | (host.endPrompt ? 1 << 19 : 0) | (host.gen ? 1 << 20 : 0) | (host.cancel ? 1 << 21 : 0) | (host.stop ? 1 << 22 : 0);
  dev.queue.writeBuffer(F.bus, TB.HOST * 4, Uint32Array.of(hw, (host.maxTokens ?? 256) & 0x1ff));
  copy(g, F.ctl.arena, F.ctl.meta.off_st * 4, F.bus, TB.QOLD * 4, 8);
  pack(g, F, X.G.k6, 30);
  await tick(g, X.k6, null, 0, 0, { inputNone: true, noRead: true, chunk });
  copy(g, X.k6.outWords, 0, F.bus, TB.K6 * 4, 4);
  pack(g, F, X.G.glueB, X.T.tGlueB.length);
  await tick(g, X.glue, null, 0, 0, { inputNone: true, noCommit: true, noRead: true, chunk });
  copy(g, X.glue.outWords, 0, F.bus, TB.GLUE * 4, 4);
  pack(g, F, X.G.ctlBegin, 38);
  await tick(g, F.ctl, null, 0, 0, { inputNone: true, noCommit: true, noRead: true, readState: false, chunk });
  copy(g, F.ctl.outWords, 0, F.bus, TB.BEGIN * 4, 12);
  pack(g, F, F.G.emb, 17);
  await tick(g, F.emb, null, 0, 0, { inputNone: true, noRead: true, chunk });
  pack(g, F, X.G.vr, 2);
  for (let l = 0; l < F.M.layers.length; l++) {
    const L = F.M.layers[l], src = l === 0 ? F.emb.outWords : F.M.layers[l - 1].outWords;
    await tick(g, L, null, 0, 0, { chunk, inputFrom: src, vrFrom: X.vr, noRead: true });
    copy(g, L.newState, F.errWord * 4, F.bus, (TB.ERR + l) * 4, 4);
  }
  copy(g, F.M.layers[F.M.layers.length - 1].outWords, 0, F.tail.arena, F.tail.meta.off_in * 4, 768 * 4);
  pack(g, F, F.G.err, 104);
  await tick(g, F.tail, null, 0, 0, { inputNone: true, noRead: true, chunk });
  copy(g, F.tail.outWords, 0, F.bus, TB.TAIL * 4, 4);
  pack(g, F, X.G.ctlEnd, 38);
  const rc = await tick(g, F.ctl, null, 0, 0, { inputNone: true, chunk });
  copy(g, F.ctl.outWords, 0, F.bus, TB.END * 4, 12);
  pack(g, F, X.G.glueE, X.T.tGlueE.length);
  await tick(g, X.glue, null, 0, 0, { inputNone: true, noRead: true, chunk });
  copy(g, X.glue.outWords, 0, F.bus, TB.GLUE * 4, 4);
  pack(g, F, X.G.merge, 40);
  await tick(g, X.merge, null, 0, 0, { inputNone: true, noRead: true, chunk });
  copy(g, X.merge.outWords, 0, F.bus, TB.MERGE * 4, 4);
  { const e = dev.createCommandEncoder(); e.copyBufferToBuffer(F.bus, TB.QOLD * 4, X.rb, 0, 36); dev.queue.submit([e.finish()]); }
  await X.rb.mapAsync(GPUMapMode.READ); const w = new Uint32Array(X.rb.getMappedRange().slice(0)); X.rb.unmap();
  const bit = (x, i) => (x >>> i) & 1, fld = (x, a, n) => (x >>> a) & ((1 << n) - 1);
  const k6 = w[TB.K6 - TB.QOLD], gl = w[TB.GLUE - TB.QOLD], mg = w[TB.MERGE - TB.QOLD], p = rc.out, Q = X.Q;
  const pb = i => (p[i >> 5] >>> (i & 31)) & 1, pbits = (a, n) => { let v = 0; for (let i = 0; i < n; i++) v |= pb(a + i) << i; return v >>> 0; };
  return {
    k6: { owner: bit(k6, 17), valid: bit(k6, 18), eos: bit(k6, 19), coreEnable: bit(k6, 20), badSchema: bit(k6, 21), finished: bit(k6, 22), truncated: bit(k6, 23), aborted: bit(k6, 24) },
    run: bit(gl, 0),
    merged: { native: fld(mg, 0, 17), valid: bit(mg, 17), eos: bit(mg, 18), owner: bit(mg, 20) },
    core: { emit: !!pb(19), eos: !!pb(20), cap: !!pb(21), reject: !!pb(22), finished: !!pb(23 + 24), action: pbits(23 + Q, 17) },
  };
}
