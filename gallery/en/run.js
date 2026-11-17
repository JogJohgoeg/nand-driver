





import { ethCall, sha256 } from './verify.js';


const CHAIN_SAYS = ['The nodes are busy, so the chain did not compute this. Try again in a moment.', 'Two nodes gave different results, so this one does not count. Try again in a while.', 'Could not reach a blockchain node, so the chain did not compute this. Check your connection and try again.', 'The chain computed something different from this page (chain: this step of the car: straight). This should not happen; try another input.'];

const waited = (e, t0) => (e && e.slow ? `No response after ${Math.round((performance.now() - t0) / 1000)} s: ` : '');
const SAY_HOW = 'It reads this chip\'s netlist from chain (used only if two nodes give the same one), then computes gate by gate in your browser. No wallet, no cost.';
export const MODULES = {                         
  '279.732': ['arena', 'driving arena'],
  '287.732': ['squared', 'NAND plays Squared'],
};
const SEL = { info: '084d60f1', netlist: '3fc4be56', step: 'e8281a1a' };
const u = (n) => n.toString(16).padStart(64, '0');
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));



export function evalNetlist(hex, nIn, nOut, bits) {
  const n = hex.length / 14, w = new Uint8Array(2 + nIn + n);
  w[1] = 1;
  for (let i = 0; i < nIn; i++) w[2 + i] = bits[i];
  for (let i = 0; i < n; i++) {
    const o = i * 14;
    w[2 + nIn + i] = 1 - (w[parseInt(hex.substr(o + 2, 6), 16)] & w[parseInt(hex.substr(o + 8, 6), 16)]);
  }
  return Array.from({ length: nOut }, (_, k) => w[2 + nIn + n - nOut + k]);
}


export function stepCalldata(cid, bits) {
  const b = new Uint8Array((bits.length + 7) >> 3);
  bits.forEach((x, i) => { if (x) b[i >> 3] |= 1 << (i & 7); });
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return '0x' + SEL.step + u(cid) + u(96) + u(128) + u(0) + u(b.length) + h + '00'.repeat((32 - (b.length % 32)) % 32);
}

export function stepBits(hex, nOut) {
  const off = parseInt(hex.slice(64, 128), 16) * 2, len = parseInt(hex.slice(off, off + 64), 16);
  if (len < 1) throw new Error('empty output');
  const d = hex.slice(off + 64, off + 64 + len * 2);
  return Array.from({ length: nOut }, (_, k) => (parseInt(d.substr((k >> 3) * 2, 2), 16) >> (k & 7)) & 1);
}
function bytesArg(hex) { const off = parseInt(hex.slice(0, 64), 16) * 2, len = parseInt(hex.slice(off, off + 64), 16); return hex.slice(off + 64, off + 64 + len * 2); }
const fromHex = (h) => new Uint8Array(h.match(/../g).map((x) => parseInt(x, 16)));


export async function agreed(rpcs, to, data, key = (x) => x) {
  const got = []; let busy = false, slow = false;
  for (const rpc of rpcs) {
    try { const r = await ethCall(rpc, to, data); got.push([r, await key(r)]); } catch (e) { busy ||= !!e.busy; slow ||= e.name === 'AbortError'; continue; }
    if (got.length === 2) break;
  }
  if (got.length < 2) throw Object.assign(new Error(busy ? 'busy' : 'net'), { slow });      
  if (got[0][1] !== got[1][1]) throw new Error('disagree');
  return got[0][0];
}


const cell = (c) => `row ${Math.floor(c / 11) + 1} column ${c % 11 + 1}`;
const pair = () => { const a = Math.floor(Math.random() * 121); let t; do { t = Math.floor(Math.random() * 121); } while (t === a); return [a, t]; };
const num = (o) => o.reduce((v, b, k) => v | (b << k), 0);
const WALK = ['stop', 'move down', 'move up', 'move left', 'move right'];
const walk = (o) => WALK[num(o)] || '(no such action)';
const turn = (o) => (o[0] && !o[1] ? 'turn left' : o[1] && !o[0] ? 'turn right' : 'go straight');     
const rand = (n, say) => () => { const bits = Array.from({ length: n }, () => (Math.random() < 0.5 ? 1 : 0)); return { bits, say }; };
export const DECODE = {
  
  '279.732': { make: rand(15, 'A random set of sensor readings'), out: (o) => `The car's next move: ${turn(o)}` },
  
  '281.732': { make: rand(14, 'A random set of sensor readings'), out: (o) => `This step: ${turn(o)}` },
  
  '287.732': { make() { const [a, t] = pair(), bits = [];
    for (let i = 0; i < 7; i++) bits.push((a >> i) & 1); for (let i = 0; i < 7; i++) bits.push((t >> i) & 1);
    return { bits, say: `You are at ${cell(a)}, the target is at ${cell(t)}` }; }, out: (o) => `Next step: ${walk(o)}` },
  
  '290.732': { make() { const [a, t] = pair(), bits = new Array(242).fill(0); bits[2 * a] = 1; bits[2 * t + 1] = 1;
    return { bits, say: `You are at ${cell(a)}, the target is at ${cell(t)}` }; }, out: (o) => `Next step: ${walk(o)}` },
};
const bitsHex = (b) => { const u8 = new Uint8Array((b.length + 7) >> 3); b.forEach((x, i) => { if (x) u8[i >> 3] |= 1 << (i & 7); }); return [...u8].map((x) => x.toString(16).padStart(2, '0')).join(''); };

