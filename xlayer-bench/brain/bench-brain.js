// netlist-brain.js — the impossible LLM as the Pi workbench's "model".
//
// Replaces MiniCPM5-2B in the upstream agent worker. Every generated token is one
// evaluation of the impossible LLM NAND netlist (../../impossibleLLM/netlist.json +
// netlist.bin), gate by gate over a wire array, on the CPU. No weights, no WebGPU.
//
// What the netlist sees: the last 6 MiniCPM5 tokens of the text being continued
// (102 input bits, 17 per token, oldest first) and, from v2 on, 4 random bits that
// pick among the teacher's most frequent answers for that context (0 = greedy). It
// answers with a 13-bit code into top8192.json (a MiniCPM5 token id). Stateless.
// Because a 6-token window over the chat template would always see the same template
// tail, the reply continues the user's last message.
//
// exports createBrain({ base, templateUrl, makeTokenizer, fetchImpl }) -> { tokenizer, model, info }
//   makeTokenizer(tokenizerJSON, tokenizerConfig) builds a transformers.js tokenizer.
//   model.generate(opts) mimics the subset of transformers.js generate() the worker uses.

export const MAX_REPLY_TOKENS = 48;
export const THINK_END_ID = 9;        // "</think>"
export const IM_END_ID = 130073;      // "<|im_end|>"
const EOS_IDS = new Set([1, IM_END_ID]);

// net: metadata (nNand, nLatch, nIn, nOut) plus either nl_hex, or `records` = the raw
// TapeOut record bytes (7 per NAND: 0x00, a, b as 3-byte big-endian wire ids).
export function decodeNetlist(net, records) {
  // 记录是**变长**的：NAND 是 0x00 + a + b（3 字节大端）= 7 字节，
  // LATCH 是 0x01 + D 端一个线号 = 4 字节。按定长 7 解析会把元件全部错位。
  for (const key of ['nIn', 'nOut', 'nNand', 'nLatch'])
    if (!Number.isSafeInteger(net[key]) || net[key] < 0) throw new Error(`${key} 必须是非负整数`);
  const n = net.nNand + net.nLatch, base = 2 + net.nIn;
  if (!n || base + n > 0x1000000 || !net.nOut || net.nOut > n)
    throw new Error('网表尺寸无效：输出必须来自末尾元件，线号不得超过 24 位');
  const r = records
    ? (records instanceof Uint8Array ? records : new Uint8Array(records))
    : (() => {
        if (typeof net.nl_hex !== 'string') throw new Error('缺少 records 文件或 nl_hex');
        const hex = net.nl_hex.startsWith('0x') ? net.nl_hex.slice(2) : net.nl_hex;
        if (!/^(?:[0-9a-fA-F]{2})+$/.test(hex)) throw new Error('nl_hex 必须是完整的十六进制字节');
        const b = new Uint8Array(hex.length / 2);
        for (let i = 0; i < b.length; i++) b[i] = parseInt(hex.substr(i * 2, 2), 16);
        return b;
      })();
  if (r.length !== net.nNand * 7 + net.nLatch * 4) throw new Error('records 长度不符：NAND 7 字节，LATCH 4 字节（文件可能截断）');
  const OP = new Uint8Array(n), A = new Int32Array(n), B = new Int32Array(n);
  {
    let i = 0;
    for (let o = 0; o < r.length; ) {
      const k = r[o];
      if (k !== 0 && k !== 1) throw new Error(`第 ${o} 字节操作码 ${k} 无效（只能是 0/1）`);
      if (i >= n || o + (k === 0 ? 7 : 4) > r.length) throw new Error('records 截断或元件数不符');
      A[i] = (r[o + 1] << 16) | (r[o + 2] << 8) | r[o + 3];
      if (k === 0) { B[i] = (r[o + 4] << 16) | (r[o + 5] << 8) | r[o + 6]; o += 7; }
      else o += 4;
      OP[i++] = k;
    }
    if (i !== n) throw new Error('元件数与元数据不符');
  }
  const nLatch = OP.reduce((t, v) => t + v, 0), nNand = n - nLatch;
  if (nNand !== net.nNand) throw new Error(`NAND count ${nNand} != nNand ${net.nNand}`);
  if (net.nLatch != null && nLatch !== net.nLatch) throw new Error(`LATCH count ${nLatch} != nLatch ${net.nLatch}`);
  const nOut = net.nOut, nIn = net.nIn;
  for (let i = 0; i < n; i++) {
    // LATCH 的 D 端**允许**指向后面的元件——递归就靠这个；组合门不许。
    if (OP[i] === 0 && (A[i] >= base + i || B[i] >= base + i))
      throw new Error(`NAND #${i} 引用了未来线号`);
    if (OP[i] === 1 && A[i] >= base + n) throw new Error(`LATCH #${i} 的 D 线号越界`);
  }
  const w = new Uint8Array(base + n);

  function run(bytes, state) {
    if (bytes.length !== Math.ceil(nIn / 8) || state.length !== nLatch) throw new Error('输入或状态长度不符');
    w[0] = 0; w[1] = 1;
    for (let i = 0; i < nIn; i++) w[2 + i] = (bytes[i >> 3] >> (i & 7)) & 1;
    let j = 0;
    for (let i = 0; i < n; i++)
      w[base + i] = OP[i] === 0 ? 1 - (w[A[i]] & w[B[i]]) : state[j++];   // LATCH 吐上一拍
    let code = 0;
    for (let k = 0; k < Math.min(nOut, 31); k++) code += w[base + n - nOut + k] * 2 ** k;
    return code;
  }

  // 无状态求值（老路径，nLatch = 0 时行为与改动前完全一致）
  const EMPTY = new Uint8Array(0);
  const evaluate = bytes => run(bytes, EMPTY);

  // 跑一拍：返回输出码与新状态。必须先整轮求值完再采样 D 端，
  // 因为 LATCH 的 D 端可以指向后面的元件。
  function step(bytes, state) {
    const code = run(bytes, state);
    const ns = new Uint8Array(nLatch);
    let m = 0;
    for (let i = 0; i < n; i++) if (OP[i] === 1) ns[m++] = w[A[i]];
    return { code, state: ns, out: w.slice(base + n - nOut) };
  }

  return { evaluate, step, gates: n, nIn, nOut, nLatch, newState: () => new Uint8Array(nLatch) };
}

