import { readIdentity, PLANNED_SUPPLY } from './bench-chain.js';
import { readSelection } from './brain-source.js';
const $ = id => document.getElementById(id);
const observer = document.createElement('section');
observer.id = 'gate-observer'; observer.hidden = true;observer.tabIndex=-1;observer.setAttribute('aria-label','真实门级观测');
observer.innerHTML = `<span id="gate-phase" class="sr-only">尚未求值</span>
<div id="gate-sample" hidden><dl class="gate-metrics">
<div title="NAND + LATCH 元件总数"><dt>门</dt><dd id="gate-count"></dd></div><div title="求值与状态采样耗时"><dt>ms</dt><dd id="gate-time"></dd></div>
<div title="本轮实际生成采样速率；不含预填充和JS包装token"><dt>tok/s</dt><dd id="gate-rate"></dd></div><div title="本拍翻转位数 / 全部LATCH"><dt>Δ</dt><dd id="gate-flips"></dd></div></dl>
<canvas id="gate-state" width="512" height="88" role="img" aria-label="真实LATCH状态图；文本等价见下面的状态详情"></canvas>
<details id="gate-details"><summary>观测说明与真实数据</summary><p id="gate-legend"></p>
<p class="gate-note">真实测量，不模拟闪烁。生成逐拍；预填充每64拍采样。速率=本轮网表采样token/生成耗时，不含预填充和JS包装token；ms仅为求值+状态采样，不含差分统计/分词/渲染。</p>
<pre id="gate-raw" tabindex="0"></pre></details></div>`;
// Live computation is the relevant companion to chat; file editing stays in
// the same DOM/state but becomes an optional workspace below the main task.
const files = $('workspace-panel'), pane = document.createElement('aside');
pane.className='workspace gate-pane';pane.setAttribute('aria-label','门级观测');pane.append(observer);
files.replaceWith(pane);document.querySelector('main').after(files);
$('column-resizer').setAttribute('aria-controls','conversation-panel gate-observer');
let lastSample;
function show(sample) {
  lastSample=sample;observer.hidden=false;
  $('gate-sample').hidden = false;
  observer.dataset.phase = sample.phase;
  const phase = {prefill:'预填充采样',generation:'生成',manual:'逐拍回看',stateless:'无状态求值'}[sample.phase];
  $('gate-phase').textContent = `— ${phase} #${sample.tick ?? '—'}${sample.total ? '/'+sample.total : ''}${sample.eos?' · EOS':''}`;
  $('gate-phase').dataset.label=$('gate-phase').textContent;
  $('gate-count').textContent = sample.gates.toLocaleString('en-US');
  $('gate-count').title = `${sample.nNand} NAND + ${sample.nLatch} LATCH`;
  $('gate-time').textContent = sample.ms===0 ? '< clock resolution' : sample.ms.toFixed(3);
  $('gate-rate').textContent = sample.elapsedMs > 0 ? (sample.emitted*1000/sample.elapsedMs).toFixed(2) : '—';
  $('gate-flips').textContent = `${sample.changedBits} / ${sample.nLatch}`;
  paint(sample);
  $('gate-legend').textContent=`正文色=1，灰色=0，强调色=本拍翻转 · 显示 ${sample.after.length}/${sample.nLatch} bits · 输出 ${sample.output ?? sample.outputBits+' bits (see trace)'}${sample.outputId!=null?' · token ID '+sample.outputId:''}`;
  $('gate-raw').textContent=JSON.stringify(sample,null,2);
}
function paint(sample) {
  const canvas=$('gate-state'), ctx=canvas.getContext('2d'), style=getComputedStyle(document.documentElement);
  const cols=Math.min(64,Math.max(1,sample.after.length)),cell=sample.after.length<=64?16:8;
  canvas.width=cols*cell;canvas.height=Math.max(1,Math.ceil(sample.after.length/cols))*cell;
  ctx.clearRect(0,0,canvas.width,canvas.height);
  for (let i=0;i<sample.after.length;i++) {
    ctx.fillStyle=style.getPropertyValue(sample.before[i]!==sample.after[i]?'--accent':sample.after[i]==='1'?'--text':'--line').trim();
    ctx.fillRect(i%cols*cell,Math.floor(i/cols)*cell,cell-2,cell-2);
  }
}
window.addEventListener('bench-theme',()=>{if(lastSample)paint(lastSample);});
window.addEventListener('brain-tick',e=>show(e.detail));
window.addEventListener('brain-idle',()=>{
  if (!$('gate-sample').hidden) $('gate-phase').textContent=$('gate-phase').dataset.label+' · 已停，保留最后一次实测';
});
readSelection().then(s=>{
  if (!s) return;
  if (!s.info) {
    document.querySelector('.badge').textContent='尺寸待加载';
    document.querySelector('.header-model-source strong').textContent='自定义大脑';
    return;
  }
  document.querySelector('.badge').textContent=`${s.info.nNand.toLocaleString('en-US')} NAND + ${s.info.nLatch} LATCH`;
  document.querySelector('.header-model-source strong').textContent=s.preset==='recall'?'Recall latch':s.preset==='toolcall'?'Tool summary':'自定义大脑';
  if (s.info.mode==='bits') {
    document.body.dataset.brain='bits';$('bench-bit-run').hidden=false;
    $('bench-limit').textContent='位电路按位求值 · 不理解自然语言';
    document.querySelector('.bench-lead').textContent=s.preset==='recall'?'当前大脑是记忆电路：138 NAND + 6 LATCH 的逐拍位电路。':s.preset==='toolcall'?'当前大脑是工具摘要机：9,583 NAND + 558 LATCH 的逐拍位电路，也是本次准备流片的组件。':'当前大脑是自定义的逐拍位电路。';
    $('bench-bit-run').textContent=s.preset==='recall'?'运行记忆电路':s.preset==='toolcall'?'运行工具摘要':'运行位电路';
    $('bench-stage').textContent='当前是位电路，不是聊天模型。打开换大脑面板运行逐拍演示。';
    $('load').hidden=true;
    document.querySelector('.bench-examples').hidden=true;$('bench-try').hidden=true;
  }
}).catch(()=>{}); // Storage failure is reported by the picker when switching.

