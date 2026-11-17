import { loadLock, checkedURL, circuitInfo, stats, chainNote, okWord } from './verify.js';
import { G, chips, where, layoutPath, esc, CONTAINER, plain, GATES, SHELVES, chainShelves, shelfItems, catName, openness } from './common.js';


const PRE = typeof document === 'undefined';
if (!PRE) window.GALLERY_BOOTED = true;   


const $ = (id) => document.getElementById(id);
const all = chips();
const CHAINS = chainShelves(all);
const gates = { ...GATES };                    
let lock = null, lockErr = null;

function thumb(c) {
  const p = layoutPath(c);
  const msg = CONTAINER.has(c.tid) ? 'Website container, no layout of its own' : !p ? 'Layout queued' : 'Checking…';
  
  return `<div class="thumb" data-img="${p ? esc(p) : ''}"><span class="msg" style="place-self:stretch;display:grid;place-items:center">${msg}</span></div>`;
}
const meta = (c) => (gates[c.tid] != null ? `${gates[c.tid].toLocaleString('en-US')} ${gates[c.tid] === 1 ? 'gate' : 'gates'} · ` : '') + where(c);

function card(c) {
  const detail = c.chain && !CONTAINER.has(c.tid) && layoutPath(c) ? `chip.html?tid=${encodeURIComponent(c.tid)}` : null;
  const demo = (c.links || [])[0], P = plain(c);
  const btns = [detail ? `<a class="btn primary" href="${detail}">See layout</a>` : '',
    demo ? `<a class="btn" href="${esc(demo[1])}" target="_blank" rel="noopener" title="${esc(demo[0])}">${esc(P.go || 'See demo')}</a>` : ''].filter(Boolean);
  return `<article class="card" data-tid="${esc(c.tid)}">
    ${detail ? `<a class="pic" href="${detail}" aria-label="Layout of ${esc(c.name)}">${thumb(c)}</a>` : `<div class="pic off" aria-disabled="true">${thumb(c)}</div>`}
    <div class="body">
      <strong>${esc(P.short)}</strong>
      <p class="say">${esc(P.say)}</p>
      <span class="meta" data-meta>${esc(meta(c))}</span>
      ${openness(c) ? `<span class="open${openness(c).includes('free') ? ' lic' : ''}">${esc(openness(c))}</span>` : ''}
      <div class="btns">${btns.join('') || '<span class="dim nobtn">Image only, no demo</span>'}</div>
    </div></article>`;
}

function shelf(s, h = 'h2') {
  const xs = shelfItems(s, all), row = s.limit ? xs.slice(0, s.limit) : xs;
  return `<section class="shelf" id="sh-${s.id}">
    <div class="sec"><${h}>${esc(s.name)}</${h}><a class="more" href="#shelf=${s.id}">See all ${xs.length} →</a></div>
    <p class="note">${esc(s.say)}</p>
    <div class="rail" role="region" tabindex="0" aria-label="${esc(s.name)}, swipe sideways">${row.map(card).join('')}</div></section>`;
}

const homeHTML = () => SHELVES.map((s) => shelf(s)).join('') +
    `<section class="shelf group"><div class="sec"><h2>By chain</h2></div><p class="note">Our circuits are on two chains: ${CHAINS.map((s) => `${esc(s.name)} ${shelfItems(s, all).length}`).join(', ')}.</p></section>` +
    CHAINS.map((s) => shelf({ ...s, name: `${s.name} (${shelfItems(s, all).length})` }, 'h3')).join('');

const onChain = all.filter((c) => c.chain).length;
const placeholderText = () => `Search ${all.length} chips and boards`;
const totalText = () => `${all.length} items = ${onChain} circuits on chain + ${all.length - onChain} layouts and boards not on chain`;
const tagsHTML = () => `<a class="tag" href="#" data-cat="">All (${all.length})</a>` +
    G.cats.map((k) => [k, all.filter((c) => (c.cats || []).includes(k.id)).length]).filter(([, n]) => n)
      .map(([k, n]) => `<a class="tag" href="#cat=${k.id}" data-cat="${k.id}">${esc(catName(k))} (${n})</a>`).join('');
export const prerender = () => ({ placeholder: placeholderText(), total: totalText(), tags: tagsHTML(), home: homeHTML() });

