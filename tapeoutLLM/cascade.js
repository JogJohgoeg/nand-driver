// cascade.js — MiniCPM5-2B token-path reference for the K=1000/level cascade netlist.
// Self-contained ES module. Ships alongside tokenizer.json, tokenizer_config.json,
// special_tokens_map.json and top8192.json (same directory).
//
// Exports:
//   encode(prompt) -> Uint32Array(6)   last 6 MiniCPM token ids, oldest first,
//                                      left-padded with pad_token_id if the prompt
//                                      tokenizes to fewer than 6 tokens.
//   pack(ids)      -> Uint8Array(13)   102 input bits, LSB-first per byte:
//                                      bit i = (ids[i/17] >> (i%17)) & 1, and
//                                      byte b holds bits 8b..8b+7 (bit b*8+k in
//                                      byte b, bit k). Token s occupies bits
//                                      17s..17s+16, so ids[0] (oldest) is bits [16:0].
//   decode(code13) -> string           top8192[code13] -> token id -> its text
//                                      (tokenizer.decode, special tokens NOT skipped).
//   decodeTokenId(code13) -> number    the token id without the text step.
//
// Browser loads @huggingface/transformers from jsDelivr; Node resolves it from
// node_modules. tokenizer.json (9.9 MB raw / ~2.05 MB gzipped) and top8192.json are
// fetched lazily on first use.

const isNode = (typeof process !== 'undefined') && !!process.versions && !!process.versions.node;

async function loadTransformers() {
  if (isNode) {
    return await import('@huggingface/transformers');
  }
  return await import('https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1');
}

let _tokenizer = null;
let _top8192 = null;

async function getTokenizer() {
  if (_tokenizer) return _tokenizer;
  const { AutoTokenizer } = await loadTransformers();
  const dir = new URL('.', import.meta.url);
  if (isNode) {
    const { fileURLToPath } = await import('node:url');
    _tokenizer = await AutoTokenizer.from_pretrained(fileURLToPath(dir));
  } else {
    // Browser: from_pretrained() treats a URL as a hub model id, so build the
    // tokenizer directly from the two JSON files that ship next to this module.
    const { PreTrainedTokenizer } = await loadTransformers();
    const [tj, tc] = await Promise.all([
      fetch(new URL('tokenizer.json', import.meta.url)).then(r => r.json()),
      fetch(new URL('tokenizer_config.json', import.meta.url)).then(r => r.json()),
    ]);
    _tokenizer = new PreTrainedTokenizer(tj, tc);
  }
  return _tokenizer;
}

async function getTop8192() {
  if (_top8192) return _top8192;
  const url = new URL('top8192.json', import.meta.url);
  if (isNode) {
    const { fileURLToPath } = await import('node:url');
    const fs = await import('node:fs');
    _top8192 = JSON.parse(fs.readFileSync(fileURLToPath(url), 'utf8'));
  } else {
    _top8192 = await (await fetch(url)).json();
  }
  return _top8192;
}

export async function encode(prompt) {
  const t = await getTokenizer();
  const ids = await t.encode(String(prompt), { add_special_tokens: false });
  const arr = ids.map(Number);
  const pad = Number(t.pad_token_id ?? 1);
  let last6 = arr.slice(-6);
  while (last6.length < 6) last6.unshift(pad);
  return Uint32Array.from(last6);
}

export function pack(ids) {
  const bytes = new Uint8Array(13);
  for (let s = 0; s < 6; s++) {
    let id = BigInt(ids[s]) & 0x1ffffn;
    for (let j = 0; j < 17; j++) {
      const bit = Number((id >> BigInt(j)) & 1n);
      if (bit) {
        const i = s * 17 + j;
        bytes[i >> 3] |= 1 << (i & 7);
      }
    }
  }
  return bytes;
}

export async function decode(code13) {
  const id = await decodeTokenId(code13);
  const t = await getTokenizer();
  return await t.decode([id], { skip_special_tokens: false });
}

export async function decodeTokenId(code13) {
  const top = await getTop8192();
  return top[code13];
}

