// gatesim R9 W1：BitCPM4-1B 原 tokenizer（tokenizer.json，SHA 钉在 R62 BINDING）的 JS 实现，宿主 I/O 边界。
// 只做「文字 ↔ prompt / 输出 IDs」，不引用执行器，不参与 embedding / logits / argmax。
// 语义逐项照 tokenizer.json（HF tokenizers 0.2x）：
//  1. added tokens（11 个，全部 special、normalized=false、无 lstrip/rstrip）在原文上最左最长匹配切出，其余片段各自走下面流程；
//  2. normalizer：非空片段前置 ▁，空格替换为 ▁；pre_tokenizer 为空 ⇒ 整段是一个 BPE 词；
//  3. BPE：逐字符取 vocab，缺字按 UTF-8 字节回退 <0xXX>（字节 token 缺失才 unk，连续 unk 合并）；
//     合并按 merges 名次最小优先、同名次最左优先（与 HF 的 (rank, pos) 小顶堆一致）；
//  4. post_processor 只在 add_special_tokens 时加 <s>；R62 / R64 的 prompt 不加（默认 addBos=false）；
//  5. decoder：▁→空格、ByteFallback（连续字节按 UTF-8 解，非法则每字节一个 U+FFFD）、Fuse、整串开头去一个空格。
export class Tokenizer {
  constructor(tj) {
    const m = tj.model;
    if (m.type !== 'BPE' || !m.byte_fallback || m.continuing_subword_prefix || m.end_of_word_suffix || m.dropout) throw new Error('tokenizer: unsupported BPE options');
    const nz = tj.normalizer;
    if (tj.pre_tokenizer !== null || nz?.type !== 'Sequence' || nz.normalizers.length !== 2 || nz.normalizers[0].type !== 'Prepend' || nz.normalizers[0].prepend !== '▁'
      || nz.normalizers[1].type !== 'Replace' || nz.normalizers[1].pattern.String !== ' ' || nz.normalizers[1].content !== '▁') throw new Error('tokenizer: unexpected normalizer');
    const dd = tj.decoder?.decoders?.map(d => d.type).join(',');
    if (dd !== 'Replace,ByteFallback,Fuse,Strip' || tj.decoder.decoders[3].start !== 1 || tj.decoder.decoders[3].stop !== 0) throw new Error('tokenizer: unexpected decoder');
    this.vocab = new Map(Object.entries(m.vocab));
    this.unk = this.vocab.get(m.unk_token); this.fuseUnk = !!m.fuse_unk;
    this.added = tj.added_tokens.map(a => { if (a.normalized || a.lstrip || a.rstrip || a.single_word) throw new Error('tokenizer: unsupported added token ' + a.content); return [a.content, a.id, a.special]; });
    this.n = Math.max(...this.vocab.values(), ...this.added.map(a => a[1])) + 1;
    this.id2tok = new Array(this.n);
    for (const [k, i] of this.vocab) this.id2tok[i] = k;
    for (const [c, i] of this.added) this.id2tok[i] = c;
    this.addedById = new Map(this.added.map(([c, i, s]) => [i, s]));
    // merges：键 = 左 id * n + 右 id → [rank, 新 id]
    this.merges = new Map();
    m.merges.forEach((p, rank) => {
      const [a, b] = Array.isArray(p) ? p : p.split(' ');
      const ia = this.vocab.get(a), ib = this.vocab.get(b), ic = this.vocab.get(a + b);
      if (ia === undefined || ib === undefined || ic === undefined) throw new Error('tokenizer: merge outside vocab ' + a + ' ' + b);
      const k = ia * this.n + ib; if (!this.merges.has(k)) this.merges.set(k, [rank, ic]);
    });
    this.byteId = [...Array(256).keys()].map(b => this.vocab.get('<0x' + b.toString(16).toUpperCase().padStart(2, '0') + '>'));
    this.bos = this.vocab.get('<s>') ?? this.added.find(a => a[0] === '<s>')?.[1];
  }
  // 最左最长匹配切出 added tokens
  split(text) {
    const out = []; let i = 0, last = 0;
    while (i < text.length) {
      let best = null;
      for (const a of this.added) if (text.startsWith(a[0], i) && (!best || a[0].length > best[0].length)) best = a;
      if (best) { if (i > last) out.push(text.slice(last, i)); out.push(best); i += best[0].length; last = i; }
      else i++;
    }
    if (last < text.length) out.push(text.slice(last));
    return out;
  }
  bpe(word) {
    // 初始符号：逐 Unicode 字符
    const syms = []; let lastUnk = false;
    for (const ch of word) {
      const id = this.vocab.get(ch);
      if (id !== undefined) { syms.push(id); lastUnk = false; continue; }
      const bytes = new TextEncoder().encode(ch), ids = [...bytes].map(b => this.byteId[b]);
      if (ids.every(x => x !== undefined)) { syms.push(...ids); lastUnk = false; }
      else { if (!(this.fuseUnk && lastUnk)) syms.push(this.unk); lastUnk = true; }
    }
    // 双向链表 + (rank, pos) 小顶堆，与 HF Word::merge_all 相同
    const n = syms.length, id = Int32Array.from(syms), prev = new Int32Array(n), next = new Int32Array(n), alive = new Uint8Array(n).fill(1);
    for (let i = 0; i < n; i++) { prev[i] = i - 1; next[i] = i + 1 < n ? i + 1 : -1; }
    const heap = [];
    const less = (x, y) => x[0] < y[0] || (x[0] === y[0] && x[1] < y[1]);
    const push = e => { heap.push(e); let i = heap.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (!less(heap[i], heap[p])) break; [heap[i], heap[p]] = [heap[p], heap[i]]; i = p; } };
    const pop = () => { const top = heap[0], l = heap.pop(); if (heap.length) { heap[0] = l; let i = 0; for (;;) { const a = 2 * i + 1, b = a + 1; let s = i; if (a < heap.length && less(heap[a], heap[s])) s = a; if (b < heap.length && less(heap[b], heap[s])) s = b; if (s === i) break; [heap[i], heap[s]] = [heap[s], heap[i]]; i = s; } } return top; };
    const tryPair = i => { const j = next[i]; if (j < 0) return; const r = this.merges.get(id[i] * this.n + id[j]); if (r) push([r[0], i, r[1], id[i], id[j]]); };
    for (let i = 0; i + 1 < n; i++) tryPair(i);
    while (heap.length) {
      const [rank, i, nid, a, b] = pop();
      const j = next[i];
      if (!alive[i] || j < 0 || id[i] !== a || id[j] !== b) continue;   // 过期条目
      id[i] = nid; alive[j] = 0; next[i] = next[j]; if (next[j] >= 0) prev[next[j]] = i;
      if (prev[i] >= 0) tryPair(prev[i]);
      tryPair(i);
    }
    const out = []; for (let i = 0; i >= 0 && i < n; i = next[i]) out.push(id[i]);
    return out;
  }
  encode(text, { addBos = false } = {}) {
    const ids = addBos ? [this.bos] : [];
    for (const seg of this.split(text)) {
      if (Array.isArray(seg)) { ids.push(seg[1]); continue; }
      ids.push(...this.bpe('▁' + seg.replaceAll(' ', '▁')));
    }
    return ids;
  }
  decode(ids, { skipSpecial = false } = {}) {
    let s = '', bytes = [];
    const flush = () => { if (!bytes.length) return; const u = Uint8Array.from(bytes); try { s += new TextDecoder('utf-8', { fatal: true }).decode(u); } catch { s += '�'.repeat(bytes.length); } bytes = []; };
    for (const i of ids) {
      if (skipSpecial && this.addedById.get(i)) continue;
      const t = this.id2tok[i]; if (t === undefined) throw new Error('decode: id out of vocab ' + i);
      const mb = /^<0x([0-9A-F]{2})>$/.exec(t);
      if (mb && !this.addedById.has(i)) { bytes.push(parseInt(mb[1], 16)); continue; }
      flush(); s += this.addedById.has(i) ? t : t.replaceAll('▁', ' ');
    }
    flush();
    return s.startsWith(' ') ? s.slice(1) : s;
  }
}
// 官方 chat_template（tokenizer_config.json）：逐条 '<|im_start|>' + role + '\n' + content + '<|im_end|>\n'，末尾生成提示 '<|im_start|>assistant\n'；不加 BOS
export function renderChat(messages, { addGenerationPrompt = true } = {}) {
  let s = '';
  for (const m of messages) s += '<|im_start|>' + m.role + '\n' + m.content + '<|im_end|>' + '\n';
  if (addGenerationPrompt) s += '<|im_start|>assistant\n';
  return s;
}
// Python json.dumps 默认输出（ensure_ascii=True，分隔符 ', ' 与 ': '，保持键序）
export function pyJson(v) {
  if (v === null) return 'null';
  if (v === true) return 'true'; if (v === false) return 'false';
  if (typeof v === 'number') { if (!Number.isFinite(v)) throw new Error('pyJson: non-finite'); return Number.isInteger(v) ? String(v) : String(v); }
  if (typeof v === 'string') {
    let o = '"';
    for (const ch of v) {
      const c = ch.codePointAt(0);
      if (ch === '"') o += '\\"'; else if (ch === '\\') o += '\\\\';
      else if (ch === '\n') o += '\\n'; else if (ch === '\r') o += '\\r'; else if (ch === '\t') o += '\\t'; else if (ch === '\b') o += '\\b'; else if (ch === '\f') o += '\\f';
      else if (c < 0x20 || c > 0x7e) {
        const u = c > 0xffff ? [0xd800 + ((c - 0x10000) >> 10), 0xdc00 + ((c - 0x10000) & 0x3ff)] : [c];
        for (const x of u) o += '\\u' + x.toString(16).padStart(4, '0');
      } else o += ch;
    }
    return o + '"';
  }
  if (Array.isArray(v)) return '[' + v.map(pyJson).join(', ') + ']';
  return '{' + Object.entries(v).map(([k, x]) => pyJson(k) + ': ' + pyJson(x)).join(', ') + '}';
}
// R64 FORMAT 的工具提示适配：system 内容后附 '\n<tools>\n' + 每行一个工具 JSON + '\n</tools>\n'，再走未改的官方模板
export function adaptTools(messages, tools) {
  if (!tools || !tools.length) return messages;
  const block = '\n<tools>\n' + tools.map(pyJson).join('\n') + '\n</tools>\n';
  const out = messages.map(m => ({ ...m }));
  const sys = out.find(m => m.role === 'system');
  if (!sys) throw new Error('adaptTools: R64 适配要求有 system 消息');
  sys.content += block;
  return out;
}
