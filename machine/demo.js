/* 模型机页面的演示：读同目录的 toy_bmlp.tbw1（或用户自己选的 .tbw1），用 bmlp.js 一个字节一个字节写出来。
   中英文共用，按 <html lang> 取文案。不连服务器以外的任何地方；模型文件就在本页旁边。 */
(function () {
  "use strict";
  var EN = /^en/.test(document.documentElement.lang);
  var SRC = (document.currentScript && document.currentScript.getAttribute("data-model")) || "toy_bmlp.tbw1";   // 英文页指回 machine/ 那一份
  var T = EN ? {
    loading: "Loading…", missing: "Model file not published yet — pick a .tbw1 file to run it here",
    bad: "Can't read this file: ", run: "Write 200 characters", again: "Write 200 more", writing: "Writing…", stop: "Stop",
    shape: function (m) { return m.K + "-byte context · 2 binary layers of " + m.H + " · " + (m.t.h0.rows * m.t.h0.cols + m.t.h1.rows * m.t.h1.cols + m.t.out.rows * m.t.out.cols).toLocaleString("en") + " one-bit weights"; },
    speed: function (n, ms) { return ms >= MIN_MS ? n + " bytes in " + (ms / 1000).toFixed(2) + " s of computing (" + Math.round(n / (ms / 1000)) + " bytes/s)" : n + " bytes (too fast to time)"; },
    nosha: "(this browser can't compute sha256 here)",
    shaOk: "(✓ computed here; same as registered)", shaBad: "(✗ computed here; differs from registered)", outWait: "(reference answer; checked after 200 characters)",
    outOk: "(✓ what it wrote matches the reference answer)", outBad: "(✗ what it wrote differs from the reference answer)", outMore: "(fingerprint of everything written so far; the reference answer covers the first 200)"
  } : {
    loading: "正在读取…", missing: "模型文件还没放上来——可以自己选一个 .tbw1 文件在这里跑",
    bad: "读不了这个文件：", run: "写 200 个字", again: "再写 200 个", writing: "正在写…", stop: "停",
    shape: function (m) { return "看前 " + m.K + " 个字节 · 两层各 " + m.H + " 个二值单元 · " + (m.t.h0.rows * m.t.h0.cols + m.t.h1.rows * m.t.h1.cols + m.t.out.rows * m.t.out.cols).toLocaleString("zh-CN") + " 个一位权重"; },
    speed: function (n, ms) { return ms >= MIN_MS ? n + " 个字节，计算用了 " + (ms / 1000).toFixed(2) + " 秒（每秒 " + Math.round(n / (ms / 1000)) + " 个）" : n + " 个字节（太快，没算速度）"; },
    nosha: "（这个浏览器在这里算不了 sha256）",
    shaOk: "（✓ 已算出，和登记值一致）", shaBad: "（✗ 算出来和登记值不一样）", outWait: "（标准答案，写完 200 个字后核对）",
    outOk: "（✓ 写出来的和标准答案一致）", outBad: "（✗ 写出来的和标准答案不一样）", outMore: "（这是目前写出的全部内容的指纹；标准答案对的是前 200 个）"
  };
  var MIN_MS = 50;                                          // 计算时间太短（或计时器精度被浏览器调粗）时不算每秒多少个，免得出 Infinity
  var $ = function (id) { return document.getElementById(id); };
  var STOP_MS = 400;                                        // 写了这么久还没写完，「写」的按钮才原地换字成「停」；平时不到半秒就写完，不会闪一下「停」
  var model = null, it = null, bytes = [], busy = false, stopped = false, canStop = false, t0 = 0, workMs = 0, isDefault = false;
  // 只有这一个按钮，原地换字：几种字都事先写在按钮里占好宽度（网页里写好的），这里只换看得见的那一个
  function btnText(text) { var b = $("run"), s = b.firstElementChild; if (s) s.textContent = text; else b.textContent = text; }
  // 登记值写在页面里（data-reg）：页面一打开就有，不等读文件；读完、写完各自算一遍和它比。用户另选的文件没有登记值，不比。
  var REG = { sha: $("f-sha").getAttribute("data-reg"), out: $("f-out").getAttribute("data-reg") };
  function st(id, text) { var e = $(id); if (e) e.textContent = text; }
  function done(id, text) { $(id).textContent = text; $(id).setAttribute("data-computed", "1"); }   // workMs：累计的纯计算时间，不含让界面的空档

  function hex(buf) { return Array.prototype.map.call(new Uint8Array(buf), function (b) { return (b < 16 ? "0" : "") + b.toString(16); }).join(""); }
  function sha256(u8) {
    if (!(window.crypto && crypto.subtle)) return Promise.resolve(T.nosha);
    return crypto.subtle.digest("SHA-256", u8).then(hex);
  }
  function show(b) { return b === 10 ? "\n" : b < 32 || b === 127 ? "·" : String.fromCharCode(b); }

  function load(buf, label) {
    try { model = TBMLP.parse(buf); } catch (e) { $("f-file").textContent = T.bad + e.message; $("run").disabled = true; return; }
    $("f-file").textContent = label + " · " + buf.byteLength.toLocaleString() + " B";
    $("f-shape").textContent = T.shape(model);
    isDefault = label === "toy_bmlp.tbw1" && !!REG.sha;
    $("f-sha").removeAttribute("data-computed"); $("f-out").removeAttribute("data-computed");
    sha256(new Uint8Array(buf)).then(function (h) { done("f-sha", h); st("f-sha-st", isDefault ? (h === REG.sha ? T.shaOk : T.shaBad) : ""); });
    $("prompt").textContent = Array.prototype.map.call(model.t.prompt.data, function (c) { return show(c & 0x7f); }).join("");
    $("gen").textContent = ""; $("f-out").textContent = isDefault && REG.out ? REG.out + " (200 B)" : "—"; st("f-out-st", isDefault && REG.out ? T.outWait : ""); $("f-speed").textContent = "—";
    it = null; bytes = []; workMs = 0;
    btnText(T.run); $("run").disabled = false;
  }

  function step(goal) {
    var t = performance.now(), until = t + 30;                // 每 30 ms 让一次界面
    while (!stopped && bytes.length < goal && performance.now() < until) {
      var r = it.next();
      if (r.done) { goal = bytes.length; break; }
      bytes.push(r.value);
      $("gen").textContent += show(r.value);
    }
    workMs += performance.now() - t;
    if (!stopped && bytes.length < goal) {
      if (!canStop && performance.now() - t0 >= STOP_MS) { canStop = true; btnText(T.stop); }
      return requestAnimationFrame(function () { step(goal); });
    }
    busy = false; canStop = false; btnText(T.again);
    $("f-speed").textContent = bytes.length ? T.speed(bytes.length, workMs) : "—";
    var nb = bytes.length;
    sha256(new Uint8Array(bytes)).then(function (h) { done("f-out", h + " (" + nb + " B)"); st("f-out-st", !isDefault || !REG.out ? "" : nb !== 200 ? T.outMore : h === REG.out ? T.outOk : T.outBad); });
  }

  $("run").addEventListener("click", function () {
    if (busy) { if (canStop) stopped = true; return; }      // 正在写：按钮已经换成「停」了才停；刚点下去的头 400 毫秒里再点不算（免得连点两下把自己停掉）
    if (!model) return;
    if (!it) it = TBMLP.gen(model, { n: 1e6 });               // 同一个生成器接着写：前 n 个字节始终和金标准的前 n 个相同
    busy = true; stopped = false; canStop = false; t0 = performance.now(); btnText(T.writing);
    step(bytes.length + 200);
  });
  $("file").addEventListener("change", function () {
    var f = this.files && this.files[0];
    if (f) f.arrayBuffer().then(function (b) { load(b, f.name); });
  });

  if (!REG.sha) $("f-file").textContent = T.loading;      // 有登记值的页面，文件那一行本来就写着，不换成「正在读取」免得版面跳
  fetch(SRC).then(function (r) {
    if (!r.ok) throw new Error(r.status);
    return r.arrayBuffer();
  }).then(function (b) { load(b, "toy_bmlp.tbw1"); }, function () { $("f-file").textContent = T.missing; });
})();
