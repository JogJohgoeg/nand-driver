export function packageReader(man, chunks) {
  const CH = man.chunk_max_bytes;
  return t => { const o = new Uint8Array(t.bytes); let p = 0, off = t.offset; while (p < t.bytes) { const ci = Math.floor(off / CH), co = off % CH, n = Math.min(t.bytes - p, CH - co); o.set(chunks[ci].subarray(co, co + n), p); p += n; off += n; } return o; };
}
