import { loadLock, checkedURL, circuitInfo, stats, chainNote, okWord } from './verify.js';
import { G, chips, where, layoutPath, esc, CONTAINER, plain, GATES, SHELVES, chainShelves, shelfItems, catName, openness } from './common.js';
// 首页的分类和卡片内容构建时就全知道，所以构建时用下面同一批函数写进网页（prerender.mjs 调 prerender()），
// 浏览器里不再后填——后填会把已经画出来的页脚和核对说明推走几千像素。PRE = 在构建里跑（没有页面）。
const PRE = typeof document === 'undefined';
if (!PRE) window.GALLERY_BOOTED = true;   // 脚本和依赖都加载到了（页面的看门狗看这个）

// 顶部搜索 + 分类标签；首页按「架子」分区，每区一行横滑卡片；搜索、标签、「看全部」进结果页（同一页，地址栏 # 记状态）
const $ = (id) => document.getElementById(id);
const all = chips();
const CHAINS = chainShelves(all);
const gates = { ...GATES };                    // 先用已知门数，链上读到了就换成链上的
let lock = null, lockErr = null;

function thumb(c) {
  const p = layoutPath(c);
  const msg = CONTAINER.has(c.tid) ? '网站容器，没有单独版图' : !p ? '版图排队中' : '核对中…';
  // 这句话的节点铺满整格（格子的大小由宽高比定死）：之后图取不到、不在登记清单里，都在这同一个节点里换字，大小不变
  return `<div class="thumb" data-img="${p ? esc(p) : ''}"><span class="msg" style="place-self:stretch;display:grid;place-items:center">${msg}</span></div>`;
}
const meta = (c) => (gates[c.tid] != null ? `${gates[c.tid].toLocaleString('zh-CN')} 门 · ` : '') + where(c);

function card(c) {
  const detail = c.chain && !CONTAINER.has(c.tid) && layoutPath(c) ? `chip.html?tid=${encodeURIComponent(c.tid)}` : null;
  const demo = (c.links || [])[0], P = plain(c);
  const btns = [detail ? `<a class="btn primary" href="${detail}">看版图</a>` : '',
    demo ? `<a class="btn" href="${esc(demo[1])}" target="_blank" rel="noopener" title="${esc(demo[0])}">${esc(P.go || '看演示')}</a>` : ''].filter(Boolean);
  return `<article class="card" data-tid="${esc(c.tid)}">
    ${detail ? `<a class="pic" href="${detail}" aria-label="${esc(c.name)} 的版图">${thumb(c)}</a>` : `<div class="pic off" aria-disabled="true">${thumb(c)}</div>`}
    <div class="body">
      <strong>${esc(P.short)}</strong>
      <p class="say">${esc(P.say)}</p>
      <span class="meta" data-meta>${esc(meta(c))}</span>
      ${openness(c) ? `<span class="open${openness(c).includes('可以') ? ' lic' : ''}">${esc(openness(c))}</span>` : ''}
      <div class="btns">${btns.join('') || '<span class="dim nobtn">只有图，没有演示</span>'}</div>
    </div></article>`;
}

function shelf(s, h = 'h2') {
  const xs = shelfItems(s, all), row = s.limit ? xs.slice(0, s.limit) : xs;
  return `<section class="shelf" id="sh-${s.id}">
    <div class="sec"><${h}>${esc(s.name)}</${h}><a class="more" href="#shelf=${s.id}">看全部 ${xs.length} 个 →</a></div>
    <p class="note">${esc(s.say)}</p>
    <div class="rail" role="region" tabindex="0" aria-label="${esc(s.name)}，左右滑">${row.map(card).join('')}</div></section>`;
}

const homeHTML = () => SHELVES.map((s) => shelf(s)).join('') +
    `<section class="shelf group"><div class="sec"><h2>按链看</h2></div><p class="note">我们的电路在两条链上：${CHAINS.map((s) => `${esc(s.name)} ${shelfItems(s, all).length} 颗`).join('、')}。</p></section>` +
    CHAINS.map((s) => shelf({ ...s, name: `${s.name}（${shelfItems(s, all).length} 颗）` }, 'h3')).join('');

const onChain = all.filter((c) => c.chain).length;
const placeholderText = () => `搜 ${all.length} 颗芯片和板子`;
const totalText = () => `${all.length} 项 = 链上电路 ${onChain} 个 + 不上链的版图和板子 ${all.length - onChain} 个`;
const tagsHTML = () => `<a class="tag" href="#" data-cat="">全部（${all.length} 个）</a>` +
    G.cats.map((k) => [k, all.filter((c) => (c.cats || []).includes(k.id)).length]).filter(([, n]) => n)
      .map(([k, n]) => `<a class="tag" href="#cat=${k.id}" data-cat="${k.id}">${esc(catName(k))}（${n} 个）</a>`).join('');
export const prerender = () => ({ placeholder: placeholderText(), total: totalText(), tags: tagsHTML(), home: homeHTML() });

