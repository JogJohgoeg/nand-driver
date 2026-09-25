// gatesim R6 W4：整模型一拍 = control_begin → embedding → 52 层 → tail → control_end（与 R61 Model.step 逐段对应），全部在 GPU 内串接。
// 宿主每拍只写一个字（external17 | valid<<17 | reset<<18 | end_prompt<<19），只读 control_end 的 74 位端口；生成的 token 由电路经控制 LATCH 自产反馈。
// 单元之间只做搬运：复制整字（copyBufferToBuffer）与按静态位表取位（PACK_WGSL：来源位号全部来自静态表，线值不作地址、不定移位量）。
// 总线（u32）：[0] 常 0 | [1] 宿主字 | [4..6] control_begin 端口 | [8] tail 字 0（argmax17、error）| [16..67] 52 层 error 字（每层新状态的末 2 位所在字）
const BUS_WORDS = 256, B_HOST = 1, B_BEGIN = 4, B_TAIL = 8, B_ERR = 16;
// R8：已加载的单元与 52 层 → 整模型（总线、静态位表、取位绑定组）。流式路径逐个加载后直接调用这里
export function assembleFull(g, { ctl, emb, tail, M, t0 = performance.now() }, log = () => { }, { mutate = null } = {}) {
  const device = g.device, U = GPUBufferUsage;
  const bus = device.createBuffer({ size: BUS_WORDS * 4, usage: U.STORAGE | U.COPY_DST | U.COPY_SRC });
  const B = (w, b) => w * 32 + b, ZERO = B(0, 0);
  // 静态位表（加载时一次定死）
  const tCtlBegin = [], tCtlEnd = [], tEmb = [], tErr = [];
  for (let i = 0; i < 20; i++) { tCtlBegin.push(B(B_HOST, i)); tCtlEnd.push(B(B_HOST, i)); }              // external17 valid reset end_prompt
  for (let i = 0; i < 17; i++) { tCtlBegin.push(ZERO); tCtlEnd.push(B(B_TAIL, i)); }                      // predicted17：begin 为 0，end 取 tail argmax
  tCtlBegin.push(ZERO); tCtlEnd.push(B(B_TAIL, 17));                                                     // error
  for (let i = 0; i < 17; i++) tEmb.push(B(B_BEGIN, i));                                                 // token = control_begin.source17（电路自产反馈）
  const nst = M.layers[0].meta.nstate, ew = Math.floor((nst - 2) / 32), eb = (nst - 2) % 32;
  for (let l = 0; l < M.layers.length; l++) for (let t = 0; t < 2; t++) tErr.push(B(B_ERR + l, eb + t));  // tail 的 error_tensor：层 l 的 state[-2], state[-1]
  const tabs = { tCtlBegin, tCtlEnd, tEmb, tErr };
  if (mutate) mutate(tabs, { B, ZERO, B_HOST, B_BEGIN, B_TAIL, B_ERR });                               // 负控：改静态位表
  // 底线断言：embedding 的 token 只能来自 control_begin 的输出位（反馈由电路自产，宿主字不得入内）
  const selfFed = tabs.tEmb.every((x, i) => x === B(B_BEGIN, i));
  const pL = g.bglCache.get('ud,r,r,w'), pipe = ctl.packPipe;
  const mkU = n => { const b = device.createBuffer({ size: 256, usage: U.UNIFORM | U.COPY_DST }); device.queue.writeBuffer(b, 0, Uint32Array.from([n, 0, 0, 0])); return b; };
  const mkT = a => { const b = device.createBuffer({ size: Math.max(16, a.length * 4 + 128), usage: U.STORAGE | U.COPY_DST }); device.queue.writeBuffer(b, 0, Uint32Array.from(a)); return b; };
  const bg = (tab, dst, off, words) => device.createBindGroup({ layout: pL, entries: [{ binding: 0, resource: { buffer: mkU(tab.length), size: 16 } },
    { binding: 1, resource: { buffer: mkT(tab) } }, { binding: 2, resource: { buffer: bus } }, { binding: 3, resource: { buffer: dst, offset: off, size: words * 4 } }] });
  const G = {
    ctlBegin: bg(tabs.tCtlBegin, ctl.arena, ctl.meta.off_in * 4, 2), ctlEnd: bg(tabs.tCtlEnd, ctl.arena, ctl.meta.off_in * 4, 2),
    emb: bg(tabs.tEmb, emb.arena, emb.meta.off_in * 4, 1), err: bg(tabs.tErr, tail.arena, (tail.meta.off_in + 768) * 4, 4),
  };
  const rbPorts = device.createBuffer({ size: 16, usage: U.MAP_READ | U.COPY_DST });
  log(`full model loaded in ${((performance.now() - t0) / 1e3).toFixed(1)} s; selfFed=${selfFed}`);
  return { ctl, emb, tail, M, bus, G, pipe, rbPorts, tabs, selfFed, errWord: ew, loadMs: performance.now() - t0 };
}
