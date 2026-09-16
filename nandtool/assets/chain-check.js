/* chain-check.js
 *
 * Read-only on-chain cross-check for the NAND grid netlist used by nand_step.
 * The same 386-gate netlist that this page evaluates in a Web Worker is also
 * burned on BNB Chain as cid 287 of a CPU contract. This module re-evaluates
 * that on-chain circuit with a plain eth_call - no signature, no gas, no
 * wallet - and reports what it returned.
 *
 * It never throws. Any RPC failure, timeout or decode problem comes back as
 * {ok:false, why}, so a caller can always fall back to the in-browser result
 * and say so honestly.
 *
 * Browser:  <script src="assets/chain-check.js"></script>  ->  window.__nandChain
 * Node:     const C = require("./chain-check.js");
 */
(function () {
  var RPC = "https://bsc-rpc.publicnode.com";
  var TO = "0x6Fb4089e7Cbaa9660Fd11056274Cbd8117EE5B38";
  var CID = 287;
  var SEL = "e8281a1a"; /* keccak256("step(uint256,bytes,bytes)"), first 4 bytes */
  var TIMEOUT_MS = 5000;
  var ANAME = ["NOOP", "DOWN", "UP", "LEFT", "RIGHT"];

  function hexU256(n) { var s = n.toString(16); while (s.length < 64) s = "0" + s; return s; }

  /* Pack bit chars ('0'/'1'), least-significant bit first, into bytes:
   * bit i lands in byte i>>3 at position i&7. */
  function packBits(bitsStr) {
    var n = (bitsStr.length + 7) >> 3, b = new Uint8Array(n);
    for (var i = 0; i < bitsStr.length; i++) if (bitsStr.charAt(i) === "1") b[i >> 3] |= 1 << (i & 7);
    return b;
  }

  function cellIndex(row, col) { return row * 11 + col; } /* 0..120, fits 7 bits */

  /* 14 bit chars, LSB first: bits 0-6 = agent cell index, bits 7-13 = target. */
  function bitsFor(ar, ac, tr, tc) {
    var ai = cellIndex(ar, ac), ti = cellIndex(tr, tc), s = "";
    for (var i = 0; i < 7; i++) s += "" + ((ai >> i) & 1);
    for (var j = 0; j < 7; j++) s += "" + ((ti >> j) & 1);
    return s;
  }

  /* step(287, bytes state, bytes input): head = [cid, offState, offInput],
   * then the two dynamic bytes. Empty state is one length word; the input is
   * the packed bits, length-prefixed and right-padded to a 32-byte word. */
  function buildCallData(inputBytes) {
    var stateEnc = hexU256(0);
    var inHex = "";
    for (var i = 0; i < inputBytes.length; i++) inHex += (inputBytes[i] < 16 ? "0" : "") + inputBytes[i].toString(16);
    var inEnc = hexU256(inputBytes.length) + inHex;
    while (inEnc.length < 128) inEnc += "0";
    var offInput = 0x60 + stateEnc.length / 2;
    return SEL + hexU256(CID) + hexU256(0x60) + hexU256(offInput) + stateEnc + inEnc;
  }

  /* The function returns (bytes, bytes); the second bytes hold the output bits,
   * of which bits 0-2 are the action. */
  function decodeSecondBytes(hex) {
    hex = hex.replace(/^0x/, "");
    if (hex.length < 128) return null;
    var off2 = parseInt(hex.substr(64, 64), 16);
    if (isNaN(off2) || off2 * 2 + 64 > hex.length) return null;
    var len2 = parseInt(hex.substr(off2 * 2, 64), 16);
    if (isNaN(len2)) return null;
    var dataHex = hex.substr(off2 * 2 + 64, Math.min(len2, 32) * 2);
    if (!dataHex) return null;
    var b0 = parseInt(dataHex.substr(0, 2), 16);
    var act = (b0 & 1) | (((b0 >> 1) & 1) << 1) | (((b0 >> 2) & 1) << 2);
    return { action: act, raw: dataHex };
  }

  /* Run the on-chain step for a 14-char bit string. Never throws. */
  async function checkBits(bitsStr) {
    var data = "0x" + buildCallData(packBits(bitsStr));
    var ctrl = new AbortController();
    var timer = setTimeout(function () { ctrl.abort(); }, TIMEOUT_MS);
    try {
      var res = await fetch(RPC, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_call",
          params: [{ to: TO, data: data }, "latest"] }),
        signal: ctrl.signal
      });
      var j = await res.json();
      if (j && j.error) return { ok: false, why: "RPC error " + String(j.error.message || j.error.code).slice(0, 120) };
      if (!j || !j.result || j.result === "0x") return { ok: false, why: "empty RPC result" };
      var dec = decodeSecondBytes(j.result);
      if (!dec) return { ok: false, why: "could not decode " + String(j.result).slice(0, 40) };
      return { ok: true, action: dec.action, raw: dec.raw, bits: bitsStr };
    } catch (e) {
      var why = (e && e.name === "AbortError") ? "timeout after " + TIMEOUT_MS + " ms" : String(e && e.message || e).slice(0, 120);
      return { ok: false, why: why };
    } finally { clearTimeout(timer); }
  }

  /* Convenience: check an (agent, target) cell pair against the action the
   * in-browser netlist produced. Returns a ready-to-print line plus the verdict. */
  async function check(ar, ac, tr, tc, localAction) {
    var r = await checkBits(bitsFor(ar, ac, tr, tc));
    if (!r.ok) return { ok: false, agree: false, line: "chain check unavailable: " + r.why + " - in-browser result stands (action " + localAction + ")" };
    var agree = (r.action === localAction);
    return { ok: true, agree: agree, action: r.action, raw: r.raw,
      line: "chain check: read-only eth_call to CPU " + TO.slice(0, 6) + "..." + TO.slice(-4) +
        " (BSC, cid " + CID + ") returned " + r.raw + " -> action " + r.action + " (" + ANAME[r.action] + ")" +
        (agree ? " - AGREES with the in-browser netlist" : " - DISAGREES with the in-browser netlist (action " + localAction + ")") };
  }

  var api = { check: check, checkBits: checkBits, bitsFor: bitsFor, packBits: packBits,
    cellIndex: cellIndex, RPC: RPC, TO: TO, CID: CID, SEL: SEL };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  globalThis.__nandChain = api;
})();
