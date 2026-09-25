// 门电路版 BitCPM4-1B：浏览器现场生成整模型 NAND/LATCH 网表并在 WebGPU 上逐位执行（对外 ES 模块接口）。
//
//   import { createGateBrain } from './gate-brain.mjs';
//   const brain = createGateBrain({ weightsBase, C: 128, workers: 2, cache: true, onEvent });
//   await brain.ready;
//   const r = await brain.ask(messages, tools, { onToken, signal, maxTokens });
//   brain.stop(); await brain.switchToLong(); brain.capabilities; brain.dispose();
//
// 口径：单元库（NAND 模板网表）是预综合的固定资产，随权重包下载并逐个钉 SHA；「按权重选单元与连线」由浏览器现场生成。
// tokenizer 与对话模板是宿主 I/O 边界（只做文字 ↔ 编号），不参与 embedding / logits / argmax。每个 token 由整个模型的门电路逐位计算，
// 生成的词经电路自己的 LATCH 反馈；工具调用由门内 K6 摘要机生成（工具不执行）。详见 README.md。
import { initGPU } from './exec/gpu.mjs';
import { assembleTool, toolBeat } from './exec/tool_exec.mjs';
import { streamGenLoad, loadFromCache, cacheWriter, weightsView } from './core/stream_gen.mjs';
import { packageReader } from './core/package.mjs';
import { sourceKey, OPFSWorkerCache, DiscardSink } from './core/pack_cache.mjs';
import { Tokenizer, renderChat, adaptTools } from './tok/tokenizer.mjs';

export const DEFAULT_WEIGHTS_BASE = 'https://nand.aihashrate.stream/gate-weights/';
const here = p => new URL(p, import.meta.url).href;
const CODE_FILES = ['gen_ir/bits.mjs', 'gen_ir/engine.mjs', 'gen_ir/layer.mjs', 'gen_ir/model.mjs', 'gen_ir/gen_core.mjs', 'exec/layer_pack.mjs', 'exec/gen.mjs', 'exec/mega.mjs', 'exec/layer_exec.mjs', 'core/stream_gen.mjs', 'exec/tool_exec.mjs', 'cells/scale_exact.json', 'cells/ternary32.json', 'cells/dot32_s8.json', 'cells/mul_bb.json', 'cells/add.json', 'cells/mul.json', 'cells/div.json', 'cells/gt.json', 'cells/umax.json', 'cells/mux32.json', 'cells/mux16.json', 'cells/i2f.json', 'cells/f2i.json', 'cells/iadd32.json', 'cells/bf16.json', 'cells/clip.json', 'cells/argmax_bf16.json', 'cells/quant_s8.json', 'cells/head_scale.json', 'cells/sqrt.json', 'cells/rsqrt.json', 'cells/exp.json', 'cells/silu_b.json', 'cells/ternary32pm.json', 'cells/tern4.json', 'cells/sum8.json', 'cells/mul8.json', 'cells/sum32.json', 'cells/facc.json', 'cells/facce.json', 'cells/fix2f.json', 'cells/add_nn.json', 'cells/bmax.json', 'cells/addsel.json', 'cells/facce4.json'];
// 附加单元：不在权重包里、随代码发布的单元（逐位等价替换，见 cells/*.json 的 semantics / replaces）。加载后作为一个虚拟权重块挂进内存中的清单。
const EXTRA_CELLS = ['scale_exact', 'ternary32', 'dot32_s8', 'mul_bb', 'add', 'mul', 'div', 'gt', 'umax', 'mux32', 'mux16', 'i2f', 'f2i', 'iadd32', 'bf16', 'clip', 'argmax_bf16', 'quant_s8', 'head_scale', 'sqrt', 'rsqrt', 'exp', 'silu_b', 'ternary32pm', 'tern4', 'sum8', 'mul8', 'sum32', 'facc', 'facce', 'fix2f', 'add_nn', 'bmax', 'addsel', 'facce4'];   // 与权重包同名者为等价再设计的替换版（按名覆盖）
// m149（AMD Radeon 8060S，Chromium）实测：C128 浏览器全部进程 5.4–5.9 GB、显存 4.3 GB；C512 7.3–7.5 GB、显存 6.3 GB
const NEED = { bindingMiB: 512, bufferMiB: 512, storagePerStage: 8, workgroupStorage: 16384, cacheGB: { 128: 2.5, 512: 4.5 } };
export const MEMORY_ESTIMATE = { 128: { ramGB: 6, vramGB: 4.3, cacheGB: 2.1 }, 512: { ramGB: 7.6, vramGB: 6.4, cacheGB: 3.8 } };
const CTL = { 128: 'model_control_cap256_C128', 512: 'model_control_cap256_C512' };
// 缓存目录（OPFS）：每个「权重清单 + 代码版本 + 容量」一份。同一版本下 C128 与 C512 两份并存；版本变了才删旧的。
const safe = k => k.replace(/[^A-Za-z0-9._-]/g, '_');
async function pruneStale(verKey) {
  try { const root = await navigator.storage.getDirectory(), keep = 'gatesim-' + safe(verKey);
    for await (const [n] of root.entries()) if (n.startsWith('gatesim-') && !n.startsWith(keep)) await root.removeEntry(n, { recursive: true }); } catch { }
}
async function dropCurrent(store) {           // 只删当前这一份（缓存损坏 / 写入失败），并重建空目录
  try { const root = await navigator.storage.getDirectory(), n = store.dir.name; await store.idle?.(); await root.removeEntry(n, { recursive: true }); store.dir = await root.getDirectoryHandle(n, { create: true }); } catch { }
}
const hex = async b => [...new Uint8Array(await crypto.subtle.digest('SHA-256', b))].map(x => x.toString(16).padStart(2, '0')).join('');