// Observe, never synthesize, a real evaluator transition. Bound visualization
// payloads for third-party brains; changedBits still counts ALL state bits.
export function measuredStep(nl, bytes, state) {
  const start = performance.now();
  const result = nl.step(bytes, state);
  const ms = performance.now() - start;
  let changedBits = 0;
  for (let i = 0; i < state.length; i++) changedBits += state[i] !== result.state[i];
  return {...result, sample:{gates:nl.gates,nNand:nl.gates-nl.nLatch,nLatch:nl.nLatch,ms,changedBits,
    before:[...state.subarray(0,1024)].join(''),after:[...result.state.subarray(0,1024)].join(''),
    input:[...bytes],output:nl.nOut<=31?result.code:null,outputBits:nl.nOut}};
}

// nlz1 (circuits/_scratch/hashport/nlz.py): per gate two LEB128 varints,
// ((cur - max(a,b)) << 1 | (a > b)) and max(a,b) - min(a,b); cur = 2 + nIn + i.
// Rebuilds the exact 7-byte records.
export function nlz1Records(v, nIn) {
  const out = [];
  let rec = new Uint8Array(7 << 19), o = 0, cur = 2 + nIn, p = 0;
  const next = () => { let x = 0, s = 0, b; do { b = v[p++]; x += (b & 127) * 2 ** s; s += 7; } while (b & 128); return x; };
  while (p < v.length) {
    const h = next(), hi = cur - Math.floor(h / 2), lo = hi - next();
    const [a, b] = h & 1 ? [hi, lo] : [lo, hi];
    if (o === rec.length) { out.push(rec); rec = new Uint8Array(rec.length); o = 0; }
    rec[o] = 0; rec[o + 1] = a >> 16; rec[o + 2] = a >> 8; rec[o + 3] = a;
    rec[o + 4] = b >> 16; rec[o + 5] = b >> 8; rec[o + 6] = b;
    o += 7; cur++;
  }
  const all = new Uint8Array(out.length * rec.length + o);
  out.forEach((c, i) => all.set(c, i * rec.length));
  all.set(rec.subarray(0, o), out.length * rec.length);
  return all;
}