const norm = (s) => String(s || '').toLowerCase();
function route() {
  const h = new URLSearchParams(location.hash.slice(1)), q = $('q').value.trim(), cat = h.get('cat') || '', sid = h.get('shelf') || '';
  for (const a of $('tags').children) a.setAttribute('aria-current', String(a.dataset.cat === cat && !sid && !q));
  let xs = null, title = '', say = '';
  if (q) {
    const k = norm(q);
    xs = all.filter((c) => [c.name, c.tid, c.desc, plain(c).short, plain(c).say, where(c)].some((v) => norm(v).includes(k)));
    title = `Search: "${q}"`;
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
    $('rcount').textContent = `${xs.length} found`;
    $('grid').innerHTML = xs.length ? xs.map(card).join('') : '<p class="dim">Nothing found. Try another word, like "car", "language model" or "279".</p>';
    fillThumbs();
  }
}

async function fillThumbs() {
  for (const el of document.querySelectorAll('.thumb[data-img]:not([data-done])')) {
    const p = el.dataset.img; if (!p) continue;
    el.dataset.done = '1';
    const row = lock?.rows.get(p);
    const say = (t, bad) => { const m = el.firstElementChild; m.textContent = t; m.classList.toggle('bad', !!bad); };      
    if (!row) { say(lockErr ? 'Record list not read, image not shown' : 'This image is not in the record list, not shown'); continue; }
    checkedURL(p, row).then((u) => { el.innerHTML = `<img alt=""${p.includes('-layout') ? ' class="lay"' : ''} src="${u}"><span class="ck" title="Matches the record list">✓</span>`; },
      () => say('This image did not match, even after one retry', true)).finally(status);
  }
}

function status() {
  const b = $('lockbadge');
  
  const put = (el, html, cls) => { if (el.className !== cls) el.className = cls; if (el.innerHTML !== html) el.innerHTML = html; };
  if (lockErr) {
    b.className = 'badge bad'; b.textContent = 'List not read';
    put($('locksay'), 'The record list could not be read, so no images are shown. It may be the network: reload to try again.', 'bad');
    put($('lockpre'), 'Record list gallery.lock.json\nNot read', ''); return;
  }
  b.className = 'badge ' + (stats.bad ? 'warn' : 'ok');
  b.textContent = stats.bad ? `${stats.bad} did not match` : `✓ ${stats.ok} images${okWord() === 'checked' ? ' checked' : ', ' + okWord()}`;
  b.title = 'Images on this page checked byte for byte against the record list (an image shown in several sections counts once)';
  put($('locksay'), stats.bad ? `<span class="bad">${stats.bad} images differ from the record, even after one retry, and are not shown.</span> Reload to try again, or look at other chips first.` : `<span class="ok">✓ Checked:</span> the ${stats.ok} images shown all match the record list.`, '');
  const note = chainNote(), cn = $('lockchain');
  if (note) put(cn, note, 'warn'); if (cn.hidden !== !note) cn.hidden = !note;
  put($('lockpre'), `Record list gallery.lock.json\n${lock.bytes.toLocaleString('en-US')} bytes  sha256 ${lock.sha256}`, '');
}

async function readGates() {
  await Promise.all(all.filter((x) => x.chain).map(async (c) => {
    const info = await circuitInfo(G.chains[c.chain], c.cpu || '0x6Fb4089e7Cbaa9660Fd11056274Cbd8117EE5B38', c.id).catch(() => null);
    if (!info) return;
    gates[c.tid] = info[3];
    document.querySelectorAll(`[data-tid="${CSS.escape(c.tid)}"] [data-meta]`).forEach((e) => { e.textContent = meta(c); e.title = 'Gate count read live from chain (two nodes agree)'; });
  }));
}

if (!PRE) {
  $('q').addEventListener('input', route);
  $('results').querySelector('.back').addEventListener('click', () => { $('q').value = ''; });
  addEventListener('hashchange', () => { $('q').value = ''; route(); scrollTo(0, 0); });
  if (!$('home').dataset.pre) {       
    const p = prerender(); $('q').placeholder = p.placeholder; $('total').textContent = p.total; $('tags').innerHTML = p.tags; $('home').innerHTML = p.home;
  }
  route();
  try { lock = await loadLock(); } catch (e) { lockErr = e; }
  status(); fillThumbs(); readGates();
}