export class GateError extends Error { constructor(code, message, detail) { super(message); this.code = code; this.detail = detail; } }

// 设备预检（人话）。返回 { rows, hard, cacheOK, longMode: { allowed, reason } }
export async function precheck({ C = 128 } = {}) {
  const rows = [], add = (ok, what, detail) => rows.push({ ok, what, detail });
  if (typeof navigator === 'undefined' || !('gpu' in navigator)) {
    add(false, 'WebGPU', '此浏览器没有开启 WebGPU。请用 Chrome / Edge 113 及以上版本（Linux 需在 chrome://flags 打开 WebGPU），Safari 需 18 以上并开启 WebGPU。');
    return { rows, hard: true, code: 'no_webgpu', longMode: { allowed: false, reason: '没有 WebGPU' } };
  }
  const ad = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
  if (!ad) { add(false, 'WebGPU 适配器', '浏览器支持 WebGPU，但没有拿到可用的显卡适配器（驱动过旧或被浏览器列入黑名单）。请更新显卡驱动，或在 chrome://gpu 查看原因。'); return { rows, hard: true, code: 'no_adapter', longMode: { allowed: false, reason: '没有显卡适配器' } }; }
  const lim = ad.limits;
  add(lim.maxStorageBufferBindingSize >= NEED.bindingMiB * 2 ** 20, '单个存储缓冲绑定上限', `${(lim.maxStorageBufferBindingSize / 2 ** 20).toFixed(0)} MiB（需要 ≥ ${NEED.bindingMiB} MiB）`);
  add(lim.maxBufferSize >= NEED.bufferMiB * 2 ** 20, '单个缓冲大小上限', `${(lim.maxBufferSize / 2 ** 20).toFixed(0)} MiB（需要 ≥ ${NEED.bufferMiB} MiB）`);
  add(lim.maxStorageBuffersPerShaderStage >= NEED.storagePerStage, '每阶段存储缓冲数', `${lim.maxStorageBuffersPerShaderStage}（需要 ≥ ${NEED.storagePerStage}）`);
  add(lim.maxComputeWorkgroupStorageSize >= NEED.workgroupStorage, '工作组共享内存', `${lim.maxComputeWorkgroupStorageSize} 字节（需要 ≥ ${NEED.workgroupStorage}）`);
  const hard = rows.some(r => !r.ok);
  const dm = navigator.deviceMemory, E = MEMORY_ESTIMATE[C];
  add(dm === undefined || dm >= 8 ? true : 'warn', '内存', dm === undefined ? `浏览器不报告内存大小。本模式峰值：浏览器进程约 ${E.ramGB} GB，另需显存（或核显共享内存）约 ${E.vramGB} GB。`
    : `浏览器报告 ≥ ${dm} GB（浏览器最多报 8）${dm < 8 ? '——这台设备可能不够，打开后可能被系统或浏览器终止' : ''}。`);
  // 长回答模式（C512）：浏览器报 8 GB（上限值）才可开；不报时须调用方确认（confirmLong）
  const longMode = dm === undefined ? { allowed: 'confirm', reason: '浏览器不报告内存大小；长回答模式需要约 7.6 GB 内存与 6.4 GB 显存，请确认设备足够后再开' }
    : dm >= 8 ? { allowed: true, reason: '浏览器报告内存 ≥ 8 GB' } : { allowed: false, reason: `浏览器报告内存 ${dm} GB，长回答模式需要约 7.6 GB` };
  let est = null; try { est = await navigator.storage.estimate(); } catch { }
  const free = est ? (est.quota - est.usage) / 2 ** 30 : null, cg = NEED.cacheGB[C];
  add(free === null || free >= cg ? true : 'warn', '本机缓存空间', free === null ? '无法查询；不影响运行，只是不能缓存' : `可用约 ${free.toFixed(1)} GB（缓存需要约 ${E.cacheGB} GB${free < cg ? '，不足，将不缓存，每次打开都要重新生成' : ''}）`);
  return { rows, hard, code: hard ? 'limits' : null, cacheOK: free !== null && free >= cg, longMode };
}

