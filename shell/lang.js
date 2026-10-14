/* 全站统一语言（2026-10-14）：所有页面共用 localStorage 'nand-driver-lang'（'zh' | 'en'）。
   各应用页历史上各有自己的键（下面 OWN），打包产物里改不动，所以这里在页面脚本之前同步：
   1. 读：'nand-driver-lang' 没有就沿用任一旧键，再没有就按浏览器语言；然后把它写进所有旧键，页面照常读自己的键就是统一的语言；
   2. 写：页面切换语言（写旧键或统一键）时，同步其余各键，并发出 'nand-driver-lang' 事件（侧边栏据此即时换语言）。
   由 build_shell.py 以同步 <script> 插在每页 </head> 前（侧边栏外壳 shell.js 之前）。 */
(function () {
  var K = 'nand-driver-lang';
  var OWN = ['bench-lang', 'tapeid-lang', 'duck-language', 'c283lang', 'ncd2net.lang', 'tllm-lang'];
  var ls;
  try { ls = window.localStorage; ls.getItem(K); } catch (e) { return; }
  var ok = function (v) { return v === 'zh' || v === 'en'; };
  var set = Storage.prototype.setItem;
  var v = ls.getItem(K);
  if (!ok(v)) {
    for (var i = 0; i < OWN.length && !ok(v); i++) v = ls.getItem(OWN[i]);
    if (!ok(v)) v = /^zh/i.test(navigator.language || '') ? 'zh' : 'en';
    try { set.call(ls, K, v); } catch (e) {}
  }
  for (var j = 0; j < OWN.length; j++) { try { if (ls.getItem(OWN[j]) !== v) set.call(ls, OWN[j], v); } catch (e) {} }
  Storage.prototype.setItem = function (k, val) {
    set.call(this, k, val);
    if (this === ls && (k === K || OWN.indexOf(k) >= 0) && ok(val)) {
      try {
        if (k !== K) set.call(ls, K, val);
        for (var n = 0; n < OWN.length; n++) if (OWN[n] !== k) set.call(ls, OWN[n], val);
      } catch (e) {}
      try { window.dispatchEvent(new CustomEvent('nand-driver-lang', { detail: val })); } catch (e) {}   // 侧边栏 shell.js 跟着换
    }
  };
})();