const identity = document.createElement('details'); identity.id='chain-identity';
identity.innerHTML=`<summary>链上身份</summary><p id="chain-status" role="status">待部署，未发出 X Layer RPC</p>
<dl class="chain-fields"><dt>网络</dt><dd>X Layer · 196</dd><dt>处理器</dt><dd id="chain-processor">— 待用户部署</dd>
<dt>电路编号</dt><dd id="chain-circuit">— 待用户填写</dd><dt>规划共池</dt><dd>${PLANNED_SUPPLY.toLocaleString('en-US')} · NAND/LATCH 不分配额</dd>
<dt>链上上限</dt><dd id="chain-cap">— 未读取</dd><dt>累计已铸</dt><dd id="chain-minted">— 待部署，未读链</dd></dl>
<button id="chain-read" disabled>只读刷新</button><p>仅用 eth_call 等只读方法，不连接钱包、不签名。读数固定在同一区块；合约可升级，快照不是审计。规划共池不代表已经铸造。</p>
<details id="tapeout-guide"><summary>把你的大脑流片到这颗处理器</summary>
<ol><li>先用「换大脑」验证格式、逐拍状态和功能；任意网表不等于会聊天。</li>
<li>准备 NAND/LATCH 变长字节、nIn/nOut、SHA-256 及独立对拍结果；工具摘要机示例与本次准备流片的组件字节一致。</li>
<li>等待真实处理器部署，核对链 196、地址、价格、剩余共池与自己余额；只按需铸造。我们本次摘要机需要 10,141 个，不自铸满、不刷量。</li>
<li>由你用兼容的 TapeOut 工具针对这个<strong>已有处理器</strong>执行 staticCall 与 estimateGas。本站不是第三方通用流片签名器，不要用创建处理器向导冒充此入口。</li>
<li>费用、余额、权限、gas 与区块上限确认后，由你在钱包中签名；真实电路编号只从回执取。大脑分段必须单独设计验证，不能把“60多笔”量级粗估当成方案。</li>
<li>公布真实回执与字节哈希，独立只读复验；工作台语言脑仍默认链下运行。</li></ol>
<p><a href="./brain/MAKE_A_BRAIN.md" target="_blank" rel="noopener">制作大脑与格式</a> · <a href="./brain/toolcall_demo.json" download>下载摘要机网表</a></p></details>
<details><summary>部署配置说明</summary><p>只改 brain/bench-deployment.json 的真实 processor 和 circuitId 后重建。已配置核验过的 supplyCap()=0x8f770ad0、minted()=0x4f02c420；后者为 NAND/LATCH 合计累计铸造，不是余额或烧毁后现存量。未部署不请求，读失败不伪造 0。</p></details>`;
$('bench-deployment').replaceWith(identity);
let deployment;
fetch(new URL('./bench-deployment.json',import.meta.url)).then(r=>{if(!r.ok)throw Error(r.status);return r.json();}).then(d=>{
  deployment=d;
  if(d.processor==null&&d.circuitId==null) return;
  $('chain-processor').textContent=d.processor ?? '—';$('chain-circuit').textContent=d.circuitId ?? '—';
  $('chain-minted').textContent='— 待读取 minted()';
  $('chain-status').textContent='用户提供的身份，尚未读链核验';$('chain-read').disabled=false;
}).catch(()=>{$('chain-status').textContent='配置读取失败，未发送 RPC';});
$('chain-read').onclick=async()=>{
  $('chain-read').disabled=true;
  $('chain-cap').textContent=$('chain-minted').textContent='— 读取中';
  try {
    const r=await readIdentity(deployment);
    if(r.status==='pending')return;
    $('chain-cap').textContent=r.cap+(r.matchesPlan?' · 与规划一致':' · 与规划不符');
    $('chain-minted').textContent=r.minted ?? '— minted() 读取失败';
    $('chain-status').textContent=`RPC 区块 ${r.block} · ${r.queriedAt} · ${r.dimensions ? '电路尺寸 '+r.dimensions.join('/')+'（入/出/锁存/记录）' : '电路号待填写'}${r.mintedError?' · 累计已铸读取失败':''}`;
  } catch(e) {
    $('chain-status').textContent='读取失败，请检查 RPC 与部署配置';
    $('chain-cap').textContent=$('chain-minted').textContent='— 未核验';
  } finally {$('chain-read').disabled=false;}
};