export function createGateBrain({ weightsBase = DEFAULT_WEIGHTS_BASE, C = 128, workers = 2, cache = true, confirmLong = false, onEvent = () => { } } = {}) {
  if (!weightsBase.endsWith('/')) weightsBase += '/';
  const emit = e => { try { onEvent(e); } catch { } };
  const fail = (code, message, detail) => { const e = new GateError(code, message, detail); emit({ type: 'error', code, message, detail }); return e; };
  let S = null, busy = false, stopFlag = false, disposed = false;
  const brain = { capabilities: null };

  async function load(Cn) {
    const t0 = performance.now();
    const PC = await precheck({ C: Cn }); emit({ type: 'precheck', C: Cn, ...PC });
    if (PC.hard) throw fail(PC.code || 'limits', '这台设备不满足运行条件（见预检结果），没有下载任何权重。');
    if (Cn === 512 && PC.longMode.allowed !== true && !(PC.longMode.allowed === 'confirm' && confirmLong)) throw fail('long_mode_unavailable', '长回答模式不可用：' + PC.longMode.reason);
    let g; try { g = await initGPU(); } catch (e) { throw fail('no_adapter', '无法创建 WebGPU 设备：' + (e.message || e)); }
    g.device.lost?.then(info => { if (!disposed && info?.reason !== 'destroyed') emit({ type: 'error', code: 'gpu_lost', message: '显卡设备丢失（驱动重置或内存不足），请刷新页面重试。', detail: info?.message }); });
    const execMan = await (await fetch(here('exec/templates.json'))).json();
    let manBytes;
    try { const r = await fetch(weightsBase + 'manifest.json'); if (!r.ok) throw new Error('HTTP ' + r.status); manBytes = new Uint8Array(await r.arrayBuffer()); }
    catch (e) { throw fail('weights_fetch', `取不到权重清单（${weightsBase}manifest.json）：${e.message || e}。若权重与页面不同源，托管端需返回 Access-Control-Allow-Origin。`); }
    const man = JSON.parse(new TextDecoder().decode(manBytes)), controller = CTL[Cn];
    if (!man.cells.includes(controller) || !man.cells.includes('k6_glue3')) throw fail('weights_mismatch', '权重包版本与本代码不符（缺少所需模板）。');
    const extra = await Promise.all(EXTRA_CELLS.map(async c => {
      const meta = await (await fetch(here(`cells/${c}.json`))).json(), bin = new Uint8Array(await (await fetch(here(`cells/${c}.bin`))).arrayBuffer());
      if (bin.length !== meta.n_nand * 7 || (await hex(bin)) !== meta.sha256) throw fail('weights_mismatch', `附加单元 ${c} 的网表校验失败。`);
      return { c, meta, bin };
    }));
    const codeTexts = await Promise.all(CODE_FILES.map(async f => await (await fetch(here(f))).text()));
    const verKey = await sourceKey(manBytes, codeTexts), key = verKey + '-' + controller + '-tool';
    const useCache = cache && PC.cacheOK;
    let store = null, F0 = null, TU = null, tokBytes = null, warm = false;
    if (useCache) {
      try {
        await pruneStale(verKey); store = await new OPFSWorkerCache().open(key, here('core/cache_worker.mjs'));
        emit({ type: 'progress', stage: 'cache', done: 0, total: 1 });
        const W = await loadFromCache(g, store, execMan, { verify: true, C: Cn, onStage: s => emit({ type: 'progress', stage: 'upload', tag: s.tag }) });
        if (W.F && W.toolUnits) {
          const tb = await store.get('_tokenizer');
          if (tb && (await hex(tb.bytes)) === man.tensors.find(x => x.name === 'tokenizer.json').sha256) { F0 = W.F; TU = W.toolUnits; tokBytes = tb.bytes; warm = true; }
        }
        if (!F0 && W.fail) { emit({ type: 'warning', code: 'cache_invalid', message: `本机缓存不可用（${W.fail}），已作废并重新生成。` }); await dropCurrent(store); }
      } catch (e) { emit({ type: 'warning', code: 'cache_failed', message: `读取本机缓存出错（${e.name || e}），改为重新生成。` }); store = null; }
    }
    if (!F0) {
      // 预压缩（可选）：manifest.gz.json 列出 chunk-*.bin.gz；浏览器原生 gzip 解压后仍按 manifest.json 的原始 SHA-256 校验，
      // 所以与直接下载 .bin 逐字节相同。没有旁挂清单或浏览器不支持 DecompressionStream 时退回 .bin。4 路并发下载。
      let gz = null;
      if (typeof DecompressionStream !== 'undefined') try { const r = await fetch(weightsBase + 'manifest.gz.json'); if (r.ok) { const j = await r.json(); if (j.format === 'gatesim-weights-gz-v1' && j.chunks.length === man.chunks.length) gz = j; } } catch { }
      const total = gz ? gz.total_bytes : man.total_bytes, chunks = new Array(man.chunks.length); let got = 0, done = 0, next = 0;
      const one = async i => {
        const c = man.chunks[i], z = gz && gz.chunks[i]; let b;
        try {
          const r = await fetch(weightsBase + (z ? z.file : c.file)); if (!r.ok) throw new Error('HTTP ' + r.status);
          b = new Uint8Array(await r.arrayBuffer());   // 若托管端已按 Content-Encoding 解过压，这里拿到的就是原始字节；只在见到 gzip 魔数时自己解
          if (z && b[0] === 0x1f && b[1] === 0x8b) b = new Uint8Array(await new Response(new Blob([b]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer());
        } catch (e) { throw fail('weights_fetch', `下载权重块 ${z ? z.file : c.file} 失败：${e.message || e}`); }
        if (b.length !== c.bytes || (await hex(b)) !== c.sha256) throw fail('chunk_sha', `权重块 ${c.file} 的 SHA-256 与清单不符，已拒绝生成（文件损坏或被替换）。`);
        chunks[i] = b; got += z ? z.bytes : b.length; done++; emit({ type: 'progress', stage: 'download', done: got, total, chunks: done, of: man.chunks.length });
      };
      await Promise.all(Array.from({ length: 4 }, async () => { while (next < man.chunks.length) await one(next++); }));
      { const enc = new TextEncoder(), base = man.chunks.length * man.chunk_max_bytes, parts = []; let off = 0;
        for (const { c, meta, bin } of extra) {
          const j = enc.encode(JSON.stringify(meta)); man.tensors.push({ name: `cell.${c}.json`, bytes: j.length, offset: base + off }); parts.push(j); off += j.length;
          man.tensors.push({ name: `cell.${c}.bin`, bytes: bin.length, offset: base + off }); parts.push(bin); off += bin.length; if (!man.cells.includes(c)) man.cells.push(c);
        }
        const blob = new Uint8Array(off); let p = 0; for (const x of parts) { blob.set(x, p); p += x.length; }
        man.chunks.push({ file: null, bytes: off }); chunks.push(blob); }
      const Wv = weightsView(man, packageReader(man, chunks)), cellBins = new Map(man.cells.map(c => [c, Wv.bytes(`cell.${c}.bin`)]));
      tokBytes = Wv.bytes('tokenizer.json').slice();
      const discard = new DiscardSink(here('core/cache_worker.mjs')); const cw0 = store ? cacheWriter(store, cellBins) : null; let broken = null;
      const sink = cw0 ? async (tag, P) => { if (broken) return discard.put(tag, P); try { await cw0.sink(tag, P); } catch (e) { broken = String(e.message || e); await dropCurrent(store); } } : (tag, P) => discard.put(tag, P);
      let nl = 0;
      const R = await streamGenLoad(g, Wv, man, execMan, { nWorkers: workers, controller, tool: true, C: Cn, workerUrl: here('gen_ir/gen_worker.mjs'), packSink: sink, releaseChunks: c => { chunks[c] = null; },
        log: s => { if (/^L\d+ /.test(s)) emit({ type: 'progress', stage: 'generate', done: ++nl, total: 52 }); else if (/^unit /.test(s)) emit({ type: 'progress', stage: 'generate', unit: s.split(' ')[1] }); } });
      F0 = R.F; TU = R.toolUnits;
      if (cw0) {
        if (!broken) { try { await store.put('_tokenizer', { bytes: tokBytes.slice() }); await cw0.finish(); } catch (e) { broken = String(e.message || e); } }
        if (broken) emit({ type: 'warning', code: 'cache_write_failed', message: `本机缓存写入失败（${broken}），已停止缓存；本次不受影响，下次打开需要重新生成。请在浏览器设置里为本站留出约 ${MEMORY_ESTIMATE[Cn].cacheGB} GB 存储空间。` });
      }
    }
    const tok = new Tokenizer(JSON.parse(new TextDecoder().decode(tokBytes)));
    const F = assembleTool(g, F0, TU);
    S = { g, F, tok, C: Cn, PC };
    brain.capabilities = { C: Cn, maxPromptTokens: Cn - 1, maxNewTokens: 256, tools: 'R64 K6 支持子域：只捕获首个工具、≤ 6 个参数、名字 / 参数名 / 值各 ≤ 8 个 token；非字符串参数输出 0；工具不执行',
      longMode: PC.longMode, memoryEstimate: MEMORY_ESTIMATE, warm };
    const prepMs = performance.now() - t0;
    emit({ type: 'ready', C: Cn, warm, prepMs });
    return prepMs;
  }

  // 最小 XML 解析：只覆盖 K6 能生成的 <function name="…"><param name="…">值</param>…</function>；字符串参数原文，其余按 JSON 解析（K6 对非字符串输出 0）
  function parseToolCall(text, tools) {
    const m = /<function name="([^"]*)">([\s\S]*?)<\/function>/.exec(text); if (!m) return null;
    const def = (tools || []).map(t => t.function || t).find(t => t.name === m[1]), props = def?.parameters?.properties || {}, args = {};
    for (const p of m[2].matchAll(/<param name="([^"]*)">([\s\S]*?)<\/param>/g)) { const ty = props[p[1]]?.type; if (ty === 'string' || ty === undefined) args[p[1]] = p[2]; else { try { args[p[1]] = JSON.parse(p[2]); } catch { args[p[1]] = p[2]; } } }
    return { name: m[1], arguments: args, xml: m[0] };
  }

  brain.ask = async (messages, tools = null, { onToken = () => { }, signal = null, maxTokens = 256 } = {}) => {
    if (!S) throw fail('not_ready', '模型还没有准备好，请先等待 ready。');
    if (busy) throw fail('busy', '上一个问题还在生成中，请等它结束或先调用 stop()。');
    busy = true; stopFlag = false;
    try {
      const { g, F, tok, C: Cn } = S;
      const msgs = adaptTools(messages, tools && tools.length ? tools : null), prompt = renderChat(msgs), ids = tok.encode(prompt), P = ids.length;
      if (P >= Cn) throw fail('prompt_too_long', `提示有 ${P} 个 token，超过本电路容量（C${Cn}，最多 ${Cn - 1} 个）。请缩短对话${Cn === 128 ? '，或改用长回答模式（C512）' : ''}。`, { promptTokens: P, C: Cn });
      const mt = Math.max(1, Math.min(256, maxTokens | 0));
      const out = [], t0 = performance.now(); let first = null, stop = null, owner = false, lastBeat = t0, beatMs = [], coreFinishedPrev = false;
      for (let b = 0; b < P + 260; b++) {
        if (stopFlag || signal?.aborted) { stop = 'stopped'; break; }
        const host = b === 0 ? { external: 0, promptValid: 0, gen: 0, reset: 1, endPrompt: 0, stop: 1, maxTokens: mt }
          : b <= P ? { external: ids[b - 1], promptValid: 1, gen: 0, reset: 0, endPrompt: b === P, stop: 0, maxTokens: mt } : { external: 0, promptValid: 0, gen: 1, reset: 0, endPrompt: false, stop: 0, maxTokens: mt };
        const R = await toolBeat(g, F, host); const now = performance.now(); if (b > P + 1) beatMs.push(now - lastBeat); lastBeat = now;
        if (b <= P && b > 0 && (b % 8 === 0 || b === P)) emit({ type: 'progress', stage: 'prompt', done: b, total: P });
        if (R.merged.valid) {
          first ??= now - t0; out.push(R.merged.native); if (R.merged.owner) owner = true;
          const text = tok.decode(out); onToken({ id: R.merged.native, text, tool: !!R.merged.owner }); emit({ type: 'token', id: R.merged.native, text, tool: !!R.merged.owner });
          if (R.merged.eos) { stop = 'eos'; break; }
          if (out.length >= mt) { stop = 'max_tokens'; break; }
        }
        if (b > P) {
          if (R.k6.owner && (R.k6.truncated || R.k6.aborted)) { stop = R.k6.truncated ? 'tool_truncated' : 'tool_aborted'; break; }
          if (coreFinishedPrev && !R.merged.valid) { stop = 'max_tokens'; break; }
          if (R.core.reject && !R.k6.owner && !R.merged.valid) { stop = 'capacity'; break; }
        }
        coreFinishedPrev = R.core.finished;
      }
      stop ||= 'max_tokens';
      const text = tok.decode(out), eosIds = [2, 73440], clean = tok.decode(out.filter(x => !eosIds.includes(x)));
      if (stop === 'capacity') emit({ type: 'capacity', C: Cn, canSwitchLong: Cn === 128 && S.PC.longMode.allowed !== false, message: `回答写满了本电路的容量（C${Cn}：提示 + 回答 ≤ ${Cn} 个 token）。${Cn === 128 ? (S.PC.longMode.allowed !== false ? '可以改用长回答模式（C512）重新回答。' : '这台设备不满足长回答模式的内存要求。') : ''}` });
      const bm = beatMs.slice().sort((a, b) => a - b);
      return { text: clean, rawText: text, ids: out, promptIds: ids, stop, toolCall: owner ? parseToolCall(text, tools) : null, firstTokenMs: first, msPerToken: bm.length ? bm[bm.length >> 1] : null };
    } finally { busy = false; }
  };
  brain.stop = () => { stopFlag = true; };
  brain.switchToLong = async () => {
    if (busy) throw fail('busy', '正在生成，请先 stop()。');
    if (S && S.C === 512) return;
    const PC = await precheck({ C: 512 });
    if (PC.longMode.allowed === false || (PC.longMode.allowed === 'confirm' && !confirmLong)) throw fail('long_mode_unavailable', '长回答模式不可用：' + PC.longMode.reason);
    if (S) { S.g.device.destroy(); S = null; }
    brain.ready = load(512); return brain.ready;
  };
  brain.dispose = () => { disposed = true; if (S) { S.g.device.destroy(); S = null; } };
  brain.ready = load(C === 512 ? 512 : 128);
  brain.ready.catch(() => { });
  return brain;
}