// 102 context bits (6 x 17-bit ids, oldest first), then (v2) 4 random bits at 102..105.
// 递归网表用：只打包当拍一个 token（width 位）加 rand 位随机。
export function pack1(id, r, width, nIn) {
  const bytes = new Uint8Array((nIn + 7) >> 3);
  for (let k = 0; k < width; k++) if ((id >> k) & 1) bytes[k >> 3] |= 1 << (k & 7);
  for (let j = 0; j < nIn - width; j++) if ((r >> j) & 1) { const b = width + j; bytes[b >> 3] |= 1 << (b & 7); }
  return bytes;
}

export function pack(ids, r = 0, nIn = 102) {
  const bytes = new Uint8Array((nIn + 7) >> 3);
  for (let s = 0; s < 6; s++) {
    const id = Number(ids[s]) & 0x1ffff;
    for (let j = 0; j < 17; j++) {
      if ((id >> j) & 1) { const i = s * 17 + j; bytes[i >> 3] |= 1 << (i & 7); }
    }
  }
  for (let j = 0; j < nIn - 102; j++) {
    if ((r >> j) & 1) { const i = 102 + j; bytes[i >> 3] |= 1 << (i & 7); }
  }
  return bytes;
}

// Random bits for the sampling inputs: crypto-grade, 0 when greedy.
export function randomBits(n) {
  if (n <= 0) return 0;
  const a = new Uint8Array(1);
  globalThis.crypto.getRandomValues(a);
  return a[0] & ((1 << n) - 1);
}

const textOf = c => typeof c === 'string' ? c
  : (c ?? []).filter(p => p.type === 'text').map(p => p.text).join('\n');

