import { loadLock, chipManifest, checkedURL, checkedJSON, circuitInfo, stats, chainNote, okWord, lockState } from './verify.js';
import { Viewer } from './viewer.js';
import { G, chips, esc, where, plain, CONTAINER, descParts, waitTick } from './common.js';
import { mountRun, MODULES } from './run.js';
import { subPlain, subTech } from './subs_plain.js';
window.GALLERY_BOOTED = true;   

const $ = (id) => document.getElementById(id);
const tid = new URLSearchParams(location.search).get('tid') || '279.732';
const c = chips().find((x) => x.tid === tid);
const BUILD = '../../app/build.html';
let man = null, pic = null, viewer = null, lock = null, fail = null;



function reserve(el, variants) {
  for (const h of variants) { const s = document.createElement('span'); s.setAttribute('aria-hidden', 'true'); s.style.cssText = 'grid-area:1/1;visibility:hidden'; s.innerHTML = h.replace(/ id="[^"]*"/g, ''); el.append(s); }
}
function put(el, html, cls = '') { const s = el.firstElementChild; if (s.className !== cls) s.className = cls; if (el._html !== html) { s.innerHTML = html; el._html = html; } }
const SAY = {
  ok: (seen, total) => `<span class="ok">✓ Checked:</span> the ${seen} files you have seen all match the record list (this chip has ${total} layout tiles; each is checked when you reach it).`,
  bad: (bad) => `<span class="bad">${bad} layout tiles did not match, even after one retry, and are drawn grey.</span> The rest is fine. You can <button class="btn" id="retry">retry</button> or look at other chips first.`,
  none: () => 'The layout of this chip is not in the record list yet, so it is not shown.',
  mismatch: (path) => `"${esc(path)}" differs from the record, even after one retry. This chip is not shown, so you do not see a wrong image. Reload to try again, or look at other chips first.`,
  net: () => 'The record list or layout could not be downloaded, maybe a network problem. Reload to try again.',
  container: () => `This is a website container: the circuit has only ${c.id === 1 ? 21 : 1} ${c.id === 1 ? 'gates' : 'gate'} and is used to hold a website on chain, so it has no layout of its own, and we do not pass off another chip's image as its layout. ${(c.links || [])[0] ? `<a href="${esc(c.links[0][1])}" target="_blank" rel="noopener">Open the site it holds: ${esc(c.links[0][0])}</a>` : ''}`,
};
const CHAIN_OK = '<span class="ok">✓ Chain record checked:</span> this record list matches the one recorded on chain.';
function chainLine() {       
  const ok = lockState().chain === 'ok';
  put($('checkchain'), ok ? CHAIN_OK : chainNote(), ok ? '' : 'warn');
}
function ciText(info) { return `${info[3].toLocaleString('en-US')} gates, ${info[0]} inputs, ${info[1]} outputs${info[2] ? `, ${info[2]} memory bits` : ''} (two nodes agree)`; }
const CI_BUSY = 'The nodes are busy, so this was not read. Try again in a moment. ', CI_MISS = 'Not read this time (two nodes must agree). ', CI_RETRY = '<button class="btn" id="ci-retry">Try other nodes</button>';

function head() {
  if (!c) { $('name').textContent = 'No such chip'; $('say').innerHTML = 'That id is wrong. <a href="./">Back to the chip list</a>.'; $('check').hidden = true; return false; }
  document.title = `${c.name} · 21 NAND`;
  if ($('name').textContent !== plain(c).short) { $('here').textContent = `#${c.tid}`; $('name').textContent = plain(c).short; }   
  
  const [sayText, detText] = descParts(c);       
  if ($('say').textContent !== sayText) $('say').textContent = sayText;
  if ($('det').textContent !== detText) $('det').textContent = detText;
  const demo = (c.links || [])[0];
  if (demo && !MODULES[c.tid]) $('run').innerHTML = `<a class="btn primary" href="${esc(demo[1])}" target="_blank" rel="noopener">Open in a new page: ${esc(demo[0])}</a>`;
  
  
  if (c.chain) {
    $('run').insertAdjacentHTML('beforeend', `<a class="btn" id="fork" href="${BUILD}">Build a small chip along these lines</a>`);
    $('forknote').hidden = false;
    $('forknote').textContent = 'The build page starts from a small truth table for now; it cannot import this chip yet.';
  }
  
  if (c.chain && !CONTAINER.has(c.tid)) {
    const box = document.createElement('section'); box.id = 'runbox'; box.className = 'runbox';
    $('forknote').after(box); mountRun(box, { ...c, cpu: c.cpu || '0x6Fb4089e7Cbaa9660Fd11056274Cbd8117EE5B38' }, G.chains, waitTick);
  }
  
  reserve($('checksay'), [SAY.ok(8888, 8888), SAY.bad(8888), SAY.none(), SAY.mismatch(`tiles/${tid}/8/88_88.webp`), SAY.net()].concat(CONTAINER.has(tid) ? [SAY.container()] : []));
  reserve($('checkchain'), [CHAIN_OK, chainNote()]);
  reserve($('allres'), [ALL.hint, ALL.none, 'Checking… ' + ALL.wait(8888, 8888, '888.8'), ALL.slow(888) + ALL.bad(8888, 8888), ALL.ok(8888, 8888)]);      
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
  if (fail?.container) { badge.className = 'badge'; badge.textContent = 'Website container'; return; }
  if (fail) { badge.className = 'badge bad'; badge.textContent = 'Did not match'; return; }
  const seen = stats.ok;
  badge.className = 'badge ' + (stats.bad ? 'warn' : 'ok');
  badge.textContent = stats.bad ? `${stats.bad} did not match` : `✓ ${okWord()[0].toUpperCase()}${okWord().slice(1)}`;
  $('check').className = 'check' + (stats.bad ? ' err' : '');
  put($('checksay'), stats.bad ? SAY.bad(stats.bad) : SAY.ok(seen, total));
}

const ALL = {
  hint: 'Available once this chip\'s tile list has been read.', none: 'This chip\'s tile list was not read, so there is nothing to check.',
  wait: (k, n, s) => `${k} / ${n} checked · ${s} s`, slow: (s) => `No response after ${s} s: `,
  bad: (bad, ok) => `<span class="bad">${bad} did not match</span>, ${ok} match`, ok: (ok, n) => `<span class="ok">✓ all ${ok} / ${n} match</span>`,
};
let allBusy = false;
async function checkAll() {
  if (!man || allBusy) return;
  const out = $('allres'); let ok = 0, bad = 0;
  allBusy = true; $('all').setAttribute('aria-busy', 'true');
  put(out, '', 'dim'); out._html = null;      
  const w = waitTick(out.firstElementChild, 'Checking…', (s) => ALL.wait(ok + bad, man.n, s));      
  const t0 = performance.now(); let slow = 0;
  try { await Promise.all([...man.rows].map(([p, row]) => checkedURL(p, row).then(() => ok++, (e) => { bad++; if (e && e.slow) slow++; }).then(w.draw))); } finally { w.stop(); }
  put(out, bad ? (slow ? ALL.slow(Math.round((performance.now() - t0) / 1000)) : '') + ALL.bad(bad, ok) : ALL.ok(ok, man.n));      
  allBusy = false; $('all').removeAttribute('aria-busy');
}

function subsystems() {
  const n = new Map(); for (const k of pic.components) n.set(k.sub, (n.get(k.sub) || 0) + 1);
  const list = pic.subsystems.filter((s) => n.get(s.id));
  
  $('subs').innerHTML = list.map((s) => { const say = subPlain(c.tid, s);
    return `<li><button aria-pressed="false" data-sub="${esc(s.id)}"><span class="dot" style="background:${esc(s.color)}"></span><span><b>${esc(say || subTech(tid, s).name)}</b><span class="dim">${n.get(s.id)} ${n.get(s.id) === 1 ? 'cell' : 'cells'} in the layout</span></span></button>
      <details class="tech"><summary>Technical details</summary><p><b>${esc(subTech(tid, s).name)}</b>: ${esc(subTech(tid, s).desc)}</p></details></li>`; }).join('');
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
  const rows = [['Where', esc(where(c))]];
  if (c.ts) rows.push(['On chain since', new Date(c.ts * 1000).toLocaleDateString('en-US')]);
  $('facts').innerHTML = rows.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('') + '<dt>Circuit</dt><dd id="ci" style="display:grid"><span class="dim" style="grid-area:1/1">Reading from chain…</span></dd>';
  if (!c.chain) { put($('ci'), 'Not on chain', 'dim'); return; }
  reserve($('ci'), [CI_BUSY + CI_RETRY, CI_MISS + CI_RETRY, ciText([88, 88, 8888, 888888])]);      
  const read = async () => {
    put($('ci'), 'Reading from chain…', 'dim');
    const info = await circuitInfo(G.chains[c.chain], c.cpu || '0x6Fb4089e7Cbaa9660Fd11056274Cbd8117EE5B38', c.id).catch((e) => (e && e.busy ? 'busy' : null));
    if (!info || info === 'busy') { put($('ci'), (info === 'busy' ? CI_BUSY : CI_MISS) + CI_RETRY, 'dim'); return; }
    put($('ci'), ciText(info), '');
  };
  $('ci').onclick = (e) => { if (e.target.id === 'ci-retry') { G.chains[c.chain].rpcs.push(G.chains[c.chain].rpcs.shift()); read(); } };
  read();
}

function tech() {
  const t = [];
  if (lock) t.push(`Record list gallery.lock.json: ${lock.bytes.toLocaleString('en-US')} bytes, sha256 ${lock.sha256}`);
  if (man) t.push(`Tile list of this chip tiles/${tid}/manifest.json: ${man.n} tiles, sha256 ${man.sha256}`);
  if (pic) t.push(`Layout ${pic.die?.[0] ?? ''} µm square, ${pic.ppu} pixels per µm, ${pic.image.levels} zoom levels; all ${pic.stats.gates} gates on chain are placed in the layout, and the routing tool added ${pic.stats.phys} buffer cells`);
  if (c?.imgCap) t.push(c.imgCap);
  $('tech').innerHTML = t.map((x) => `<p class="dim">${esc(x)}</p>`).join('');
}

const selTab = tabs();

let zq = 1;
const zshow = (r, fit = r === 1) => { const t = (Math.round(r * 10) / 10) + '×'; if ($('zlevel').textContent !== t) $('zlevel').textContent = t;
  if ($('zfit').getAttribute('aria-pressed') !== String(fit)) $('zfit').setAttribute('aria-pressed', String(fit)); };      
const zoomBy = (f) => { if (viewer) viewer.zoom(f); else if (!fail) { zq = Math.min(Math.max(zq * f, 0.5), 16); zshow(zq); } };
$('zin').onclick = () => zoomBy(1.6); $('zout').onclick = () => zoomBy(1 / 1.6); $('zfit').onclick = () => { if (viewer) viewer.fit(); else if (!fail) { zq = 1; zshow(1); } };

const known = head(); if (known) facts();
$('rest').style.visibility = '';       
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
    if (zq !== 1) viewer.zoom(zq);      
    subsystems();
    $('all').textContent = `Check all ${man.n}`; $('all').disabled = false; put($('allres'), '', 'dim');
  } catch (e) {
    fail = e;
    chainLine();
    put($('allres'), ALL.none, 'dim');
    for (const b of ['zin', 'zout', 'zfit']) $(b).disabled = true; $('zlevel').textContent = '—'; $('zfit').setAttribute('aria-pressed', 'false');      
    if (e.kind === 'none' && CONTAINER.has(tid)) { fail = { container: true }; put($('checksay'), SAY.container()); $('subs').innerHTML = '<li class="dim">A website container has no block view.</li>'; }
    else { $('check').className = 'check err'; put($('checksay'), e.kind === 'none' ? SAY.none() : e.kind === 'mismatch' ? SAY.mismatch(e.path) : SAY.net(), 'bad'); $('subs').innerHTML = ''; }
  }
  tech(); report();
}
