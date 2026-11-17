/* 21 NAND 应用外壳的加载器。
   规则只有一条：凡是下载的文件，不管来自网关还是直接读链，先算 sha256，和链上登记的（SiteRegistry.fileInfo）比，一样才用；不一样就不运行并提示。
   - 链上登记从 BSC 公共节点只读读取（eth_call，不用钱包）；至少两家节点给的大小和 sha256 一致才算数：满两家一致就往下走，晚到的那家照样比，对不上就收起已经打开的模块。
   - 来源顺序：同源网关（打开外壳的那个）→ 直接读链（SiteRegistry.readRange，每次 96 KB）。每个来源拿到的字节都过同一道 sha256。
   - 自测（mode: "fake"）：登记改读本地 fake-chain.json，页面上写明；「自己核对」工具照样读 BSC。
   - 模块放进 sandbox="allow-scripts allow-downloads" 的 iframe（没有 allow-same-origin）：碰不到外壳的存储和页面。外壳和模块都不碰浏览器钱包（构建时有扫描规则拦着）。
   - 中英两种文字：选择存在 localStorage「lang」，入口页、外壳、做电路页共用；模块从外壳注入的 <meta name="app-lang"> 读。
   - 不连外部 CDN、不用外部字体。 */
(function () {
  "use strict";
  var CFG = window.APP_CONFIG;
  var $ = function (s) { return document.querySelector(s); };

  // ---------- 语言 ----------
  var LANG = "zh";
  try { if (localStorage.getItem("lang") === "en") LANG = "en"; } catch (e) {}
  var EN = LANG === "en";
  var T = {
    net: ["连不上区块链节点，暂时没法核对。请检查网络后点「重试」；一直不行就过几分钟再试，公共节点有时会忙。",
      "Can't reach the blockchain nodes, so nothing could be checked. Check your connection and tap Retry. If it keeps failing, try again in a few minutes; public nodes are sometimes busy."],
    disagree: ["几家区块链节点给的记录不一样，为了安全先不运行。点「重试」会换一家节点重新查。",
      "The blockchain nodes gave different records, so this module was not started. Retry asks a different node first."],
    missing: ["链上没有找到这个文件。如果路径是你输入的，检查一下有没有拼错。",
      "This file isn't recorded on chain. If you typed the path, check the spelling."],
    mismatch: ["下载到的文件和链上记录对不上，为了安全没有运行。可能是网站缓存还没更新，点「重试」；还不行就换个时间再来。",
      "The downloaded file doesn't match the on-chain record, so it was not run. The site cache may be stale: tap Retry, or come back later."],
    gateway: ["网关", "gateway"], chain: ["直接读链", "direct chain read"],
    open: ["打开", "Open"], checking: ["正在核对…", "Checking…"],
    slow: ["网络有点慢，还在下载和核对（{d}/{n}，已等 {s} 秒）…", "Slow network, still downloading and checking ({d}/{n}, {s}s so far)…"],
    okAll: ["已核对 ✓ {n} 个文件都和链上记录一致", "Verified ✓ all {n} files match the on-chain record"],
    okMix: ["已核对 ✓ {n} 个文件：{c} 个和链上记录一致，{p} 个和这批待上链的发布清单一致（本机样板）", "Verified ✓ {n} files: {c} match the on-chain record, {p} match the pending release list (local preview)"],
    failed: ["没通过核对（点开看细节）", "Check failed (open for details)"],
    listFailed: ["模块清单没通过核对", "The module list failed its check"],
    waitAway: ["核对好了。刚才点的「{m}」没有自动打开（那时这一页不在前台），再点一下就开。", "The check passed. \u201c{m}\u201d was not opened automatically because this page was in the background. Tap it again to open."],
    waitGone: ["核对好了，但核对过的模块清单里没有刚才点的「{m}」，所以没有打开。", "The check passed, but \u201c{m}\u201d is not in the checked module list, so it was not opened."],
    waitFail: ["所以刚才点的「{m}」没有打开。", "So \u201c{m}\u201d was not opened."],
    pendingNote: ["（这批待上链：按发布清单核）", " (pending release: checked against the list)"],
    badLog: ["不一致（{s}）：登记 {rh}… {rs} B，拿到 {gh}… {gs} B", "mismatch ({s}): recorded {rh}… {rs} B, got {gh}… {gs} B"],
    warnLog: ["{s}读不到（{e}）", "{s} unavailable ({e})"], nextSrc: ["，换下一个来源", "; trying the next source"],
    detail: ["细节", "details"],
    vOk: ["✓ 和链上记录一致，这个文件没被改过", "✓ Matches the on-chain record. This file has not been altered."],
    vPend: ["✓ 和这批待上链的发布清单一致（本机样板：发布后链上会登记成这一份）", "✓ Matches the pending release list (local preview; this is what will be recorded on chain)"],
    vBad: ["✗ 和链上记录不一致。可能被改过，也可能是网站缓存还没更新。过一会儿再核一次。", "✗ Doesn't match the on-chain record. It may have been altered, or the site cache is stale. Check again in a while."],
    vDl: ["下载这个文件失败（{e}）。检查路径和网络后再点一次。", "Couldn't download this file ({e}). Check the path and your connection, then try again."],
    vRetry: ["再点一次「核对」", "tap Check again"], retryWord: ["点「重试」", "tap Retry"],
    vRec: ["链上登记", "on-chain"], vList: ["发布清单", "release list"], vGot: ["下载算出", "downloaded"],
    modeFake: ["自测：核对用本地假链", "Self-test: local fake chain"], modeLocal: ["本机样板：链上记录 + 这批待上链的清单", "Local preview: chain + pending list"], modeChain: ["和链上记录核对", "Checked against the chain"]
  };
  function t(k, v) { var s = T[k][EN ? 1 : 0]; if (v) Object.keys(v).forEach(function (x) { s = s.split("{" + x + "}").join(v[x]); }); return s; }
  function pick(m, k) { return (EN && m[k + "_en"]) || m[k] || ""; }
  document.documentElement.lang = EN ? "en" : "zh-CN";
  Array.prototype.forEach.call(document.querySelectorAll("[data-en]"), function (e) { if (EN) { e.dataset.zh = e.textContent; e.textContent = e.dataset.en; } });
  Array.prototype.forEach.call(document.querySelectorAll("[data-en-attr]"), function (e) { var p = e.dataset.enAttr.split("|"); if (EN) e.setAttribute(p[0], p[1]); });
  var langBtn = $("#lang");
  if (langBtn) { langBtn.textContent = EN ? "中文" : "EN"; langBtn.addEventListener("click", function () { try { localStorage.setItem("lang", EN ? "zh" : "en"); } catch (e) {} location.reload(); }); }
  var LOCAL = /^(127\.0\.0\.1|localhost|\[::1\])$/.test(location.hostname);
  var modeEl = $("#mode");
  if (modeEl) modeEl.textContent = CFG.mode !== "chain" ? t("modeFake") : LOCAL ? t("modeLocal") : t("modeChain");

  // ---------- sha256（WebCrypto） ----------
  function hex(buf) { return Array.prototype.map.call(new Uint8Array(buf), function (b) { return (b < 16 ? "0" : "") + b.toString(16); }).join(""); }
  function sha256(bytes) { return crypto.subtle.digest("SHA-256", bytes).then(hex); }

  // ---------- ABI ----------
  var SEL = { fileInfo: "6c609107", readRange: "15a4cae2" };   // fileInfo(address,string) / readRange(address,string,uint256,uint256)
  function word(n) { var h = n.toString(16); return "0".repeat(64 - h.length) + h; }
  function addr(a) { return "0".repeat(24) + a.slice(2).toLowerCase(); }
  function str(s) { var b = new TextEncoder().encode(s), h = hex(b); return word(b.length) + h + "0".repeat((64 - h.length % 64) % 64); }
  // 出错说人话（产品原则 5）：说清出了什么事、下一步怎么做
  function fail(kind, detail) { return Object.assign(new Error(t(kind)), { kind: kind, detail: detail || "" }); }
  var rpcOff = 0;   // 「重试」时换一家节点打头
  function rpcs() { return CFG.rpcs.slice(rpcOff).concat(CFG.rpcs.slice(0, rpcOff)); }
  function rpc(url, data) {
    var ac = typeof AbortController === "function" ? new AbortController() : null, tm = ac && setTimeout(function () { ac.abort(); }, 15000);
    return fetch(url, { signal: ac ? ac.signal : undefined, method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_call", params: [{ to: CFG.registry, data: data }, "latest"] }) })
      .then(function (r) { return r.json(); }).then(function (j) { clearTimeout(tm); if (!j.result) throw new Error((j.error && j.error.message) || "no result"); return j.result; },
        function (e) { clearTimeout(tm); throw e; });
  }
  // fileInfo → (uint32 size, string type, bytes32 sha256, uint40 updatedAt, uint256 chunks)
  // 同一个查询同时发给每一家节点。答案一致的满两家就往下走，不等最慢的那家；头两家不一样当场报；有一家读不到就等剩下的。
  // 晚到的那一家照样比：和已经采用的不一样，就叫 lateBad（界面那边把已经打开的模块收起来，照「记录不一样」报）。
  var lateBad = null;
  function chainInfo(path) {
    var data = "0x" + SEL.fileInfo + addr(CFG.container) + word(64) + str(path), us = rpcs();
    return new Promise(function (resolve, reject) {
      var ok = [], errs = [], left = us.length, used = null, over = false;
      function same(x, y) { return x.sha256 === y.sha256 && x.size === y.size; }
      us.forEach(function (u) {
        rpc(u, data).then(function (res) { var w = function (i) { return res.slice(2 + 64 * i, 2 + 64 * (i + 1)); };
          return { size: parseInt(w(0), 16), sha256: w(2), chunks: parseInt(w(4), 16) }; }).then(function (r) {
          left--;
          if (over) { if (used && !same(r, used) && lateBad) lateBad(path); return; }
          ok.push(r);
          if (ok.length < 2) { if (!left) { over = true; reject(fail("net", errs.concat("ok").join("; "))); } return; }
          over = true;
          if (!same(ok[0], ok[1])) return reject(fail("disagree"));
          if (!ok[0].chunks) return reject(fail("missing", path));
          used = ok[0]; resolve(used);
        }, function (e) {
          left--; errs.push(u + ": " + e.message);
          if (!over && !left) { over = true; reject(fail("net", errs.concat(ok.length ? "ok" : []).join("; "))); }
        });
      });
    });
  }
  // 直接读链：readRange，offset 和 len 都是 24,000 的倍数（最后一段除外），每次 96 KB
  function readChain(path, size) {
    var out = new Uint8Array(size), off = 0, STEP = 96000;
    function next() {
      if (off >= size) return Promise.resolve(out.buffer);
      var len = Math.min(STEP, size - off);
      return rpc(rpcs()[0], "0x" + SEL.readRange + addr(CFG.container) + word(128) + word(off) + word(len) + str(path)).then(function (res) {
        var h = res.slice(2), n = parseInt(h.slice(64, 128), 16), d = h.slice(128, 128 + 2 * n);
        for (var i = 0; i < n; i++) out[off + i] = parseInt(d.substr(2 * i, 2), 16);
        if (!n) throw new Error("0 bytes");
        off += n; return next();
      });
    }
    return next();
  }
  var fake = null;
  function fakeInfo(path) {
    return (fake || (fake = fetch(CFG.fakeChain).then(function (r) { return r.json(); }))).then(function (f) {
      var e = f.files[path]; if (!e) throw fail("missing", "(fake chain) " + path);
      return { size: e.size, sha256: e.sha256 };
    });
  }
  // 本机样板（127.0.0.1 / localhost）：这批还没上链的文件，按发布清单 pending.json 核（publish_282.py 的「新增 / 改动」行）。
  // 只在本机读，正式网址上不读（网关伪造不了浏览器地址栏里的主机名）
  var pend = null;
  function pendingInfo(path) {
    if (!LOCAL || CFG.mode !== "chain") return Promise.resolve(null);
    return (pend || (pend = fetch(CFG.root + "pending.json", { cache: "no-store" }).then(function (r) { return r.ok ? r.json() : {}; }, function () { return {}; })
      .then(function (j) { return (j && j.files) || {}; }))).then(function (f) { return f[path] || null; });
  }
  function registered(path) {
    if (CFG.mode !== "chain") return fakeInfo(path);
    return pendingInfo(path).then(function (p) {
      if (!p) return chainInfo(path);
      var mark = { size: p.size, sha256: p.sha256, pending: true };
      return chainInfo(path).then(function (reg) { return reg.sha256 === p.sha256 && reg.size === p.size ? reg : mark; },
        function (e) { if (e.kind === "missing") return mark; throw e; });
    });
  }

  // ---------- 下载并核对 ----------
  function fetchVerified(path, log) {
    return registered(path).then(function (reg) {
      var srcs = [{ name: t("gateway"), get: function () { return fetch(CFG.root + path, { cache: "no-store" }).then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.arrayBuffer(); }); } }];
      if (CFG.mode === "chain" && !reg.pending) srcs.push({ name: t("chain"), get: function () { return readChain(path, reg.size); } });
      var i = 0, last = "";
      function next() {
        if (i >= srcs.length) throw Object.assign(fail(last === "sha" ? "mismatch" : "net", last), { path: path });
        var s = srcs[i++];
        return s.get().then(function (buf) {
          return sha256(buf).then(function (h) {
            if (h !== reg.sha256 || buf.byteLength !== reg.size) {
              log(path, "bad", t("badLog", { s: s.name, rh: reg.sha256.slice(0, 12), rs: reg.size, gh: h.slice(0, 12), gs: buf.byteLength }));
              last = "sha"; return next();
            }
            log(path, "ok", h.slice(0, 12) + "… · " + buf.byteLength.toLocaleString() + " B" + (i === 1 ? "" : " (" + s.name + ")") + (reg.pending ? t("pendingNote") : ""));
            buf.pending = !!reg.pending;
            return buf;
          });
        }, function (e) { last = s.name + " " + e.message; log(path, "warn", t("warnLog", { s: s.name, e: e.message }) + (i < srcs.length ? t("nextSrc") : "")); return next(); });
      }
      return next();
    });
  }

  // ---------- 拼模块：全部文件核对通过后，拼成一份 srcdoc 放进沙箱 iframe ----------
  function b64(buf) { var s = "", u = new Uint8Array(buf); for (var i = 0; i < u.length; i += 32768) s += String.fromCharCode.apply(null, u.subarray(i, i + 32768)); return btoa(s); }
  function files(mod) { return mod.files.map(function (f) { return typeof f === "string" ? { path: f, as: f.replace(/^.*\//, "") } : f; }); }
  function assemble(mod, bytes) {
    var dec = new TextDecoder(), fs = files(mod), html = dec.decode(bytes[mod.entry]);
    fs.forEach(function (f) {
      if (f.path === mod.entry) return;
      var esc = f.as.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      if (/\.js$/.test(f.as)) {
        html = html.replace(new RegExp('<script([^>]*?)\\ssrc="' + esc + '"([^>]*)></script>'), function (_, a, b) {
          return "<script" + a + b + ">" + dec.decode(bytes[f.path]).replace(/<\/script/gi, "<\\/script") + "</script>";
        });
      } else {
        var url = "data:" + (/\.woff2$/.test(f.as) ? "font/woff2" : "application/octet-stream") + ";base64," + b64(bytes[f.path]);
        html = html.replace(new RegExp('(data-model|src|href)="' + esc + '"', "g"), '$1="' + url + '"');
        html = html.split("url(" + f.as + ")").join("url(" + url + ")");   // 模块的 @font-face 用核对过的字体文件
      }
    });
    var csp = '<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; script-src \'unsafe-inline\' blob:; worker-src blob:; style-src \'unsafe-inline\'; img-src data: blob:; font-src data:; connect-src data: ' + (mod.connect || []).join(" ") + '">';
    return html.replace(/<head>/i, "<head>" + csp + '<meta name="app-lang" content="' + LANG + '">');
  }

  // ---------- 界面 ----------
  var home = $("#home"), cards = $("#home-cards"), list = $("#mods"), title = $("#m-title"), desc = $("#m-desc"), logEl = $("#m-log"), frame = $("#m-frame"), stop = $("#m-stop"), tool = $("#m-tool"), link = $("#m-link");
  var chk = $("#m-chk"), sum = $("#m-sum"), stopT = $("#m-stop-t"), retry = $("#m-retry"), current = null, timer = null;
  function showStop(e) {   // 人话在前；技术细节（哪个文件、哪家节点）收进「已核对」那一栏
    stop.hidden = false; stopT.textContent = e.message;
    if (e.path || e.detail) log(e.path || t("detail"), "bad", e.detail || "");
  }
  lateBad = function (path) {   // 晚到的那家节点和前两家不一样：已经打开的收起来，不再运行
    clearInterval(timer); current = null; frame.hidden = true; frame.removeAttribute("srcdoc"); home.hidden = true;
    chk.hidden = false; sum.textContent = t("failed"); chk.className = "chk bad"; showStop(Object.assign(fail("disagree"), { path: path }));
  };
  function log(path, kind, msg) {
    var li = document.createElement("li"); li.className = kind;
    li.innerHTML = '<span class="k">' + (kind === "ok" ? "✓" : kind === "bad" ? "✗" : "…") + '</span><code></code> <span class="msg"></span>';
    li.querySelector("code").textContent = path; li.querySelector(".msg").textContent = msg;
    logEl.appendChild(li);
  }
  function open(mod) {
    Array.prototype.forEach.call(list.querySelectorAll("button"), function (b) { b.setAttribute("aria-current", b.dataset.id === mod.id ? "page" : "false"); });
    current = mod; clearInterval(timer);
    home.hidden = true; title.hidden = false; desc.hidden = false; chk.hidden = true; chk.open = false;
    title.textContent = pick(mod, "title"); desc.textContent = pick(mod, "desc"); logEl.innerHTML = ""; frame.hidden = true; frame.removeAttribute("srcdoc"); stop.hidden = true; tool.hidden = true; link.hidden = true;
    try { history.replaceState(null, "", "#" + mod.id); } catch (e) {}
    if (mod.type === "link") {
      var ext = /^https?:/.test(mod.href), target = pick(mod, "href");
      link.hidden = false; link.href = ext ? mod.href : CFG.root + target; link.textContent = (pick(mod, "button") || t("open")) + (ext ? " ↗" : "");
      if (ext) { link.target = "_blank"; link.rel = "noopener"; } else { link.removeAttribute("target"); }
      return;
    }
    if (mod.type === "tool") { tool.hidden = false; return; }
    if (mod.type === "page") { location.href = CFG.root + mod.href; return; }   // 做电路：单独的顶层页（唯一连钱包），它自己和链上记录核对
    // 核对在后台（产品原则 2）：界面上只有一行「正在核对 / 已核对 ✓」，点开才看每个文件的 sha256
    var bytes = {}, fs = files(mod), done = 0, t0 = Date.now();
    chk.hidden = false; sum.textContent = t("checking"); chk.className = "chk";
    timer = setInterval(function () {
      var s = Math.round((Date.now() - t0) / 1000);
      if (s >= 8) sum.textContent = t("slow", { d: done, n: fs.length, s: s });
    }, 1000);
    var me = mod;
    fs.reduce(function (p, f) { return p.then(function () { return fetchVerified(f.path, log).then(function (b) { bytes[f.path] = b; done++; }); }); }, Promise.resolve())
      .then(function () {
        if (current !== me) return;
        var np = fs.filter(function (f) { return bytes[f.path].pending; }).length;
        clearInterval(timer); chk.className = "chk ok";
        sum.textContent = np ? t("okMix", { n: fs.length, c: fs.length - np, p: np }) : t("okAll", { n: fs.length });
        frame.srcdoc = assemble(mod, bytes); frame.hidden = false;
      }, function (e) {
        if (current !== me) return;
        clearInterval(timer); sum.textContent = t("failed"); chk.className = "chk bad"; showStop(e);
      });
  }
  fetchVerified(CFG.modules, function () {}).then(function (buf) {
    var mods = JSON.parse(new TextDecoder().decode(buf)).modules;
    // 网页里先写好的那一批按钮原地留用（同一个节点），只把字对成核对过的清单里的；清单里没有的拿掉，缺的补上。
    // 不整列删了重建：重建的那一瞬间按钮不在页面上，正好按下去的那一次点击会丢（TM 11-14 实测 21 遍里有 5 遍）。
    function put(el, sel, text) { var x = sel ? el.querySelector(sel) : el; if (x.textContent !== text) x.textContent = text; }
    function place(box, i, el) { if (box.children[i] !== el) box.insertBefore(el, box.children[i] || null); }
    function keep(box, m) {            // 找这一个模块先写好的按钮：有 data-id 的按 data-id，没有的按标题
      var title = pick(m, "title");
      return Array.prototype.filter.call(box.children, function (x) { var st = x.querySelector("strong"); return x.dataset.id ? x.dataset.id === m.id : st && (st.textContent === title || st.dataset.zh === m.title); })[0];
    }
    var ni = 0, ci = 0;
    mods.forEach(function (m) {
      var b = keep(list, m);
      if (!b) { b = document.createElement("button"); b.type = "button"; b.innerHTML = "<strong></strong><span></span>"; }
      b.disabled = false; b.dataset.id = m.id; put(b, "strong", pick(m, "title")); put(b, "span", pick(m, "tag"));
      b.addEventListener("click", function () { open(m); });
      place(list, ni++, b);
      if (!m.n) return;                      // 首页卡片：编号、标题、一句话、实测数字（数字同入口页）
      var c = keep(cards, m);
      if (!c) { c = document.createElement("button"); c.type = "button"; c.className = "card"; c.innerHTML = '<span class="n"></span><strong></strong><span class="d"></span><span class="st"><b></b><span></span></span><span class="go2"></span>'; }
      c.disabled = false; c.dataset.id = m.id; put(c, ".n", String(m.n)); put(c, "strong", pick(m, "title"));
      put(c, ".d", pick(m, "desc")); put(c, ".st b", pick(m, "stat")); put(c, ".st span", pick(m, "label"));
      put(c, ".go2", (pick(m, "button") || t("open")) + " →");
      c.addEventListener("click", function () { open(m); });
      place(cards, ci++, c);
    });
    while (list.children.length > ni) list.removeChild(list.lastChild);
    while (cards.children.length > ci) cards.removeChild(cards.lastChild);
    // 清单还在核对时用户点过哪个模块（网页里那一小段脚本只记了名字）：现在清单核对过了，从核对过的清单里找到它再打开。
    // 以最后一次点击为准，压过地址栏里的 #模块名；页面不在前台就不在背后跳；名字在核对过的清单里找不到就不打开。
    var W = window.__appWait || {}, asked = W.el ? { id: W.id, zh: W.zh, title: W.title } : null, note = $("#home-note");
    if (W.clear) W.clear(); W.done = true;
    var want = location.hash.slice(1), m = mods.filter(function (x) { return x.id === want; })[0];
    if (asked) {
      var hit = mods.filter(function (x) { return asked.id ? x.id === asked.id : x.title === asked.zh; })[0];
      if (!hit) { note.textContent = t("waitGone", { m: asked.title }); note.hidden = false; }
      else if (document.visibilityState && document.visibilityState !== "visible") { note.textContent = t("waitAway", { m: pick(hit, "title") }); note.hidden = false; }
      else m = hit;
    }
    if (m) open(m);
    window.addEventListener("hashchange", function () {   // 地址栏只改了 #模块名（同一页面）也打开对应模块
      var w = location.hash.slice(1), x = mods.filter(function (y) { return y.id === w; })[0];
      if (x && x !== current) open(x);
    });
  }, function (e) {
    var W = window.__appWait || {}, asked = W.el ? W.title : null;       // 清单没通过核对：记住的点击清掉，不打开，并说明
    if (W.clear) W.clear(); W.done = true;
    Array.prototype.forEach.call(list.querySelectorAll("button"), function (b) { b.disabled = true; });      // 清单没核对过，这些按钮开不了任何东西：照实禁用，原因写在下面的提示里
    home.hidden = true; chk.hidden = false; sum.textContent = t("listFailed"); chk.className = "chk bad"; current = null; showStop(e);
    if (asked) stopT.textContent += " " + t("waitFail", { m: asked });
  });
  retry.addEventListener("click", function () { rpcOff = (rpcOff + 1) % CFG.rpcs.length; if (current) open(current); else location.reload(); });

  // 自己核对：输入路径，读链上登记（总是读真链），下载同源那份自己算
  var form = $("#v-form");
  if (form) form.addEventListener("submit", function (ev) {
    ev.preventDefault();
    var p = $("#v-path").value.trim().replace(/^\/+/, ""), out = $("#v-out"), res = $("#v-res");
    if (!p) return;
    res.textContent = t("checking"); res.className = "res"; out.textContent = "";
    var m = CFG.mode; CFG.mode = "chain";
    var got = registered(p); CFG.mode = m;
    got.then(function (reg) {
      return fetch(CFG.root + p, { cache: "no-store" }).then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.arrayBuffer(); }).then(function (buf) {
        return sha256(buf).then(function (h) {
          var same = h === reg.sha256 && buf.byteLength === reg.size;
          res.className = same ? "res ok" : "res bad";
          res.textContent = same ? (reg.pending ? t("vPend") : t("vOk")) : t("vBad");
          out.textContent = (reg.pending ? t("vList") : t("vRec")) + "  " + reg.sha256 + "  " + reg.size + " B\n" + t("vGot") + "  " + h + "  " + buf.byteLength + " B";
        });
      });
    }).catch(function (e) { res.className = "res bad"; res.textContent = e.kind ? e.message.replace(t("retryWord"), t("vRetry")).replace("tap Retry", "tap Check again") : t("vDl", { e: e.message }); out.textContent = e.detail || ""; });
  });
})();
