// gatesim R8：缓存写入 worker。主线程把准备包各字段的缓冲转移过来（零拷贝），这里用 OPFS 同步句柄逐段写入文件后立即丢弃，不经 Blob。
self.onmessage = async ev => {
  const { dir, name, head, parts, discard } = ev.data;
  if (discard) { self.postMessage({ name, ok: true, bytes: 0 }); return; }   // 只接管后丢弃：把已上传的准备包缓冲移出主线程
  try {
    const root = await navigator.storage.getDirectory(), d = await root.getDirectoryHandle(dir, { create: true });
    const fh = await d.getFileHandle(name + '.pack', { create: true }), h = await fh.createSyncAccessHandle();
    h.truncate(0); let at = 0;
    const w = u8 => { h.write(u8, { at }); at += u8.byteLength; };
    const hb = new TextEncoder().encode(JSON.stringify(head)), pre = new Uint8Array(8); new DataView(pre.buffer).setUint32(0, hb.byteLength, true);
    w(pre); w(hb); w(new Uint8Array((8 - hb.byteLength % 8) % 8));
    let off = 0;
    for (const [buf, bo, bl] of parts) { const pad = (8 - off % 8) % 8; if (pad) { w(new Uint8Array(pad)); off += pad; } w(new Uint8Array(buf, bo, bl)); off += bl; }
    h.flush(); h.close();
    self.postMessage({ name, ok: true, bytes: at });
  } catch (e) { self.postMessage({ name, ok: false, error: String(e) }); }
};
