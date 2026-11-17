// 详情页「跑一下」。
// 1 有现成模块的（279 开车竞技场、287 NAND 玩 Squared，Squared 用的是 287）先给「在应用里打开」。
// 2 纯组合电路（链上 circuitInfo 的记忆位 = 0）：从链上读网表（两家节点给的字节 sha256 一致才用），在本页按位求值；
//   可选「让链上也算一次」：对 CPU 发只读 eth_call step(cid, 空状态, 同一组输入)，和本页的输出逐位比。
// 3 带记忆的（280、283、284）：链上一步要带状态，先不放「本页跑」，只说清楚为什么。
// 网站容器（288.732、1.2.245）不在这里：它们只有 1 个和 21 个门，详情页给容器卡片。只用 eth_call，不碰钱包。
import { ethCall, sha256 } from './verify.js';

// 「让链上也算一次」那一行没算成时的三句话（节点忙、两家不一致、连不上）；这三句和最长的一句结果先叠在那一行里占位置
const CHAIN_SAYS = ['节点太忙，这次链上没算成。稍等一会儿再点一次。', '两家节点给的结果不一样，这次不算数。过一会儿再点一次。', '连不上区块链节点，这次链上没算成。检查网络后再点一次。', '链上算出的和本页不一样（链上：小车这一步：直行）。这不该发生，可以换一组再算一次。'];
// 等到页面自己的超时才失败的，出错那句话前面带上等了多久；立刻失败的照原话
const waited = (e, t0) => (e && e.slow ? `等了 ${Math.round((performance.now() - t0) / 1000)} 秒没有回应：` : '');
const SAY_HOW = '先从链上读这颗芯片的网表（两家节点给的一样才用），再在你的浏览器里一个门一个门算。不用钱包，不花钱。';
export const MODULES = {                         // app/modules.json 里已有的模块（id → 名字），按钮开 ../app/#id
  '279.732': ['arena', '开车竞技场'],
  '287.732': ['squared', 'NAND 玩 Squared'],
};
const SEL = { info: '084d60f1', netlist: '3fc4be56', step: 'e8281a1a' };
const u = (n) => n.toString(16).padStart(64, '0');
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// 链上网表：每个门 7 字节（1 字节类型 + 两个 3 字节输入线号）；线 0 = 常 0，1 = 常 1，2.. = 输入，再往后依次是每个门的输出；
// 最后 nOut 个门的输出就是电路输出（低位在前）。同 assets/squared/index.html 的 evalNAND。
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

// step(uint256 cid, bytes state, bytes input) 的调用数据：输入按低位在前装进字节，状态为空
export function stepCalldata(cid, bits) {
  const b = new Uint8Array((bits.length + 7) >> 3);
  bits.forEach((x, i) => { if (x) b[i >> 3] |= 1 << (i & 7); });
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return '0x' + SEL.step + u(cid) + u(96) + u(128) + u(0) + u(b.length) + h + '00'.repeat((32 - (b.length % 32)) % 32);
}
// step 返回 (bytes 新状态, bytes 输出)：按第 2 个偏移找输出，取前 nOut 位（低位在前）。不能取返回值末尾，那是 ABI 补的零
export function stepBits(hex, nOut) {
  const off = parseInt(hex.slice(64, 128), 16) * 2, len = parseInt(hex.slice(off, off + 64), 16);
  if (len < 1) throw new Error('输出是空的');
  const d = hex.slice(off + 64, off + 64 + len * 2);
  return Array.from({ length: nOut }, (_, k) => (parseInt(d.substr((k >> 3) * 2, 2), 16) >> (k & 7)) & 1);
}
function bytesArg(hex) { const off = parseInt(hex.slice(0, 64), 16) * 2, len = parseInt(hex.slice(off, off + 64), 16); return hex.slice(off + 64, off + 64 + len * 2); }
const fromHex = (h) => new Uint8Array(h.match(/../g).map((x) => parseInt(x, 16)));

