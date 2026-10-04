/* 主站外壳：左侧导航（仿 tapeout.net）。由 build_shell.py 把 NAV 填好后拷进 dist_cf/shell/。
   页面只需 <link rel=stylesheet href="…/shell/shell.css"> 与 <script src="…/shell/shell.js" defer>；
   页面若自带顶栏和菜单按钮（概览页），在 <html> 上加 class="tk-own-bar"，手机上就不再画浮动按钮。 */
(function(){
  if (window.__tkShell) return; window.__tkShell = 1;
  const NAV = /*NAV*/[{"items": [{"zh": "概览", "en": "Overview", "href": "./", "icon": "grid"}]}, {"zh": "演示", "en": "Demos", "items": [{"zh": "21 门小车", "en": "21-gate car", "href": "arena.html", "icon": "car"}, {"zh": "门电路大脑", "en": "Gate brain", "href": "gate/", "icon": "brain"}, {"zh": "Pi 工作台", "en": "Pi Workbench", "href": "xlayer-bench/", "icon": "terminal"}, {"zh": "impossible LLM", "en": "impossible LLM", "href": "impossibleLLM/", "icon": "text"}, {"zh": "Microduck", "en": "Microduck", "href": "duck/brain.html", "icon": "duck"}, {"zh": "ncd2net", "en": "ncd2net", "href": "ncd2net/", "icon": "graph"}, {"zh": "电路 283", "en": "Circuit 283", "href": "agents-api/", "icon": "bot"}]}, {"zh": "你的电路", "en": "Your circuit", "items": [{"zh": "web2tape", "en": "web2tape", "href": "web2tape/", "icon": "globe"}, {"zh": "TapeID 发币", "en": "TapeID launch", "href": "tapeid/", "icon": "coin"}, {"zh": "TapeID · X Layer", "en": "TapeID · X Layer", "href": "tapeid/xlayer.html", "icon": "coin"}, {"zh": "TapeID 领取", "en": "TapeID claim", "href": "tapeid/claim.html", "icon": "coin"}, {"zh": "短链接", "en": "Short links", "href": "https://s.aihashrate.stream/", "icon": "link", "ext": 1}, {"zh": "身份验证器", "en": "Authenticator", "href": "https://288-732.aihashrate.stream/", "icon": "key", "ext": 1}]}, {"zh": "资料", "en": "Reference", "items": [{"zh": "竞技场规则", "en": "Arena rules", "href": "RULES.md", "icon": "book"}, {"zh": "Gas 账本", "en": "Gas ledger", "href": "gas/", "icon": "gauge"}, {"zh": "旧版工作台", "en": "Earlier workbench", "href": "nandtool/", "icon": "archive"}, {"zh": "MCP 接口", "en": "MCP server", "href": "https://mcp.aihashrate.stream/", "icon": "plug", "ext": 1}, {"zh": "全部页面", "en": "All pages", "href": "sites/", "icon": "list"}]}, {"zh": "链上站", "en": "On chain", "items": [{"zh": "282.732.tape", "en": "282.732.tape", "href": "https://282-732.aihashrate.stream/", "icon": "layers", "ext": 1}, {"zh": "1.2.245.tape", "en": "1.2.245.tape", "href": "https://1-2-245.aihashrate.stream/", "icon": "layers", "ext": 1}]}]/*END*/;
  const RPC = 'https://bsc-rpc.publicnode.com';
  const ICONS = {
    grid:'<rect x="3.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="13.5" width="7" height="7" rx="1.5"/>',
    car:'<path d="M5 16.5h14M6.5 16.5V12l2-4.5h7l2 4.5v4.5"/><path d="M5.5 12h13"/><circle cx="8" cy="17.5" r="1.6"/><circle cx="16" cy="17.5" r="1.6"/>',
    chip:'<rect x="6" y="6" width="12" height="12" rx="2"/><rect x="9.5" y="9.5" width="5" height="5" rx=".8"/><path d="M9 3v3M15 3v3M9 18v3M15 18v3M3 9h3M3 15h3M18 9h3M18 15h3"/>',
    terminal:'<rect x="3" y="4.5" width="18" height="15" rx="2"/><path d="M7 9.5l3 2.5-3 2.5M12.5 15h4.5"/>',
    text:'<path d="M4 6h16M4 10.5h16M4 15h10M4 19.5h7"/>',
    duck:'<circle cx="12" cy="12" r="8.5"/><path d="M15.5 8.5l-2 5-5 2 2-5z"/>',
    graph:'<circle cx="6" cy="6.5" r="2.2"/><circle cx="18" cy="6.5" r="2.2"/><circle cx="12" cy="18" r="2.2"/><path d="M8 7.5l3 8.5M16 7.5l-3 8.5M8.2 6.5h7.6"/>',
    bot:'<rect x="4.5" y="7.5" width="15" height="11" rx="2.5"/><path d="M12 4v3.5"/><circle cx="9.3" cy="13" r="1"/><circle cx="14.7" cy="13" r="1"/>',
    coin:'<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5v9M9.5 9.8c.5-1 1.4-1.5 2.6-1.5 1.5 0 2.4.8 2.4 1.8 0 2.6-5 1.4-5 4 0 1 1 1.9 2.6 1.9 1.2 0 2.1-.5 2.6-1.5"/>',
    globe:'<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c2.4 2.4 3.5 5.3 3.5 8.5s-1.1 6.1-3.5 8.5c-2.4-2.4-3.5-5.3-3.5-8.5S9.6 5.9 12 3.5z"/>',
    key:'<circle cx="8" cy="15" r="3.8"/><path d="M10.8 12.3L19 4.5M16 7.5l2.5 2.5M14 9.5l2 2"/>',
    link:'<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
    book:'<path d="M5 4.5h10.5a3 3 0 0 1 3 3v12H8a3 3 0 0 1-3-3z"/><path d="M5 16.5a3 3 0 0 1 3-3h10.5"/>',
    gauge:'<path d="M4.5 16a7.5 7.5 0 1 1 15 0"/><path d="M12 16l3.5-4.5"/><path d="M4.5 19.5h15"/>',
    plug:'<path d="M9 3.5v5M15 3.5v5M6.5 8.5h11V12a5.5 5.5 0 0 1-11 0z"/><path d="M12 17.5v3"/>',
    list:'<path d="M9 6h11M9 12h11M9 18h11"/><circle cx="4.8" cy="6" r=".9"/><circle cx="4.8" cy="12" r=".9"/><circle cx="4.8" cy="18" r=".9"/>',
    archive:'<rect x="3.5" y="4.5" width="17" height="4" rx="1"/><path d="M5 8.5v10a1.5 1.5 0 0 0 1.5 1.5h11a1.5 1.5 0 0 0 1.5-1.5v-10M10 12.5h4"/>',
    layers:'<path d="M12 3.5l8.5 4.5-8.5 4.5L3.5 8z"/><path d="M3.5 12.5l8.5 4.5 8.5-4.5"/><path d="M3.5 16.5L12 21l8.5-4.5"/>',
    brain:'<path d="M9 4.5a3 3 0 0 0-3 3 3 3 0 0 0-2 5.2A3 3 0 0 0 6.5 17a3 3 0 0 0 5.5 1.5V6a2.5 2.5 0 0 0-3-1.5z"/><path d="M15 4.5a3 3 0 0 1 3 3 3 3 0 0 1 2 5.2 3 3 0 0 1-2.5 4.3 3 3 0 0 1-5.5 1.5"/>',
    menu:'<path d="M4 7h16M4 12h16M4 17h16"/>',
    side:'<rect x="3.5" y="4.5" width="17" height="15" rx="2"/><path d="M9.5 4.5v15M15.5 10l-2 2 2 2"/>'
  };
  const svg = n => '<svg viewBox="0 0 24 24" aria-hidden="true">' + (ICONS[n] || ICONS.grid) + '</svg>';
  const esc = s => String(s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'})[c]);

  // 站点根：shell.js 自己在 <根>/shell/ 下，Cloudflare 与 Pages（/nand-driver/）都适用
  const me = document.currentScript || document.querySelector('script[src*="shell/shell.js"]');
  const ROOT = new URL('../', me ? me.src : location.href);
  const here = location.pathname.replace(/index\.html$/, '');
  const rel = ROOT.pathname;

  const store = {
    get(k){ try { return localStorage.getItem(k); } catch(e){ return null; } },
    set(k, v){ try { localStorage.setItem(k, v); } catch(e){} }
  };
  const docLang = () => /^en/i.test(document.documentElement.lang || '') ? 'en' : 'zh';
  let lang = docLang();

  function isOn(it){
    if (it.ext) return false;
    const p = new URL(it.href, ROOT).pathname.replace(/index\.html$/, '');
    if (p === rel) return here === rel;
    return here === p || (p.endsWith('/') && here.startsWith(p));
  }

  function render(){
    const t = o => esc(o[lang] || o.zh);
    let nav = '';
    for (const sec of NAV){
      if (sec.zh) nav += '<div class="tk-sec">' + t(sec) + '</div>';
      for (const it of sec.items){
        const href = it.ext ? it.href : new URL(it.href, ROOT).href;
        nav += '<a class="tk-item' + (isOn(it) ? ' on' : '') + '" href="' + esc(href) + '"' + (it.ext ? ' target="_blank" rel="noopener"' : '') +
          ' title="' + t(it) + '"><span class="tk-ic">' + svg(it.icon) + '</span><span class="tk-txt">' + t(it) + '</span>' +
          (it.ext ? '<span class="tk-ext">↗</span>' : '') + '</a>';
      }
    }
    side.innerHTML =
      '<a class="tk-brand" href="' + ROOT.href + '"><span class="tk-logo">21<b>N</b></span><span class="tk-brand-t">21 NAND<span class="tk-brand-s">aihashrate.stream</span></span></a>' +
      '<div class="tk-chain" title="BNB Chain"><span class="tk-dot"></span>BNB Chain<span class="tk-blk">' + (blk ? '#' + blk.toLocaleString('en-US') : '…') + '</span></div>' +
      '<nav class="tk-nav" aria-label="' + (lang === 'en' ? 'Site' : '站点导航') + '">' + nav + '</nav>' +
      '<div class="tk-foot"><button class="tk-collapse" type="button" title="' + (lang === 'en' ? 'Collapse sidebar' : '收起侧边栏') + '"><span class="tk-ic">' + svg('side') + '</span></button>' +
      '<button class="tk-lang" type="button">' + (lang === 'en' ? '中文 / <b>EN</b>' : '<b>中文</b> / EN') + '</button></div>';
    if (blk) side.querySelector('.tk-dot').classList.add('ok');
  }

  let blk = 0;
  async function tick(first){
    if (document.hidden && first !== true) return;
    try {
      const r = await fetch(RPC, {method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify({jsonrpc:'2.0', id:1, method:'eth_blockNumber', params:[]})});
      const j = await r.json(); blk = parseInt(j.result, 16) || blk;
    } catch(e){}
    const el = side.querySelector('.tk-blk');
    if (el && blk){ el.textContent = '#' + blk.toLocaleString('en-US'); side.querySelector('.tk-dot').classList.add('ok'); }
    document.dispatchEvent(new CustomEvent('tk-block', {detail: blk}));
  }

  const html = document.documentElement;
  const side = document.createElement('aside');
  side.className = 'tk-side'; side.id = 'tk-side';
  const fab = document.createElement('button');
  fab.className = 'tk-fab'; fab.type = 'button'; fab.innerHTML = svg('menu'); fab.setAttribute('aria-label', '菜单 / Menu');
  const scrim = document.createElement('div'); scrim.className = 'tk-scrim';

  function mount(){
    render();
    document.body.append(side, scrim, fab);
    html.classList.add('tk-on');
    if (store.get('tk-side') === 'rail') html.classList.add('tk-rail');
    side.addEventListener('click', e => {
      if (e.target.closest('.tk-collapse')){
        html.classList.toggle('tk-rail');
        store.set('tk-side', html.classList.contains('tk-rail') ? 'rail' : 'full');
        window.dispatchEvent(new Event('resize'));
      } else if (e.target.closest('.tk-lang')){
        // 各页都读 nand-driver-lang；有自己切换逻辑的页面刷新后会跟着换
        store.set('nand-driver-lang', lang === 'en' ? 'zh' : 'en');
        location.reload();
      } else if (e.target.closest('a')) html.classList.remove('tk-open');
    });
    fab.onclick = () => html.classList.add('tk-open');
    scrim.onclick = () => html.classList.remove('tk-open');
    document.addEventListener('tk-menu', () => html.classList.toggle('tk-open'));
    document.addEventListener('keydown', e => { if (e.key === 'Escape') html.classList.remove('tk-open'); });
    new MutationObserver(() => { const l = docLang(); if (l !== lang){ lang = l; render(); } })
      .observe(html, {attributes:true, attributeFilter:['lang']});
    // 侧边栏宽度改变了页面可用宽度，让画布类页面重新量一次
    window.dispatchEvent(new Event('resize'));
    tick(true); setInterval(tick, 15000);
    document.addEventListener('visibilitychange', tick);
  }
  if (document.body) mount(); else document.addEventListener('DOMContentLoaded', mount);
})();
