// netlist-brain.js — the impossible LLM as the Pi workbench's "model".
//
// Replaces MiniCPM5-2B in the upstream agent worker. Every generated token is one
// evaluation of the 54,147-gate NAND netlist from ../../impossibleLLM/netlist.json,
// gate by gate over a wire array, on the CPU. No weights, no WebGPU.
//
// What the netlist sees: the last 6 MiniCPM5 tokens of the text being continued
// (102 input bits, 17 per token, oldest first), and it answers with a 13-bit code
// into top8192.json (a MiniCPM5 token id). Greedy and stateless, exactly as on
// the /impossibleLLM/ page. Because a 6-token window over the chat template would
// always see the same template tail, the reply continues the user's last message.
//
// exports createBrain({ base, templateUrl, makeTokenizer, fetchImpl }) -> { tokenizer, model, info }
//   makeTokenizer(tokenizerJSON, tokenizerConfig) builds a transformers.js tokenizer.
//   model.generate(opts) mimics the subset of transformers.js generate() the worker uses.

export const MAX_REPLY_TOKENS = 48;
export const THINK_END_ID = 9;        // "</think>"
export const IM_END_ID = 130073;      // "<|im_end|>"
const EOS_IDS = new Set([1, IM_END_ID]);

export function decodeNetlist(net) {
  const hex = net.nl_hex.startsWith('0x') ? net.nl_hex.slice(2) : net.nl_hex;
  if (hex.length % 14) throw new Error('netlist hex length is not a multiple of 14');
  const n = hex.length / 14;
  if (n !== net.nNand || net.nLatch) throw new Error(`record count ${n} != nNand ${net.nNand}`);
  const A = new Int32Array(n), B = new Int32Array(n);
  for (let i = 0; i < n; i++) {
    const o = i * 14;
    if (hex.substr(o, 2) !== '00') throw new Error('non-NAND record at ' + i);
    A[i] = parseInt(hex.substr(o + 2, 6), 16);
    B[i] = parseInt(hex.substr(o + 8, 6), 16);
  }
  const base = 2 + net.nIn, nOut = net.nOut, nIn = net.nIn;
  const w = new Uint8Array(base + n);
  // Evaluate all gates in index order on the packed input bytes; return the output code.
  function evaluate(bytes) {
    w.fill(0); w[1] = 1;
    for (let i = 0; i < nIn; i++) w[2 + i] = (bytes[i >> 3] >> (i & 7)) & 1;
    for (let i = 0; i < n; i++) w[base + i] = 1 - (w[A[i]] & w[B[i]]);
    let code = 0;
    for (let k = 0; k < nOut; k++) code |= w[base + n - nOut + k] << k;
    return code;
  }
  return { evaluate, gates: n, nIn, nOut };
}

export function pack(ids) {
  const bytes = new Uint8Array(13);
  for (let s = 0; s < 6; s++) {
    const id = Number(ids[s]) & 0x1ffff;
    for (let j = 0; j < 17; j++) {
      if ((id >> j) & 1) { const i = s * 17 + j; bytes[i >> 3] |= 1 << (i & 7); }
    }
  }
  return bytes;
}

const textOf = c => typeof c === 'string' ? c
  : (c ?? []).filter(p => p.type === 'text').map(p => p.text).join('\n');

export async function createBrain({ base, templateUrl, makeTokenizer, fetchImpl = fetch }) {
  const get = async (url, kind) => {
    const r = await fetchImpl(url);
    if (!r.ok) throw new Error(`${url} HTTP ${r.status}`);
    return kind === 'text' ? r.text() : r.json();
  };
  const u = f => new URL(f, base).href;
  const [net, tj, tc, top, template] = await Promise.all([
    get(u('netlist.json')), get(u('tokenizer.json')), get(u('tokenizer_config.json')),
    get(u('top8192.json')), get(templateUrl, 'text'),
  ]);
  const tokenizer = makeTokenizer(tj, { ...tc, chat_template: template });
  const nl = decodeNetlist(net);
  if (top.length !== 1 << nl.nOut) throw new Error(`top8192 has ${top.length} entries, want ${1 << nl.nOut}`);
  const pad = Number(tokenizer.pad_token_id ?? 1);

  async function last6(text) {
    const ids = Array.from(await tokenizer.encode(String(text), { add_special_tokens: false }), Number);
    const six = ids.slice(-6);
    while (six.length < 6) six.unshift(pad);
    return six;
  }

  // One token: text -> last 6 ids -> 102 bits -> 54,147 gates -> 13-bit code -> token id.
  async function nextToken(text) {
    const code = nl.evaluate(pack(await last6(text)));
    return { code, id: top[code] };
  }

  async function continueText(text, maxTokens = MAX_REPLY_TOKENS, onToken = () => {}, shouldStop = () => false) {
    const ids = [];
    for (let k = 0; k < maxTokens && !shouldStop(); k++) {
      const { id } = await nextToken(text);
      if (EOS_IDS.has(id)) break;
      text += tokenizer.decode([id], { skip_special_tokens: false });
      ids.push(id);
      await onToken(id);
    }
    return ids;
  }

  const model = {
    async generate(opts) {
      const prompt = opts.input_ids.tolist()[0];
      const streamer = opts.streamer, stop = opts.stopping_criteria;
      const user = [...(opts.__ctx?.messages ?? [])].reverse().find(m => m.role === 'user');
      let text = user ? textOf(user.content) : '';
      if (!text.trim()) text = 'Hello';
      streamer?.put([prompt]);                     // the prompt pass (skipped by the streamer)
      const out = [BigInt(THINK_END_ID)];          // no thinking phase: close it at once
      streamer?.put([[BigInt(THINK_END_ID)]]);
      const limit = Math.min(opts.max_new_tokens ?? MAX_REPLY_TOKENS, MAX_REPLY_TOKENS);
      await continueText(text, limit, async id => {
        out.push(BigInt(id));
        streamer?.put([[BigInt(id)]]);
        await new Promise(r => setTimeout(r, 0));  // let stop messages through
      }, () => !!stop?.interrupted);
      out.push(BigInt(IM_END_ID));
      streamer?.put([[BigInt(IM_END_ID)]]);
      streamer?.end?.();
      return { tolist: () => [[...prompt, ...out]] };
    },
    async dispose() {},
  };

  return {
    tokenizer, model, nextToken, continueText,
    info: { gates: nl.gates, nIn: nl.nIn, nOut: nl.nOut, window: 6, vocab: top.length },
  };
}