// 两家节点都答、答案一致才算数；一家不通或限流（429）就换下一家
export async function agreed(rpcs, to, data, key = (x) => x) {
  const got = []; let busy = false, slow = false;
  for (const rpc of rpcs) {
    try { const r = await ethCall(rpc, to, data); got.push([r, await key(r)]); } catch (e) { busy ||= !!e.busy; slow ||= e.name === 'AbortError'; continue; }
    if (got.length === 2) break;
  }
  if (got.length < 2) throw Object.assign(new Error(busy ? 'busy' : 'net'), { slow });      // slow：有节点是等到超时才算没回的
  if (got[0][1] !== got[1][1]) throw new Error('disagree');
  return got[0][0];
}

// 能确定含义的芯片才写含义，出处写在每一项上；其余只说「这是电路的输出」，位串收进技术细节，不编。
const cell = (c) => `第 ${Math.floor(c / 11) + 1} 行第 ${c % 11 + 1} 列`;
const pair = () => { const a = Math.floor(Math.random() * 121); let t; do { t = Math.floor(Math.random() * 121); } while (t === a); return [a, t]; };
const num = (o) => o.reduce((v, b, k) => v | (b << k), 0);
const WALK = ['停下', '往下走', '往上走', '往左走', '往右走'];
const walk = (o) => WALK[num(o)] || '（没有这个动作）';
const turn = (o) => (o[0] && !o[1] ? '左转' : o[1] && !o[0] ? '右转' : '直行');     // 输出两位：左、右；00 / 11 直行
const rand = (n, say) => () => { const bits = Array.from({ length: n }, () => (Math.random() < 0.5 ? 1 : 0)); return { bits, say }; };
export const DECODE = {
  // app/m/arena/car.js：15 位传感器，输出左、右
  '279.732': { make: rand(15, '随机一组传感器读数'), out: (o) => `小车这一步：${turn(o)}` },
  // 输出两位照训练脚本的约定：「left,right; 00/11 straight」
  '281.732': { make: rand(14, '随机一组传感器读数'), out: (o) => `这一步：${turn(o)}` },
  // 照生成这颗电路的脚本的约定：自己、目标格子号各 7 位（低位在前）；动作码 0 重合，1 下，2 上，3 左，4 右
  '287.732': { make() { const [a, t] = pair(), bits = [];
    for (let i = 0; i < 7; i++) bits.push((a >> i) & 1); for (let i = 0; i < 7; i++) bits.push((t >> i) & 1);
    return { bits, say: `自己在${cell(a)}，目标在${cell(t)}` }; }, out: (o) => `下一步：${walk(o)}` },
  // assets/squared：第 2c 位 = 自己在第 c 格，第 2c+1 位 = 目标在第 c 格
  '290.732': { make() { const [a, t] = pair(), bits = new Array(242).fill(0); bits[2 * a] = 1; bits[2 * t + 1] = 1;
    return { bits, say: `自己在${cell(a)}，目标在${cell(t)}` }; }, out: (o) => `下一步：${walk(o)}` },
};
const bitsHex = (b) => { const u8 = new Uint8Array((b.length + 7) >> 3); b.forEach((x, i) => { if (x) u8[i >> 3] |= 1 << (i & 7); }); return [...u8].map((x) => x.toString(16).padStart(2, '0')).join(''); };

