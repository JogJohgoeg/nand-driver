// SPDX-License-Identifier: CC0-1.0
// Host rules written in the description segment of the file: tokenizer, window, length cap, selection.
// These are NOT gate circuits. They are integer and text procedures; this file carries them out as the
// description segment words them. Every table and every number comes from the description segment.

// Whitespace: the set the rule's author used (Unicode White_Space plus U+001C..U+001F), spelled out so that
// it does not depend on the browser.
const WS = /[\t\n\v\f\r\x1c-\x1f \x85\xa0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000]+/g;
export const normalise = text => text.replace(WS, ' ').replace(/^ | $/g, '');

const tables = new WeakMap();
function table(tok) {
  let t = tables.get(tok);
  if (!t) {
    const id = new Map(); let maxlen = 0;
    for (let i = 4; i < tok.pieces.length; i++) { const p = Array.from(tok.pieces[i]); id.set(tok.pieces[i], i); if (p.length > maxlen) maxlen = p.length; }
    tables.set(tok, t = { id, maxlen });
  }
  return t;
}
// tokenizer.encode, steps 1-5. Returns the pieces of the text (no BOS).
export function encode(text, tok) {
  const clean = normalise(text);
  if (!clean) return [];
  const s = Array.from('\u2581' + clean.replace(/ /g, '\u2581')), n = s.length, { id, maxlen } = table(tok);
  const best = new Array(n + 1).fill(null), back = new Array(n + 1).fill(null);
  best[0] = 0;
  for (let start = 0; start < n; start++) {
    if (best[start] === null) continue;
    let single = false, sub = '';
    for (let len = 1; len <= maxlen && start + len <= n; len++) {
      sub += s[start + len - 1];
      const i = id.get(sub);
      if (i === undefined) continue;
      if (len === 1) single = true;
      const cand = best[start] + tok.scores[i], end = start + len;
      if (best[end] === null || cand > best[end]) { best[end] = cand; back[end] = [start, i]; }
    }
    if (!single) { const cand = best[start] + tok.unknown; if (best[start + 1] === null || cand > best[start + 1]) { best[start + 1] = cand; back[start + 1] = [start, 3]; } }
  }
  const out = [];
  for (let e = n; e > 0;) { const [st, i] = back[e]; out.push(i); e = st; }
  out.reverse();
  return out.filter((i, k) => i !== 3 || k === 0 || out[k - 1] !== 3);
}
// tokenizer.decode: ids 0, 1, 2 give nothing; every other id gives its piece; U+2581 becomes a space.
export const decode = (ids, tok) => ids.filter(i => i > 2).map(i => tok.pieces[i]).join('').replace(/\u2581/g, ' ');
export const chars = text => Array.from(text).length;

// selection: words(t) = the maximal runs of a-z, 0-9 and apostrophe after turning A-Z into a-z
export const words = t => t.replace(/[A-Z]/g, c => c.toLowerCase()).match(/[a-z0-9']+/g) || [];
function forbidden(before, after, k) {
  if (after.length < 2 * k) return false;
  if (after.length === before.length && after.every((w, i) => w === before[i])) return false;
  const n = after.length;
  for (let i = 0; i <= n - k - 1; i++) { let j = 0; while (j < k && after[i + j] === after[n - k + j]) j++; if (j === k) return true; }
  return false;
}
// scores: one output row. opening: the normalised opening text. fresh: the pieces written so far.
// Returns { token, rank (place of the piece taken among the candidates, 0 = highest score), blocked }.
export function select(scores, opening, fresh, tok, sel, special) {
  const order = [];
  for (let i = 0; i < scores.length; i++) if (i !== special.unk) order.push(i);
  order.sort((a, b) => scores[b] - scores[a] || a - b);
  const cand = order.slice(0, sel.candidates), before = words(opening + decode(fresh, tok));
  for (let r = 0; r < cand.length; r++) {
    if (cand[r] === special.eos || !forbidden(before, words(opening + decode([...fresh, cand[r]], tok)), sel.words)) return { token: cand[r], rank: r, blocked: r };
  }
  return { token: cand[0], rank: 0, blocked: cand.length };
}

// window rule, the part before a step: append the piece picked in the previous step, then, if the context
// holds `size` pieces or more, remove its first `drop` pieces (once). Returns the new context and whether it dropped.
export function advance(context, picked, win) {
  const c = picked === null ? context.slice() : [...context, picked];
  return c.length >= win.size ? { context: c.slice(win.drop), dropped: true } : { context: c, dropped: false };
}
