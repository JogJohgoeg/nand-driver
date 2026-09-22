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
  let n, A, B;
  if (records) {
    const r = records instanceof Uint8Array ? records : new Uint8Array(records);
    if (r.length % 7) throw new Error('netlist.bin length is not a multiple of 7');
    n = r.length / 7;
    A = new Int32Array(n); B = new Int32Array(n);
    for (let i = 0, o = 0; i < n; i++, o += 7) {
      if (r[o] !== 0) throw new Error('non-NAND record at ' + i);
      A[i] = (r[o + 1] << 16) | (r[o + 2] << 8) | r[o + 3];
      B[i] = (r[o + 4] << 16) | (r[o + 5] << 8) | r[o + 6];
    }
  } else {
    const hex = net.nl_hex.startsWith('0x') ? net.nl_hex.slice(2) : net.nl_hex;
    if (hex.length % 14) throw new Error('netlist hex length is not a multiple of 14');
    n = hex.length / 14;
    A = new Int32Array(n); B = new Int32Array(n);
    for (let i = 0; i < n; i++) {
      const o = i * 14;
      if (hex.substr(o, 2) !== '00') throw new Error('non-NAND record at ' + i);
      A[i] = parseInt(hex.substr(o + 2, 6), 16);
      B[i] = parseInt(hex.substr(o + 8, 6), 16);
    }
  }
  if (n !== net.nNand || net.nLatch) throw new Error(`record count ${n} != nNand ${net.nNand}`);
  const base = 2 + net.nIn, nOut = net.nOut, nIn = net.nIn;
  for (let i = 0; i < n; i++) {
    if (A[i] >= base + i || B[i] >= base + i) throw new Error('record ' + i + ' reads a later wire');
  }
  const w = new Uint8Array(base + n);
  // Evaluate all gates in index order on the packed input bytes; return the output code.
  function evaluate(bytes) {
    w[0] = 0; w[1] = 1;
    for (let i = 0; i < nIn; i++) w[2 + i] = (bytes[i >> 3] >> (i & 7)) & 1;
    for (let i = 0; i < n; i++) w[base + i] = 1 - (w[A[i]] & w[B[i]]);
    let code = 0;
    for (let k = 0; k < nOut; k++) code |= w[base + n - nOut + k] << k;
    return code;
  }
  return { evaluate, gates: n, nIn, nOut };
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

export async function createBrain({ base, templateUrl, makeTokenizer, fetchImpl = fetch }) {
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
  const net = await get(u('netlist.json'));
  const [tj, tc, top, template] = await Promise.all([
    get(u(net.tokenizer ?? 'tokenizer.json')), get(u(net.tokenizerConfig ?? 'tokenizer_config.json')),
    get(u(net.top ?? 'top8192.json')), get(templateUrl, 'text'),
  ]);
  const tokenizer = makeTokenizer(tj, { ...tc, chat_template: template });
  let records = net.nl_hex ? null : await get(u(net.records ?? 'netlist.bin'), 'bin');
  if (records && net.recordsFormat === 'nlz1') records = nlz1Records(new Uint8Array(records), net.nIn);
  if (records && net.recordsSha256) {
    const sha = [...new Uint8Array(await crypto.subtle.digest('SHA-256', records))].map(b => b.toString(16).padStart(2, '0')).join('');
    if (sha !== net.recordsSha256) throw new Error(`netlist records sha256 ${sha} != ${net.recordsSha256}`);
  }
  const nl = decodeNetlist(net, records);
  if (top.length !== 1 << nl.nOut) throw new Error(`top8192 has ${top.length} entries, want ${1 << nl.nOut}`);
  const pad = Number(tokenizer.pad_token_id ?? 1);

  async function last6(text) {
    const ids = Array.from(await tokenizer.encode(String(text), { add_special_tokens: false }), Number);
    const six = ids.slice(-6);
    while (six.length < 6) six.unshift(pad);
    return six;
  }

  const rBits = nl.nIn - 102;

  // One token: text -> last 6 ids (+ random bits) -> gates -> 13-bit code -> token id.
  async function nextToken(text, r = 0) {
    const code = nl.evaluate(pack(await last6(text), r, nl.nIn));
    return { code, id: top[code] };
  }

  async function continueText(text, maxTokens = MAX_REPLY_TOKENS, onToken = () => {}, shouldStop = () => false, greedy = false) {
    // Decode the whole continuation each step: a character split across byte-level
    // tokens only becomes valid text once all its pieces are there.
    const ids = [];
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
    info: { gates: nl.gates, nIn: nl.nIn, nOut: nl.nOut, window: 6, vocab: top.length, randomBits: rBits },
  };
}