export function mountRun(box, chip, chains, tick = (node, label) => { node.textContent = label; return { draw() {}, stop() {} }; }) {      // tick：等待时在那句话后面走已用时间（详情页传进来；不传就只写那句话）
  if (!chip.chain) return;
  const mod = MODULES[chip.tid];
  const chain = chains[chip.chain];
  box.innerHTML = `<h2>跑一下</h2>
    ${mod ? `<p><a class="btn primary" href="../app/#${mod[0]}">在应用里打开：${esc(mod[1])}</a></p>` : ''}
    <div id="run-local"><p><button class="btn" id="run-go">用链上的网表在本页算一次</button></p>
    <p class="dim" id="run-say" style="display:grid"><span style="grid-area:1/1">${SAY_HOW}</span><span aria-hidden="true" style="grid-area:1/1;visibility:hidden">${SAY_HOW}</span></p></div>
    <div id="run-out"></div>`;
  let net = null, cur = null;
  const say = box.querySelector('#run-say').firstElementChild;      // 说明那一句；读网表时在这同一个位置上写「从链上读网表…」加已用时间，读完换回来
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
  function input() { return D ? D.make() : rand(net.nIn, `随机给了一组输入（${net.nIn} 位）`)(); }
  const meaning = (o) => (D ? D.out(o) : '这是电路的输出');
  function compute() {
    cur = input();
    cur.local = evalNetlist(net.hex, net.nIn, net.nOut, cur.bits);
    show(`<p>${esc(cur.say)} → 本页算出：<b>${esc(meaning(cur.local))}</b></p>
      <p class="row"><button class="btn" id="run-again">换一组再算</button><button class="btn" id="run-chain">让链上也算一次</button></p>
      <p id="run-chainres" style="display:grid"><span class="dim" style="grid-area:1/1">「让链上也算一次」会向公共节点发一次只读请求，不用钱包。</span>${CHAIN_SAYS.map((x) => `<span aria-hidden="true" style="grid-area:1/1;visibility:hidden">${x}</span>`).join('')}</p>
      <details><summary>技术细节</summary><p class="dim">输入 ${net.nIn} 位（十六进制，低位在前）：${bitsHex(cur.bits)}</p>
      <p class="dim">输出 ${net.nOut} 位（从第 1 位写起）：${cur.local.join('')}</p>
      <p class="dim" id="run-chainbits"></p>
      <p class="dim">链上 ${net.gates.toLocaleString('zh-CN')} 个门；网表 ${(net.hex.length / 2).toLocaleString('zh-CN')} 字节，sha256 ${net.sha}（两家节点一致）。</p></details>`);
    out.querySelector('#run-again').onclick = compute;
    out.querySelector('#run-chain').onclick = askChain;
  }
  async function askChain() {
    const res = out.querySelector('#run-chainres').firstElementChild;      // 看得见的那一句；别的几句叠在同一格里占着位置
    res.className = 'dim'; const t0 = performance.now(), w = tick(res, '链上在算…', (s) => `${s} 秒`);
    try {
      let r; try { r = await agreed(chain.rpcs, chip.cpu, stepCalldata(chip.id, cur.bits), (h) => stepBits(h, net.nOut).join('')); } finally { w.stop(); }
      const got = stepBits(r, net.nOut), same = got.join('') === cur.local.join('');
      out.querySelector('#run-chainbits').textContent = `链上 step 的输出（从第 1 位写起）：${got.join('')}（两家节点一致）`;
      res.className = same ? 'ok' : 'bad';
      res.textContent = same ? (D ? `✓ 链上也算出「${meaning(got)}」，和本页一样` : '✓ 链上算出的输出和本页一样') : `链上算出的和本页不一样${D ? `（链上：${meaning(got)}）` : ''}。这不该发生，可以换一组再算一次。`;
    } catch (e) {
      res.className = 'bad';
      res.textContent = waited(e, t0) + (e.message === 'busy' ? CHAIN_SAYS[0] : e.message === 'disagree' ? CHAIN_SAYS[1] : CHAIN_SAYS[2]);
    }
  }
  box.querySelector('#run-go').onclick = async () => {
    const t0 = performance.now(), w = tick(say, '从链上读网表…', (s) => `${s} 秒`);      // 下面那块（上一次没读到时写的话）先不动，读完再换，免得等的时候页面跳一下
    try { try { net = await load(); } finally { w.stop(); say.textContent = SAY_HOW; } } catch (e) {
      net = null;
      if (e.message === 'busy') return show('<p class="bad">节点太忙，这次没读到网表。稍等一会儿再点一次。</p>', 'err');
      return show(`<p class="bad">${waited(e, t0)}${e.message === 'disagree' ? '两家节点给的网表不一样，这次不算数。' : e.message === 'size' ? '读到的网表长度和链上登记的门数对不上，这次不算。' : '连不上区块链节点，这次没读到网表。'}过一会儿再点一次。</p>`, 'err');
    }
    if (net.state) {
      box.querySelector('#run-local').hidden = true;
      return show(`<p>这颗芯片带 ${net.state} 位记忆：每一步的结果取决于上一步留下的状态，链上跑一步要带着状态走。这一版先不在本页跑它${mod ? '，可以先在应用里打开看' : ''}。</p>`);
    }
    box.querySelector('#run-local').hidden = true;
    compute();
  };
}
