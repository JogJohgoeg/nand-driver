import { loadSource, readSelection, progressText } from './brain-source.js';
import { DEFAULT_BRAIN_URL } from './brain-config.js';
import { measuredStep } from './bench-brain.js';
import { benchConfirm } from './bench-dialog.js';

// Same structured capture fixture as test_circuit.mjs. This is NOT a user
// prompt or a language tokenizer; generation feeds back the circuit's own code.
const TOOL_CAPTURE = [12,4945,2075,977,458,1584,923,39613,977,5163,7346,977,5163,2352,977,458,8094,923,13,130072,130071,220];

const panel = document.createElement('details');
panel.id = 'brain-picker';
panel.innerHTML = `<summary id="brain-open">换大脑</summary>
<div id="brain-presets" aria-label="内置大脑"><button data-preset="default">默认大脑</button><button data-preset="recall">记忆电路 · 144</button><button data-preset="toolcall">工具摘要 · 10,141</button></div>
<p id="brain-gate"><a href="https://nand.aihashrate.stream/gate/" target="_blank" rel="noopener">门电路大脑 · BitCPM4-1B：整个 10 亿参数模型编译成 NAND/LATCH，在显卡上逐位执行 ↗</a></p>
<p>这里换推理网表，不是导入工作区文本。<a href="./brain/MAKE_A_BRAIN.md" target="_blank" rel="noopener">做自己的大脑：格式与教程 ↗</a> · <a href="./brain/recall_latch.json" download>下载最小记忆电路</a></p>
<p id="brain-current"></p>
<p>只保存在本浏览器，不上传。校验通过后仍需确认重载；请先保存编辑内容并停止生成。坏文件不会替换原大脑。</p>
<fieldset><legend>从本地文件切换</legend>
<label>网表及配套文件（可多选） <input id="brain-files" type="file" multiple aria-describedby="brain-file-help"></label>
<p id="brain-file-help">recall_latch.json 可单选；聊天大脑请同时选 netlist.json、records、tokenizer.json、tokenizer_config.json 和 top 映射。</p></fieldset>
<fieldset><legend>从 URL 切换</legend>
<label>netlist.json 的完整地址 <input id="brain-url" type="url" placeholder="https://…/netlist.json"></label>
<p>地址需允许跨源读取；网络不通可下载后改选本地文件。</p>
<button id="brain-url-load">校验 URL 并切换</button> <button id="brain-default">恢复默认大脑</button></fieldset>
<p id="brain-status" role="status" aria-live="polite" tabindex="-1"></p>
<fieldset><legend>逐拍门级输入（十进制整数，每个数一拍；LSB-first）</legend>
<p>位电路不是聊天模型。换入最小记忆电路后，示例输入的输出应为 0 0 0 0 9；14=MARK，15=QUERY。</p>
<label>输入序列 <input id="brain-ticks" value="14 9 3 3 15"></label>
<button id="brain-run">从零状态运行</button><button id="brain-tool-demo" hidden>运行112拍捕获/回放</button>
<p id="brain-demo-note"></p><label id="brain-frame-label" hidden>回看真实拍 <select id="brain-frame"></select></label>
<button id="brain-inspect" hidden>查看本拍状态图</button>
<pre id="brain-output" tabindex="0">还没有逐拍结果。先选择电路，再运行输入序列。</pre></fieldset>`;
document.getElementById('brain-picker-slot').append(panel);
window.dispatchEvent(new Event('bench-layout'));
const $ = id => document.getElementById(id);
let selection = await readSelection().catch(() => null), loaded, busy = false, frames = [];
$('brain-url').value = selection?.url ?? DEFAULT_BRAIN_URL;
$('brain-current').textContent = selection?.files ? `当前：本地网表 ${selection.manifest ?? 'netlist.json'}（刷新后保留）` : `当前：${selection?.url ?? DEFAULT_BRAIN_URL}`;
$('brain-status').textContent = '原大脑保持不变，直到新文件校验通过并确认切换。';
panel.ontoggle = () => {
  $('brain-open')?.setAttribute('aria-expanded', String(panel.open));
};
if (selection?.preset === 'recall' || selection?.preset === 'toolcall') {
  $('brain-demo-note').textContent = selection.preset === 'recall'
    ? '按“从零状态运行”：14标记、9写入、15查询，应输出0/0/0/0/9。'
    : '结构化fixture先捕获，再用本电路输出回馈90拍。不是自然语言理解；低17位为token ID、bit17为生成控制。';
  $('brain-tool-demo').hidden = selection.preset !== 'toolcall';
  $('brain-run').hidden = selection.preset === 'toolcall';
}
function progress(p) { const t = progressText(p); $('brain-status').textContent = `${t.stage} · ${t.bytes}`; }
async function act(fn) {
  if (busy) return; busy = true;
  const controls = [...panel.querySelectorAll('button,input,select'), $('bench-bit-run')];
  controls.forEach(el => { el.disabled = true; });
  panel.setAttribute('aria-busy', 'true'); $('brain-status').dataset.error = 'false';
  try { await fn(); } catch (e) {
    const dlg=document.getElementById('brain-dialog'); if(!dlg.open)dlg.showModal(); panel.open=true;
    $('brain-status').dataset.error = 'true';
    $('brain-status').textContent = `未完成操作，原大脑未变。${e.message}。请按教程检查文件格式/配套文件，或重试网络；修正后可重新选择。`;
    $('brain-status').focus();
  } finally {
    busy = false; controls.forEach(el => { el.disabled = false; });
    panel.setAttribute('aria-busy', 'false'); $('brain-files').value = '';
  }
}
async function select(source) {
  if (window.browserPi?.busy) throw new Error('请先停止生成或等待加载完成，再换大脑');
  $('brain-status').textContent = '正在校验网表、线号和分词器…';
  const checked = await loadSource(source, fetch, progress);
  if (!await benchConfirm('校验通过。切换大脑会重载页面，未保存的编辑内容会丢失。', '切换并重载')) { $('brain-status').textContent = '已取消切换'; return; }
  await readSelection({...source, info:{nNand:checked.nl.gates-checked.nl.nLatch,nLatch:checked.nl.nLatch,mode:checked.net.outputMode}});
  location.reload();
}
$('brain-files').onchange = () => act(async () => {
  const files = [...$('brain-files').files];
  const manifest = files.some(f => f.name === 'netlist.json') ? 'netlist.json' : files.length === 1 ? files[0].name : null;
  if (!manifest) throw new Error('多文件请选择名为 netlist.json 的清单');
  await select({ files, manifest });
});
$('brain-url-load').onclick = () => act(() => select({ url: $('brain-url').value.trim() }));
$('brain-default').onclick = () => act(async () => {
  if (window.browserPi?.busy) throw new Error('请先停止生成或等待加载完成');
  if (!await benchConfirm('恢复默认大脑会重载页面，未保存的编辑内容会丢失。', '切换并重载')) return;
  await readSelection(null); location.reload();
});
for (const button of document.querySelectorAll('[data-preset]')) button.onclick = () => {
  if (button.dataset.preset === 'default') { $('brain-default').click(); return; }
  const preset = button.dataset.preset;
  panel.open = true;
  act(() => select({preset,url:new URL(preset === 'recall' ? './recall_latch.json' : './toolcall_demo.json',import.meta.url).href}));
};
function result(trace) {
  $('brain-output').textContent = JSON.stringify(trace, null, 1);
  $('brain-frame').replaceChildren(...frames.map((f,i)=>new Option(`#${i+1} · ${f.phase} · output ${f.output ?? 'bits→trace'} · Δ${f.changedBits}`,String(i))));
  $('brain-frame').value = String(frames.length-1);
  $('brain-frame-label').hidden = $('brain-inspect').hidden = false;
  inspect(false);
}
function inspect(scroll) {
  const frame=frames[Number($('brain-frame').value)]; if(!frame)return;
  window.dispatchEvent(new CustomEvent('brain-tick',{detail:frame}));
  if(scroll){
    document.getElementById('brain-dialog').close();
    if(matchMedia('(max-width: 760px)').matches&&document.body.classList.contains('sidebar-open'))$('sidebar-close').click();
    if($('bench-inspector').hidden)$('panel-toggle').click();
    $('gate-panel').open=true;
    const target=$('gate-observer');target.scrollIntoView({block:'center'});target.focus();
  }
}
$('brain-frame').onchange=()=>inspect(false);
$('brain-inspect').onclick=()=>inspect(true);
$('brain-run').onclick = () => act(async () => {
  loaded ??= await loadSource(selection ?? { url: DEFAULT_BRAIN_URL }, fetch, progress);
  const { nl } = loaded;
  const words = $('brain-ticks').value.trim().split(/\s+/);
  if (words.length > 256) throw new Error('一次最多输入 256 拍');
  const inputs = words.map(s => {
    if (!/^\d+$/.test(s)) throw new Error('逐拍输入请输入非负十进制整数，以空格分隔');
    const t = BigInt(s); if (t >= 1n << BigInt(nl.nIn)) throw new Error(`输入 ${s} 超出 ${nl.nIn} 位范围`); return t;
  });
  let state = nl.newState(); const trace = []; frames = [];
  for (const t of inputs) {
    const b = new Uint8Array(Math.ceil(nl.nIn / 8));
    for (let i = 0; i < b.length; i++) b[i] = Number(t >> BigInt(i * 8) & 255n);
    const r = measuredStep(nl, b, state); state = r.state;
    frames.push({...r.sample,phase:'manual',tick:frames.length+1});
    const out = r.out.reduce((a, bit, i) => a | BigInt(bit) << BigInt(i), 0n);
    trace.push({ input: String(t), output: String(out), state: [...state].join('') });
  }
  result(trace);
  $('brain-output').scrollIntoView({block:'nearest'});
  $('brain-status').textContent = `逐拍完成：${nl.gates - nl.nLatch} NAND / ${nl.nLatch} LATCH；${trace.length} 拍`;
});
$('brain-tool-demo').onclick=()=>act(async()=>{
  loaded ??= await loadSource(selection,fetch,progress);
  const {nl}=loaded;
  if(nl.nIn!==18||nl.nOut!==18||nl.nLatch!==558||nl.gates!==10141)throw Error('不是本次摘要机');
  let state=nl.newState(),token=220; const trace=[]; frames=[];
  for(let i=0;i<TOOL_CAPTURE.length+90;i++){
    const input=i<TOOL_CAPTURE.length?TOOL_CAPTURE[i]:token|(1<<17);
    const r=measuredStep(nl,Uint8Array.of(input&255,input>>8&255,input>>16),state);
    state=r.state;token=r.code&0x1ffff;
    frames.push({...r.sample,phase:'manual',tick:i+1});trace.push({input,output:r.code,tokenId:token});
  }
  result(trace);
  $('brain-status').textContent='摘要机112拍完成；在回看选择器查看捕获与回放';
});
$('bench-bit-run').onclick=()=>{
  const dlg=document.getElementById('brain-dialog'); if(!dlg.open)dlg.showModal(); panel.open=true;
  (selection?.preset==='toolcall'?$('brain-tool-demo'):$('brain-run')).click();
};
