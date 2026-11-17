import { loadLock, chipManifest, checkedURL, checkedJSON, circuitInfo, stats, chainNote, okWord, lockState } from './verify.js';
import { Viewer } from './viewer.js';
import { G, chips, esc, where, plain, CONTAINER, descParts, waitTick } from './common.js';
import { mountRun, MODULES } from './run.js';
import { subPlain } from './subs_plain.js';
window.GALLERY_BOOTED = true;   // 脚本和依赖都加载到了（页面的看门狗看这个）

const $ = (id) => document.getElementById(id);
const tid = new URLSearchParams(location.search).get('tid') || '279.732';
const c = chips().find((x) => x.tid === tid);
const BUILD = '../app/build.html';
let man = null, pic = null, viewer = null, lock = null, fail = null;

// 「核对」那一块和「链上」里「电路」那一行：节点都是网页里先写好的，这里只原地换字，不删不重建。
// 一行可能写的几句话都叠在同一格里（看不见的那几句也占位置），所以换字不变高。
function reserve(el, variants) {
  for (const h of variants) { const s = document.createElement('span'); s.setAttribute('aria-hidden', 'true'); s.style.cssText = 'grid-area:1/1;visibility:hidden'; s.innerHTML = h.replace(/ id="[^"]*"/g, ''); el.append(s); }
}
function put(el, html, cls = '') { const s = el.firstElementChild; if (s.className !== cls) s.className = cls; if (el._html !== html) { s.innerHTML = html; el._html = html; } }
const SAY = {
  ok: (seen, total) => `<span class="ok">✓ 已核对：</span>看到的 ${seen} 个文件都和登记清单一致（这颗共 ${total} 张版图瓦片，看到哪张核哪张）。`,
  bad: (bad) => `<span class="bad">有 ${bad} 块版图没核对上，已经重试过一次，那几块画成灰底。</span>其余照常。可以 <button class="btn" id="retry">重试</button>，或者先看别的芯片。`,
  none: () => '这颗芯片的版图还没进登记清单，先不显示。',
  mismatch: (path) => `「${esc(path)}」和登记的不一样，已经重试过一次。这颗芯片先不显示，免得给你看错的图。可以刷新再试，或者先看别的芯片。`,
  net: () => '登记清单或版图下载不到，可能是网络问题。刷新再试一次。',
  container: () => `这是一个网站容器：电路只有 ${c.id === 1 ? 21 : 1} 个门，用来在链上放一个网站，所以没有单独出版图，也不借别的芯片的图冒充。${(c.links || [])[0] ? `<a href="${esc(c.links[0][1])}" target="_blank" rel="noopener">打开它放的网站：${esc(c.links[0][0])}</a>` : ''}`,
};
const CHAIN_OK = '<span class="ok">✓ 链上登记已核对：</span>这份登记清单和链上记的一致。';
function chainLine() {       // 登记清单读完（或读不到）之后叫：这一行一直在，写的是当前状态
  const ok = lockState().chain === 'ok';
  put($('checkchain'), ok ? CHAIN_OK : chainNote(), ok ? '' : 'warn');
}
function ciText(info) { return `${info[3].toLocaleString('zh-CN')} 个门，${info[0]} 个输入，${info[1]} 个输出${info[2] ? `，${info[2]} 位记忆` : ''}（两家节点一致）`; }
const CI_BUSY = '节点太忙，这次没读到。稍等一会儿再试。', CI_MISS = '这次没读到（要两家节点答案一致）。', CI_RETRY = '<button class="btn" id="ci-retry">换节点重试</button>';

function head() {
  if (!c) { $('name').textContent = '没有这颗芯片'; $('say').innerHTML = '编号不对，<a href="./">回到芯片列表</a>看看。'; $('check').hidden = true; return false; }
  document.title = `${c.name} · 21 NAND`;
  if ($('name').textContent !== plain(c).short) { $('here').textContent = `#${c.tid}`; $('name').textContent = plain(c).short; }   // 标题用中文短名；原名连同技术细节放下面小字
  // 先一句人话，再放细节（门数、训练方法、步数这些卡片上不写）
  const [sayText, detText] = descParts(c);       // 构建时已经写进网页的那两行（GALLERY_HEAD）出自同一个函数；一样就不动它
  if ($('say').textContent !== sayText) $('say').textContent = sayText;
  if ($('det').textContent !== detText) $('det').textContent = detText;
  const demo = (c.links || [])[0];
  if (demo && !MODULES[c.tid]) $('run').innerHTML = `<a class="btn primary" href="${esc(demo[1])}" target="_blank" rel="noopener">在新页面打开：${esc(demo[0])}</a>`;
  // 「照这个思路做一颗小芯片」：接到现有做电路页。做电路页现在只从小真值表起步（1–6 位输入，例子或自己填），
  // 不读地址参数，带不进一颗已上链的芯片；这里写清楚，不假装带上了。要真带上得改做电路页（它在 282.732 这批里），这里先不改
  if (c.chain) {
    $('run').insertAdjacentHTML('beforeend', `<a class="btn" id="fork" href="${BUILD}">照这个思路做一颗小芯片</a>`);
    $('forknote').hidden = false;
    $('forknote').textContent = '做电路页现在只能从小真值表做起，还不能导入这颗芯片。';
  }
  // 「跑一下」（run.js）：挂应用里已有的模块；纯组合电路按链上网表在本页算，可再让链上算一次比对。网站容器不放
  if (c.chain && !CONTAINER.has(c.tid)) {
    const box = document.createElement('section'); box.id = 'runbox'; box.className = 'runbox';
    $('forknote').after(box); mountRun(box, { ...c, cpu: c.cpu || '0x6Fb4089e7Cbaa9660Fd11056274Cbd8117EE5B38' }, G.chains, waitTick);
  }
  // 这一块可能写的话先都占好位置（这时标题下面那块还没亮出来）。链上那一行：此刻还没核，chainNote() 给的正是「这次没核对上链登记」那一句
  reserve($('checksay'), [SAY.ok(8888, 8888), SAY.bad(8888), SAY.none(), SAY.mismatch(`tiles/${tid}/8/88_88.webp`), SAY.net()].concat(CONTAINER.has(tid) ? [SAY.container()] : []));
  reserve($('checkchain'), [CHAIN_OK, chainNote()]);
  reserve($('allres'), [ALL.hint, ALL.none, '核对中… ' + ALL.wait(8888, 8888, '888.8'), ALL.slow(888) + ALL.bad(8888, 8888), ALL.ok(8888, 8888)]);      // 「都核一遍」那一行：等的时候、核完、没核成，哪一句都不让它变高
  $('check').addEventListener('click', (e) => {
    if (e.target.id === 'retry') { viewer.retryBad(); stats.bad = 0; report(); }
    if (e.target.id === 'all') checkAll();
  });
  return true;
}

function tabs() {
  const sel = (fn) => {
    $('tab-lay').setAttribute('aria-selected', String(!fn)); $('tab-fn').setAttribute('aria-selected', String(fn));
    $('pane-lay').hidden = fn; $('pane-fn').hidden = !fn;
    if (!fn) viewer?.draw();
  };
  $('tab-lay').onclick = () => sel(false); $('tab-fn').onclick = () => sel(true);
  return sel;
}

function report() {
  const total = man ? man.n : 0;
  const badge = $('badge');
  if (fail?.container) { badge.className = 'badge'; badge.textContent = '网站容器'; return; }
  if (fail) { badge.className = 'badge bad'; badge.textContent = '没核对上'; return; }
  const seen = stats.ok;
  badge.className = 'badge ' + (stats.bad ? 'warn' : 'ok');
  badge.textContent = stats.bad ? `${stats.bad} 张没对上` : `✓ ${okWord()}`;
  $('check').className = 'check' + (stats.bad ? ' err' : '');
  put($('checksay'), stats.bad ? SAY.bad(stats.bad) : SAY.ok(seen, total));
}

const ALL = {
  hint: '读到这颗的瓦片清单之后才能核。', none: '没有读到这颗的瓦片清单，没有可核的。',
  wait: (k, n, s) => `已核 ${k} / ${n} 张 · ${s} 秒`, slow: (s) => `等了 ${s} 秒没有回应：`,
  bad: (bad, ok) => `<span class="bad">${bad} 张没对上</span>，${ok} 张一致`, ok: (ok, n) => `<span class="ok">✓ ${ok} / ${n} 张全部一致</span>`,
};
let allBusy = false;
async function checkAll() {
  if (!man || allBusy) return;
  const out = $('allres'); let ok = 0, bad = 0;
  allBusy = true; $('all').setAttribute('aria-busy', 'true');
  put(out, '', 'dim'); out._html = null;      // 下面直接在看得见的那个 span 上走表，走完再用 put 写结果
  const w = waitTick(out.firstElementChild, '核对中…', (s) => ALL.wait(ok + bad, man.n, s));      // 每核完一张当场更新张数，秒数每 0.1 秒走一次；全核完才停
  const t0 = performance.now(); let slow = 0;
  try { await Promise.all([...man.rows].map(([p, row]) => checkedURL(p, row).then(() => ok++, (e) => { bad++; if (e && e.slow) slow++; }).then(w.draw))); } finally { w.stop(); }
  put(out, bad ? (slow ? ALL.slow(Math.round((performance.now() - t0) / 1000)) : '') + ALL.bad(bad, ok) : ALL.ok(ok, man.n));      // 等到超时才没取到的，前面带上等了多久
  allBusy = false; $('all').removeAttribute('aria-busy');
}

function subsystems() {
  const n = new Map(); for (const k of pic.components) n.set(k.sub, (n.get(k.sub) || 0) + 1);
  const list = pic.subsystems.filter((s) => n.get(s.id));
  // 每块先一句人话（点它在版图上高亮）；原名和技术说明折叠在「技术细节」里。没有人话的块直接用原名，不编
  $('subs').innerHTML = list.map((s) => { const say = subPlain(c.tid, s);
    return `<li><button aria-pressed="false" data-sub="${esc(s.id)}"><span class="dot" style="background:${esc(s.color)}"></span><span><b>${esc(say || s.name)}</b><span class="dim">版图上 ${n.get(s.id)} 个单元</span></span></button>
      <details class="tech"><summary>技术细节</summary><p><b>${esc(s.name)}</b>：${esc(s.desc)}</p></details></li>`; }).join('');
  $('subs').onclick = (e) => {
    const b = e.target.closest('button[data-sub]'); if (!b) return;
    const on = b.getAttribute('aria-pressed') !== 'true';
    for (const x of $('subs').querySelectorAll('button')) x.setAttribute('aria-pressed', 'false');
    b.setAttribute('aria-pressed', String(on));
    const s = pic.subsystems.find((x) => x.id === b.dataset.sub);
    viewer.highlight(on ? pic.components.filter((k) => k.sub === s.id).flatMap((k) => k.shapes) : [], s.color);
    if (on && matchMedia('(max-width: 899px)').matches) selTab(false);
  };
}

async function facts() {
  const rows = [['在哪', esc(where(c))]];
  if (c.ts) rows.push(['上链', new Date(c.ts * 1000).toLocaleDateString('zh-CN')]);
  $('facts').innerHTML = rows.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('') + '<dt>电路</dt><dd id="ci" style="display:grid"><span class="dim" style="grid-area:1/1">从链上读…</span></dd>';
  if (!c.chain) { put($('ci'), '不在链上', 'dim'); return; }
  reserve($('ci'), [CI_BUSY + CI_RETRY, CI_MISS + CI_RETRY, ciText([88, 88, 8888, 888888])]);      // 读到、没读到、节点忙，哪一句都不让这一行变高
  const read = async () => {
    put($('ci'), '从链上读…', 'dim');
    const info = await circuitInfo(G.chains[c.chain], c.cpu || '0x6Fb4089e7Cbaa9660Fd11056274Cbd8117EE5B38', c.id).catch((e) => (e && e.busy ? 'busy' : null));
    if (!info || info === 'busy') { put($('ci'), (info === 'busy' ? CI_BUSY : CI_MISS) + CI_RETRY, 'dim'); return; }
    put($('ci'), ciText(info), '');
  };
  $('ci').onclick = (e) => { if (e.target.id === 'ci-retry') { G.chains[c.chain].rpcs.push(G.chains[c.chain].rpcs.shift()); read(); } };
  read();
}

function tech() {
  const t = [];
  if (lock) t.push(`登记清单 gallery.lock.json：${lock.bytes.toLocaleString('zh-CN')} 字节，sha256 ${lock.sha256}`);
  if (man) t.push(`这颗的瓦片清单 tiles/${tid}/manifest.json：${man.n} 张瓦片，sha256 ${man.sha256}`);
  if (pic) t.push(`版图 ${pic.die?.[0] ?? ''} µm 见方，每微米 ${pic.ppu} 像素，${pic.image.levels} 级缩放；链上 ${pic.stats.gates} 个门全部布进版图，布线工具另加 ${pic.stats.phys} 个缓冲单元`);
  if (c?.imgCap) t.push(c.imgCap);
  $('tech').innerHTML = t.map((x) => `<p class="dim">${esc(x)}</p>`).join('');
}

const selTab = tabs();
// 缩放按钮：点了当场改右上角的倍数。版图还没读到时先把倍数记着，读到了照这个倍数画
let zq = 1;
const zshow = (r, fit = r === 1) => { const t = (Math.round(r * 10) / 10) + '×'; if ($('zlevel').textContent !== t) $('zlevel').textContent = t;
  if ($('zfit').getAttribute('aria-pressed') !== String(fit)) $('zfit').setAttribute('aria-pressed', String(fit)); };      // 已经是全图时「全图」是按下的样子；缩放或拖开就弹起
const zoomBy = (f) => { if (viewer) viewer.zoom(f); else if (!fail) { zq = Math.min(Math.max(zq * f, 0.5), 16); zshow(zq); } };
$('zin').onclick = () => zoomBy(1.6); $('zout').onclick = () => zoomBy(1 / 1.6); $('zfit').onclick = () => { if (viewer) viewer.fit(); else if (!fail) { zq = 1; zshow(1); } };

const known = head(); if (known) facts();
$('rest').style.visibility = '';       // 标题下面那块到这里才亮出来：上面几行已经把这颗芯片的说明、按钮、链上那几行同步填好
if (known) {
  try {
    lock = await loadLock(); chainLine();
    man = await chipManifest(tid);
    if (!man) throw Object.assign(new Error(), { kind: 'none' });
    const pr = lock.rows.get(`pic/${tid}.json`);
    pic = pr ? await checkedJSON(`pic/${tid}.json`, pr) : null;
    const im = pic ? pic.image : null;
    if (!im) throw Object.assign(new Error(), { kind: 'none' });
    viewer = new Viewer($('cv'), { tid, width: im.width, height: im.height, levels: im.levels, tile: im.tile, rows: man.rows, onTile: report, onView: zshow });
    if (zq !== 1) viewer.zoom(zq);      // 读到之前点过的缩放
    subsystems();
    $('all').textContent = `把 ${man.n} 张都核一遍`; $('all').disabled = false; put($('allres'), '', 'dim');
  } catch (e) {
    fail = e;
    chainLine();
    put($('allres'), ALL.none, 'dim');
    for (const b of ['zin', 'zout', 'zfit']) $(b).disabled = true; $('zlevel').textContent = '—'; $('zfit').setAttribute('aria-pressed', 'false');      // 没有版图可看：缩放按钮停用
    if (e.kind === 'none' && CONTAINER.has(tid)) { fail = { container: true }; put($('checksay'), SAY.container()); $('subs').innerHTML = '<li class="dim">网站容器没有功能块图。</li>'; }
    else { $('check').className = 'check err'; put($('checksay'), e.kind === 'none' ? SAY.none() : e.kind === 'mismatch' ? SAY.mismatch(e.path) : SAY.net(), 'bad'); $('subs').innerHTML = ''; }
  }
  tech(); report();
}
