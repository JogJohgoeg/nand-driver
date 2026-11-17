/* 21 NAND 文档站：复制按钮、按系统分标签、⌘K 本地搜索（search-index.js）、手机上的目录开关、本页目录高亮。不连外部资源。 */
(function () {
  "use strict";
  var $ = function (s, el) { return (el || document).querySelector(s); };
  var $$ = function (s, el) { return Array.prototype.slice.call((el || document).querySelectorAll(s)); };
  var root = ($("link[href$='assets/docs.css']").getAttribute("href") || "").replace(/assets\/docs\.css$/, "");
  var EN = document.documentElement.lang === "en";

  // 站根图标：站点挂在子路径（GitHub Pages）时，浏览器默认去域名根取 /favicon.ico 会取不到。中文文档页的 HTML 不重传，所以在这里按站根补一个 link
  if (!$("link[rel~='icon']")) { var ico = document.createElement("link"); ico.rel = "icon"; ico.href = root + "favicon.ico"; document.head.appendChild(ico); }

  // 中英切换：有对应页才显示。站内路径 = 当前地址减去站根
  (function () {
    var base = new URL(root || "./", location.href).pathname, here = location.pathname.slice(base.length) || "index.html";
    if (/\/$/.test(here)) here += "index.html";
    var home = window.DOCS_HOME || "start/index.html", to = null;
    if (EN) to = here === "en/index.html" ? home : here.replace(/^en\//, "");
    else { var e = here === home ? "en/index.html" : "en/" + here; if ((window.DOCS_EN || []).indexOf(e) >= 0) to = e; }
    if (!to || $(".bar .langsw")) return;     // 新网页构建时已经把这个链接写进 HTML 了（运行时才插会把搜索框挤开）；只有老网页才在这里补
    var a = document.createElement("a");
    a.className = "langsw"; a.href = root + to; a.textContent = EN ? "中文" : "EN"; if (!EN) a.lang = "en";
    a.setAttribute("aria-label", EN ? "这页的中文版" : "This page in English");
    var s = $(".bar .search"); s.parentNode.insertBefore(a, s.nextSibling);
  })();

  // 复制
  $$(".code .copy").forEach(function (b) {
    b.addEventListener("click", function () {
      var t = b.closest(".code").querySelector("code").textContent;
      var done = function () { b.textContent = EN ? "Copied" : "已复制"; b.classList.add("ok"); setTimeout(function () { b.textContent = EN ? "Copy" : "复制"; b.classList.remove("ok"); }, 1500); };
      if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(t).then(done, fallback); else fallback();
      function fallback() { var a = document.createElement("textarea"); a.value = t; document.body.appendChild(a); a.select(); try { document.execCommand("copy"); done(); } catch (e) {} a.remove(); }
    });
  });

  // 标签：记住上次选的系统
  var KEY = "nand-docs-tab";
  function pick(box, name) {
    var bs = $$(".tab-bar button", box), ps = $$("[role=tabpanel]", box), k = bs.findIndex(function (b) { return b.textContent === name; });
    if (k < 0) return false;
    bs.forEach(function (b, i) { b.setAttribute("aria-selected", i === k ? "true" : "false"); ps[i].hidden = i !== k; });
    return true;
  }
  var saved; try { saved = localStorage.getItem(KEY); } catch (e) {}
  if (!saved) saved = /Mac/.test(navigator.platform) ? "macOS" : /Win/.test(navigator.platform) ? "Windows" : /Linux/.test(navigator.platform) ? "Linux" : "";
  $$(".tabs").forEach(function (box) {
    if (saved) pick(box, saved);
    $$(".tab-bar button", box).forEach(function (b) {
      b.addEventListener("click", function () { $$(".tabs").forEach(function (x) { pick(x, b.textContent); }); try { localStorage.setItem(KEY, b.textContent); } catch (e) {} });
    });
  });

  // 手机目录
  var menu = $(".menu"), side = $("#side");
  // 新网页里开合目录这一下已经写在按钮后面的一小段里（不等这个文件）；老网页没有那一段，照旧在这里挂
  if (menu && !menu.__inl) menu.addEventListener("click", function () { var o = side.classList.toggle("open"); menu.setAttribute("aria-expanded", o ? "true" : "false"); });

  // 本页目录高亮
  var links = $$(".toc a"), heads = links.map(function (a) { return document.getElementById(a.getAttribute("href").slice(1)); });
  if (links.length && "IntersectionObserver" in window) {
    var io = new IntersectionObserver(function () {
      var top = 0; heads.forEach(function (h, i) { if (h && h.getBoundingClientRect().top < 120) top = i; });
      links.forEach(function (a, i) { a.classList.toggle("on", i === top); });
    }, { rootMargin: "0px 0px -70% 0px" });
    heads.forEach(function (h) { if (h) io.observe(h); });
  }

  // 搜索
  var dlg = $(".sdlg"), input = $(".sbox input"), list = $(".sbox ul"), idx = window.DOCS_INDEX || [], sel = 0, hits = [];
  function open() { dlg.hidden = false; input.value = ""; draw(""); input.focus(); }
  function close() { dlg.hidden = true; }
  function score(p, q) {
    var t = p.t.toLowerCase(), s = 0;
    q.split(/\s+/).filter(Boolean).forEach(function (w) {
      if (t.indexOf(w) >= 0) s += 10; else if (p.h.join(" ").toLowerCase().indexOf(w) >= 0) s += 4; else if ((p.d + " " + p.x).toLowerCase().indexOf(w) >= 0) s += 1; else s -= 100;
    });
    return s;
  }
  function draw(q) {
    q = q.trim().toLowerCase();
    hits = (q ? idx.map(function (p) { return [score(p, q), p]; }).filter(function (x) { return x[0] > 0; }).sort(function (a, b) { return b[0] - a[0]; }).map(function (x) { return x[1]; }) : idx).slice(0, 12);
    sel = 0;
    list.innerHTML = "";
    if (!hits.length) { var li = document.createElement("li"); li.innerHTML = "<a><small>" + (EN ? "Nothing found" : "没有找到") + "</small></a>"; list.appendChild(li); return; }
    hits.forEach(function (p, i) {
      var li = document.createElement("li"), a = document.createElement("a"), b = document.createElement("b"), sm = document.createElement("small");
      a.href = root + p.u; b.textContent = p.t; sm.textContent = p.d; a.appendChild(b); a.appendChild(sm); li.appendChild(a);
      if (i === 0) li.className = "on";
      list.appendChild(li);
    });
  }
  function move(d) { var lis = $$("li", list); if (!hits.length) return; lis[sel].className = ""; sel = (sel + d + hits.length) % hits.length; lis[sel].className = "on"; lis[sel].scrollIntoView({ block: "nearest" }); }
  $(".search").addEventListener("click", open);
  input.addEventListener("input", function () { draw(input.value); });
  dlg.addEventListener("click", function (e) { if (e.target === dlg) close(); });
  document.addEventListener("keydown", function (e) {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); dlg.hidden ? open() : close(); return; }
    if (e.key === "/" && dlg.hidden && !/input|textarea/i.test(document.activeElement.tagName)) { e.preventDefault(); open(); return; }
    if (dlg.hidden) return;
    if (e.key === "Escape") close();
    else if (e.key === "ArrowDown") { e.preventDefault(); move(1); }
    else if (e.key === "ArrowUp") { e.preventDefault(); move(-1); }
    else if (e.key === "Enter" && hits[sel]) location.href = root + hits[sel].u;
  });
})();