export function mountRun(box, chip, chains, tick = (node, label) => { node.textContent = label; return { draw() {}, stop() {} }; }) {      
  if (!chip.chain) return;
  const mod = MODULES[chip.tid];
  const chain = chains[chip.chain];
  box.innerHTML = `<h2>Run it</h2>
    ${mod ? `<p><a class="btn primary" href="../../app/#${mod[0]}">Open in the app: ${esc(mod[1])}</a></p>` : ''}
    <div id="run-local"><p><button class="btn" id="run-go">Compute once on this page with the on-chain netlist</button></p>
    <p class="dim" id="run-say" style="display:grid"><span style="grid-area:1/1">${SAY_HOW}</span><span aria-hidden="true" style="grid-area:1/1;visibility:hidden">${SAY_HOW}</span></p></div>
    <div id="run-out"></div>`;
  let net = null, cur = null;
  const say = box.querySelector('#run-say').firstElementChild;      
  const out = box.querySelector('#run-out');
  const show = (html, cls = '') => { out.className = 'check ' + cls; out.innerHTML = html; };

  async function load() {
    const id = u(chip.id);
    const info = await agreed(chain.rpcs, chip.cpu, '0x' + SEL.info + id);
    const w = [0, 1, 2, 3].map((k) => parseInt(info.slice(k * 64, k * 64 + 64), 16));
    if (w[2]) return { state: w[2], nIn: w[0], nOut: w[1], gates: w[3] };
    const nlHex = bytesArg(await agreed(chain.rpcs, chip.cpu, '0x' + SEL.netlist + id, (r) => sha256(fromHex(bytesArg(r)))));
    if (nlHex.length !== w[3] * 14) throw new Error('size');
    return { nIn: w[0], nOut: w[1], gates: w[3], hex: nlHex, sha: await sha256(fromHex(nlHex)) };
  }
  const D = DECODE[chip.tid];
  function input() { return D ? D.make() : rand(net.nIn, `A random input (${net.nIn} bits)`)(); }
  const meaning = (o) => (D ? D.out(o) : 'This is the circuit\'s output');
  function compute() {
    cur = input();
    cur.local = evalNetlist(net.hex, net.nIn, net.nOut, cur.bits);
    show(`<p>${esc(cur.say)} → This page computed: <b>${esc(meaning(cur.local))}</b></p>
      <p class="row"><button class="btn" id="run-again">Try another input</button><button class="btn" id="run-chain">Let the chain compute it too</button></p>
      <p id="run-chainres" style="display:grid"><span class="dim" style="grid-area:1/1">"Let the chain compute it too" sends one read-only request to a public node. No wallet.</span>${CHAIN_SAYS.map((x) => `<span aria-hidden="true" style="grid-area:1/1;visibility:hidden">${x}</span>`).join('')}</p>
      <details><summary>Technical details</summary><p class="dim">Input ${net.nIn} bits (hex, least significant bit first): ${bitsHex(cur.bits)}</p>
      <p class="dim">Output ${net.nOut} bits (from bit 1): ${cur.local.join('')}</p>
      <p class="dim" id="run-chainbits"></p>
      <p class="dim">${net.gates.toLocaleString('en-US')} gates on chain; netlist ${(net.hex.length / 2).toLocaleString('en-US')} bytes, sha256 ${net.sha} (two nodes agree).</p></details>`);
    out.querySelector('#run-again').onclick = compute;
    out.querySelector('#run-chain').onclick = askChain;
  }
  async function askChain() {
    const res = out.querySelector('#run-chainres').firstElementChild;      
    res.className = 'dim'; const t0 = performance.now(), w = tick(res, 'The chain is computing…', (s) => `${s} s`);
    try {
      let r; try { r = await agreed(chain.rpcs, chip.cpu, stepCalldata(chip.id, cur.bits), (h) => stepBits(h, net.nOut).join('')); } finally { w.stop(); }
      const got = stepBits(r, net.nOut), same = got.join('') === cur.local.join('');
      out.querySelector('#run-chainbits').textContent = `Output of step on chain (from bit 1): ${got.join('')} (two nodes agree)`;
      res.className = same ? 'ok' : 'bad';
      res.textContent = same ? (D ? `✓ The chain also computed "${meaning(got)}", same as this page` : '✓ The chain computed the same output as this page') : `The chain computed something different from this page${D ? ` (chain: ${meaning(got)})` : ''}. This should not happen; try another input.`;
    } catch (e) {
      res.className = 'bad';
      res.textContent = waited(e, t0) + (e.message === 'busy' ? CHAIN_SAYS[0] : e.message === 'disagree' ? CHAIN_SAYS[1] : CHAIN_SAYS[2]);
    }
  }
  box.querySelector('#run-go').onclick = async () => {
    const t0 = performance.now(), w = tick(say, 'Reading the netlist from chain…', (s) => `${s} s`);      
    try { try { net = await load(); } finally { w.stop(); say.textContent = SAY_HOW; } } catch (e) {
      net = null;
      if (e.message === 'busy') return show('<p class="bad">The nodes are busy, so the netlist was not read. Try again in a moment.</p>', 'err');
      return show(`<p class="bad">${waited(e, t0)}${e.message === 'disagree' ? 'Two nodes gave different netlists, so this one does not count.' : e.message === 'size' ? 'The netlist length does not match the gate count on chain, so this one does not count.' : 'Could not reach a blockchain node, so the netlist was not read.'} Try again in a while.</p>`, 'err');
    }
    if (net.state) {
      box.querySelector('#run-local').hidden = true;
      return show(`<p>This chip has ${net.state} memory bits: each step depends on the state the last step left, and a step on chain has to carry that state. This version does not run it on this page${mod ? '; you can open it in the app instead' : ''}.</p>`);
    }
    box.querySelector('#run-local').hidden = true;
    compute();
  };
}