export async function createBrain({ base, templateUrl, makeTokenizer, fetchImpl = fetch, source, onProgress, onTick }) {
  // The page and the agent worker share this selection, not the virtual filesystem.
  const { loadSource, readSelection } = await import('./brain-source.js');
  const loaded = await loadSource(source ?? await readSelection() ?? { url: new URL('netlist.json', base).href }, fetchImpl, onProgress);
  // Files named *.gz / *.nlz are gzip (the on-chain copy stores them compressed).
  const get = async (url, kind) => {
    const r = await fetchImpl(url);
    if (!r.ok) throw new Error(`${url} HTTP ${r.status}`);
    if (/\.(gz|nlz)$/.test(new URL(url).pathname)) {
      const buf = await new Response(r.body.pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
      return kind === 'bin' ? buf : kind === 'text' ? new TextDecoder().decode(buf) : JSON.parse(new TextDecoder().decode(buf));
    }
    return kind === 'text' ? r.text() : kind === 'bin' ? r.arrayBuffer() : r.json();
  };
  const u = f => new URL(f, base).href;
  const { net, records, tj, tc, top } = loaded;
  if (net.outputMode === 'bits') throw new Error('这是逐拍电路，不是聊天模型；请使用「换大脑」里的逐拍输入。');
  const template = net.chatTemplate ? await loaded.get(net.chatTemplate, 'text') : await get(templateUrl, 'text');
  const tokenizer = makeTokenizer(tj, { ...tc, chat_template: template });
  const nl = loaded.nl;
  // outputMode 'escape18'：最高位=1 表示低 17 位是**原始 token id**，=0 表示低 13 位
  // 仍是 top8192 索引。工具调用的 <function(18) ">(1822) <param(20) </param>(21)
  // </function>(19) 都不在 top8192 里，13 位码根本表达不了这套语法——所以能不能
  // 写出工具调用首先是输出字母表的问题，不是模型的问题。
  const esc = net.outputMode === 'escape18';
  const idxBits = esc ? nl.nOut - 5 : nl.nOut;
  if (net.outputMode !== 'token-id' && top.length !== 1 << idxBits) throw new Error(`top has ${top.length} entries, want ${1 << idxBits}`);
  const codeToId = net.outputMode === 'token-id' ? code => code : esc
    ? code => ((code >> (nl.nOut - 1)) & 1) ? (code & ((1 << (nl.nOut - 1)) - 1)) : top[code & ((1 << idxBits) - 1)]
    : code => top[code];
  const pad = Number(tokenizer.pad_token_id ?? 1);

  async function last6(text) {
    const ids = Array.from(await tokenizer.encode(String(text), { add_special_tokens: false }), Number);
    const six = ids.slice(-6);
    while (six.length < 6) six.unshift(pad);
    return six;
  }

  // 递归网表（nLatch > 0）：上下文压在 LATCH 里，每个 token 只跑一拍。
  // 老路径（nLatch = 0）每生成一个 token 都要把整段文本重新分词、取最后 6 个再打包，
  // 既是 O(n²)，上下文也被 nIn 写死在 6 个 token。
  const seq = nl.nLatch > 0;
  const W = seq ? (net.tokenBits ?? net.wrappedFrom?.width ?? nl.nIn - 4) : 0;
  const rBits = seq ? nl.nIn - W : nl.nIn - 102;
  // wrappedFrom.extra 是留给旁路逻辑的控制位，排在随机位之后。这里只用第一位：
  // gen = 0 表示还在预填充、= 1 表示正在生成。结构化摘要位靠它区分两个阶段——
  // 触发序列在真实提示里会出现多次且全在预填充里，不区分的话回放会被当预填充丢掉。
  const ctrl = seq ? (net.wrappedFrom?.extra ?? 0) : 0;
  const sampleBits = rBits - ctrl;
  const GEN = ctrl ? (1 << sampleBits) : 0;

  // 把 ids 逐拍喂进去建立状态，返回喂完后的状态。输出在预填充阶段丢弃。
  // 随机位取 0：裹出来的移位寄存器状态只由 token 决定，随机位只影响输出码。
  function prefill(ids) {
    let st = nl.newState();
    for (let i = 0; i < ids.length; i++) {
      const bytes = pack1(ids[i], 0, W, nl.nIn);
      if (onTick && (i % 64 === 0 || i === ids.length - 1)) {
        const r = measuredStep(nl, bytes, st); st = r.state;
        onTick({...r.sample,phase:'prefill',tick:i+1,total:ids.length});
      } else st = nl.step(bytes, st).state;
    }
    return st;
  }

  // One token: text -> last 6 ids (+ random bits) -> gates -> 13-bit code -> token id.
  async function nextToken(text, r = 0) {
    if (seq) {
      const ids = Array.from(await tokenizer.encode(String(text), { add_special_tokens: false }), Number);
      if (!ids.length) ids.push(pad);
      const st = prefill(ids.slice(0, -1));
      const { code } = nl.step(pack1(ids[ids.length - 1], r, W, nl.nIn), st);
      return { code, id: codeToId(code) };
    }
    const bytes = pack(await last6(text), r, nl.nIn);
    const measured = onTick ? measuredStep(nl, bytes, nl.newState()) : null;
    const code = measured ? measured.code : nl.evaluate(bytes);
    if (measured) onTick({...measured.sample,phase:'stateless',outputId:codeToId(code)});
    return { code, id: codeToId(code) };
  }

  // 递归模式的生成：整段提示只喂一遍，之后每生成一个 token 就把它喂回去推进状态。
  async function continueIds(p, maxTokens = MAX_REPLY_TOKENS, onToken = () => {}, shouldStop = () => false, greedy = false) {
    const ids = [];
    if (!p.length) p = [pad];
    let st = prefill(p.slice(0, -1));
    let cur = p[p.length - 1];
    const began = performance.now();
    let emitted = 0;
    for (let k = 0; k < maxTokens && !shouldStop(); k++) {
      const bytes = pack1(cur, (greedy ? 0 : randomBits(sampleBits)) | GEN, W, nl.nIn);
      const r = onTick ? measuredStep(nl, bytes, st) : nl.step(bytes, st);
      st = r.state;
      const id = codeToId(r.code);
      if (!EOS_IDS.has(id)) emitted++;
      if (onTick) onTick({...r.sample,phase:'generation',tick:k+1,outputId:id,eos:EOS_IDS.has(id),
        emitted,elapsedMs:performance.now()-began});
      if (EOS_IDS.has(id)) break;
      ids.push(id);
      cur = id;
      await onToken(id);
    }
    return ids;
  }

  async function continueText(text, maxTokens = MAX_REPLY_TOKENS, onToken = () => {}, shouldStop = () => false, greedy = false) {
    const ids = [];
    if (seq) {
      const p = Array.from(await tokenizer.encode(String(text), { add_special_tokens: false }), Number);
      return continueIds(p, maxTokens, onToken, shouldStop, greedy);
    }
    // Decode the whole continuation each step: a character split across byte-level
    // tokens only becomes valid text once all its pieces are there.
    let cur = text;
    for (let k = 0; k < maxTokens && !shouldStop(); k++) {
      const { id } = await nextToken(cur, greedy ? 0 : randomBits(rBits));
      if (EOS_IDS.has(id)) break;
      ids.push(id);
      cur = text + tokenizer.decode(ids, { skip_special_tokens: false });
      await onToken(id);
    }
    return ids;
  }

  const model = {
    async generate(opts) {
      const prompt = opts.input_ids.tolist()[0];
      const streamer = opts.streamer, stop = opts.stopping_criteria;
      streamer?.put([prompt]);                     // the prompt pass (skipped by the streamer)
      const out = [BigInt(THINK_END_ID)];          // no thinking phase: close it at once
      streamer?.put([[BigInt(THINK_END_ID)]]);
      const limit = Math.min(opts.max_new_tokens ?? MAX_REPLY_TOKENS, Math.max(MAX_REPLY_TOKENS, net.toolReplayMaxTokens ?? 0));
      const emit = async id => {
        out.push(BigInt(id));
        streamer?.put([[BigInt(id)]]);
        await new Promise(r => setTimeout(r, 0));  // let stop messages through
      };
      const user = [...(opts.__ctx?.messages ?? [])].reverse().find(m => m.role === 'user');
      let text = user ? textOf(user.content) : '';
      if (!text.trim()) text = 'Hello';
      if (seq) {
        // 两段都要，缺一不可：
        //  1) **整段模板**先过一遍——结构化摘要位靠它看到 <tools> 和轮次标记；
        //  2) 再把**用户这条消息**喂一遍——核心网表仍然只看最近 6 个 token 的窗口，
        //     而模板尾巴对所有问题都一样。实测只喂模板时，四个完全不同的问题得到
        //     一字不差相同的回复。老路径「只喂用户最后一条消息」不是多余的 hack，
        //     它是承重的；递归化只是让它不必再**排除**模板。
        // 摘要机不受第二段影响：触发已置 pending、名字已捕获、值寄存器已冻结。
        const tail = Array.from(await tokenizer.encode(text, { add_special_tokens: false }), Number);
        await continueIds([...prompt.map(Number), ...tail], limit, emit, () => !!stop?.interrupted);
      } else {
        await continueText(text, limit, emit, () => !!stop?.interrupted);
      }
      out.push(BigInt(IM_END_ID));
      streamer?.put([[BigInt(IM_END_ID)]]);
      streamer?.end?.();
      return { tolist: () => [[...prompt, ...out]] };
    },
    async dispose() {},
  };

  return {
    tokenizer, model, nextToken, continueText, continueIds,
    info: { gates: nl.gates, nIn: nl.nIn, nOut: nl.nOut, nLatch: nl.nLatch,
            window: seq ? 'finite-state recurrent' : 6, tokenBits: seq ? W : 17,
            vocab: top.length, randomBits: rBits, outputMode: net.outputMode },
  };
}