const norm = (s) => String(s || '').toLowerCase();
function route() {
  const h = new URLSearchParams(location.hash.slice(1)), q = $('q').value.trim(), cat = h.get('cat') || '', sid = h.get('shelf') || '';
  for (const a of $('tags').children) a.setAttribute('aria-current', String(a.dataset.cat === cat && !sid && !q));
  let xs = null, title = '', say = '';
  if (q) {
    const k = norm(q);
    xs = all.filter((c) => [c.name, c.tid, c.desc, plain(c).short, plain(c).say, where(c)].some((v) => norm(v).includes(k)));
    title = `搜「${q}」`;
  } else if (sid) {
    const s = [...SHELVES, ...CHAINS].find((x) => x.id === sid);
    if (s) { xs = shelfItems(s, all); title = s.name; say = s.say; }
  } else if (cat) {
    const k = G.cats.find((x) => x.id === cat);
    if (k) { xs = all.filter((c) => (c.cats || []).includes(cat)); title = catName(k); }
  }
  $('home').hidden = !!xs; $('results').hidden = !xs;
  if (xs) {
    $('rtitle').textContent = title; $('rsay').textContent = say; $('rsay').hidden = !say;
    $('rcount').textContent = `${xs.length} 个`;
    $('grid').innerHTML = xs.length ? xs.map(card).join('') : '<p class="dim">没有找到。换个词试试，比如「小车」「语言模型」「279」。</p>';
    fillThumbs();
  }
}

async function fillThumbs() {
  for (const el of document.querySelectorAll('.thumb[data-img]:not([data-done])')) {
    const p = el.dataset.img; if (!p) continue;
    el.dataset.done = '1';
    const row = lock?.rows.get(p);
    const say = (t, bad) => { const m = el.firstElementChild; m.textContent = t; m.classList.toggle('bad', !!bad); };      // 原地换字，不换节点
    if (!row) { say(lockErr ? '登记清单没读到，图先不显示' : '这张图不在登记清单里，先不显示'); continue; }
    checkedURL(p, row).then((u) => { el.innerHTML = `<img alt=""${p.includes('-layout') ? ' class="lay"' : ''} src="${u}"><span class="ck" title="和登记清单一致">✓</span>`; },
      () => say('这张图没核对上，已经重试过一次', true)).finally(status);
  }
}

function status() {
  const b = $('lockbadge');
  // 下面这一块的节点都是网页里先写好的，这里只原地换字：折叠说明不删不重建，访客点开了就一直开着
  const put = (el, html, cls) => { if (el.className !== cls) el.className = cls; if (el.innerHTML !== html) el.innerHTML = html; };
  if (lockErr) {
    b.className = 'badge bad'; b.textContent = '没读到清单';
    put($('locksay'), '登记清单没读到，所以图都先不显示。可能是网络问题，刷新再试一次。', 'bad');
    put($('lockpre'), '登记清单 gallery.lock.json\n没读到', ''); return;
  }
  b.className = 'badge ' + (stats.bad ? 'warn' : 'ok');
  b.textContent = stats.bad ? `${stats.bad} 张图没对上` : `✓ ${stats.ok} 张图${okWord()}`;
  b.title = '页面上用到的图片里，已经和登记清单逐字节核对一致的张数（同一张图出现在几个分区里只算一次）';
  put($('locksay'), stats.bad ? `<span class="bad">有 ${stats.bad} 张图和登记不一致，已经重试过一次，这几张不显示。</span>可以刷新再试，或者先看别的芯片。` : `<span class="ok">✓ 已核对：</span>显示的 ${stats.ok} 张图都和登记清单一致。`, '');
  const note = chainNote(), cn = $('lockchain');
  if (note) put(cn, note, 'warn'); if (cn.hidden !== !note) cn.hidden = !note;
  put($('lockpre'), `登记清单 gallery.lock.json\n${lock.bytes.toLocaleString('zh-CN')} 字节  sha256 ${lock.sha256}`, '');
}

async function readGates() {
  await Promise.all(all.filter((x) => x.chain).map(async (c) => {
    const info = await circuitInfo(G.chains[c.chain], c.cpu || '0x6Fb4089e7Cbaa9660Fd11056274Cbd8117EE5B38', c.id).catch(() => null);
    if (!info) return;
    gates[c.tid] = info[3];
    document.querySelectorAll(`[data-tid="${CSS.escape(c.tid)}"] [data-meta]`).forEach((e) => { e.textContent = meta(c); e.title = '门数从链上现场读（两家节点一致）'; });
  }));
}

if (!PRE) {
  $('q').addEventListener('input', route);
  $('results').querySelector('.back').addEventListener('click', () => { $('q').value = ''; });
  addEventListener('hashchange', () => { $('q').value = ''; route(); scrollTo(0, 0); });
  if (!$('home').dataset.pre) {       // 构建时没写进来（比如直接打开源文件）才现填
    const p = prerender(); $('q').placeholder = p.placeholder; $('total').textContent = p.total; $('tags').innerHTML = p.tags; $('home').innerHTML = p.home;
  }
  route();
  try { lock = await loadLock(); } catch (e) { lockErr = e; }
  status(); fillThumbs(); readGates();
}
