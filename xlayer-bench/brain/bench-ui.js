import { progressText, readSelection } from './brain-source.js';
import { DEFAULT_BRAIN_URL } from './brain-config.js';
import './bench-lab.js';
import { benchConfirm } from './bench-dialog.js';
const $ = id => document.getElementById(id);
$('bench-load-slot').append($('load'));
const more=$('bench-secondary');
$('bench-sidebar').append(more);
$('chat-view').append(document.querySelector('main'));
$('tool-view').append($('bench-examples-panel'),$('workspace-drawer'));
$('chat-view').append($('bench-loading'));
$('workspace-drawer').append($('workspace-panel'));
$('workspace-panel').querySelector('details.terminal').open=false;
more.append($('nt-scope'));
$('nt-scope').querySelector('summary').textContent='范围、证据与署名';
$('bench-inspector').append($('chain-identity'));
$('chain-identity').open=true;
const gatePanel=document.createElement('details');gatePanel.id='gate-panel';
gatePanel.innerHTML='<summary>门级状态</summary>';
gatePanel.append(document.querySelector('.gate-pane'));
$('chain-identity').before(gatePanel);
$('nt-scope').append(document.querySelector('.terminal-panel>footer'),document.querySelector('.setup-credits'));
const licenses=document.createElement('p');
licenses.innerHTML='<a href="./NOTICE" target="_blank" rel="noopener">NOTICE</a> · <a href="./brain/MAKE_A_BRAIN.md" target="_blank" rel="noopener">制作大脑与依赖说明</a>';
$('nt-scope').append(licenses);
function sidebar(open) {
  document.body.classList.toggle('sidebar-open',open);
  $('sidebar-toggle').setAttribute('aria-expanded',String(open));
  $('sidebar-backdrop').hidden=!open;
  $('bench-sidebar').inert=matchMedia('(max-width: 760px)').matches&&!open;
  if(open)$('sidebar-search').focus();
  else $('sidebar-toggle').focus();
}
function inspector(open) {
  $('bench-inspector').hidden=!open;
  $('panel-toggle').setAttribute('aria-expanded',String(open));
}
function view(name) {
  $('chat-view').hidden=name!=='chat';$('tool-view').hidden=name!=='tools';
  for(const kind of ['chat','tools'])$('tab-'+kind).setAttribute('aria-pressed',String(name===kind));
  if(name==='chat')window.dispatchEvent(new Event('resize'));
}
$('sidebar-toggle').onclick=()=>sidebar(!document.body.classList.contains('sidebar-open'));
$('sidebar-close').onclick=$('sidebar-backdrop').onclick=()=>sidebar(false);
matchMedia('(max-width: 760px)').addEventListener('change',e=>{
  if(e.matches)sidebar(false);else {$('bench-sidebar').inert=false;$('sidebar-backdrop').hidden=true;document.body.classList.remove('sidebar-open');}
});
if(matchMedia('(max-width: 760px)').matches)$('bench-sidebar').inert=true;
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&document.body.classList.contains('sidebar-open'))sidebar(false);});
$('panel-toggle').onclick=()=>inspector($('bench-inspector').hidden);
$('inspector-close').onclick=()=>inspector(false);
if(matchMedia('(max-width: 760px)').matches)inspector(false);
for(const name of ['chat','tools'])$('tab-'+name).onclick=()=>view(name);
$('side-session').onclick=()=>{view('chat');if(matchMedia('(max-width: 760px)').matches)sidebar(false);};
const brainDialog=$('brain-dialog');
function openBrains(){
  if(matchMedia('(max-width: 760px)').matches&&document.body.classList.contains('sidebar-open'))sidebar(false);
  $('brain-picker').open=true;
  if(!brainDialog.open)brainDialog.showModal();
}
$('brain-dialog-close').onclick=()=>brainDialog.close();
brainDialog.addEventListener('click',e=>{if(e.target===brainDialog)brainDialog.close();});
$('brain-add').onclick=$('side-current').onclick=openBrains;
$('tab-new').onclick=()=>{$('new-chat').click();view('chat');};
$('tab-command').onclick=()=>{view('tools');$('workspace-drawer').open=true;$('workspace-panel').querySelector('details.terminal').open=true;$('command').focus();};
for(const button of document.querySelectorAll('[data-brain-preset]'))button.onclick=()=>{
  const preset=button.dataset.brainPreset;
  openBrains();
  document.querySelector(`[data-preset="${preset}"]`).click();
};
$('sidebar-search').oninput=e=>{
  const query=e.target.value.trim().toLocaleLowerCase();
  for(const item of document.querySelectorAll('[data-search]'))item.hidden=!item.dataset.search.toLocaleLowerCase().includes(query);
};
function selectedBrain(source) {
  const key=source?.preset ?? (source?'custom':'default');
  for(const preset of ['default','recall','toolcall']){
    const row=document.querySelector(`[data-brain-preset="${preset}"]`);
    row.classList.toggle('selected',preset===key);
    row.querySelector('.status-dot').classList.toggle('active',preset===key&&(source?.info?.mode==='bits'||ready));
    if(preset===key&&(source?.info?.mode==='bits'||ready))row.querySelector('time').textContent=new Intl.DateTimeFormat('zh-CN',{hour:'2-digit',minute:'2-digit'}).format(new Date());
  }
  $('side-current').hidden=key!=='custom';
  if(key==='custom'){
    $('side-current').querySelector('.status-dot').classList.toggle('active',source?.info?.mode==='bits'||ready);
    if(source?.info?.mode==='bits'||ready)$('side-current').querySelector('time').textContent=new Intl.DateTimeFormat('zh-CN',{hour:'2-digit',minute:'2-digit'}).format(new Date());
    $('side-source').textContent=source.files?`本地 · ${source.manifest??'netlist.json'}`:source.url;
  }
}
readSelection().then(source=>{
  selectedBrain(source);
  if(source?.info?.mode==='bits'){
    $('status-brain').textContent='● 位电路已选';
    netlistDetails();
  }
}).catch(()=>{});
$('session-time').textContent=`开始于 ${new Intl.DateTimeFormat('zh-CN',{hour:'2-digit',minute:'2-digit'}).format(new Date())}`;
async function netlistDetails() {
  try {
    const source=await readSelection();
    const url=source?.url ?? DEFAULT_BRAIN_URL;
    const file=source?.files?.find(f=>f.name===(source.manifest??'netlist.json'));
    const net=file?JSON.parse(await file.text()):await fetch(url,{credentials:'omit'}).then(r=>{if(!r.ok)throw Error(`HTTP ${r.status}`);return r.json();});
    const gates=Number(net.nGates??(net.nNand!=null&&net.nLatch!=null?net.nNand+net.nLatch:NaN));
    document.querySelector('.netlist-fields').hidden=$('detail-note').hidden=false;$('detail-empty').hidden=true;
    $('detail-gates').textContent=Number.isSafeInteger(gates)?gates.toLocaleString('en-US'):'— 未声明';
    $('detail-latches').textContent=Number.isSafeInteger(net.nLatch)?net.nLatch.toLocaleString('en-US'):'— 未声明';
    $('detail-tokenizer').textContent=typeof net.tokenizer==='string'?net.tokenizer:net.tokenizer?.type??'— 未声明';
    $('detail-source').textContent=file?`本地 · ${file.name}`:url;
    $('detail-sha').textContent=net.recordsSha256??'— 清单未声明';
    $('status-gates').textContent=Number.isSafeInteger(gates)?`${gates.toLocaleString('en-US')} 元件`:'— 元件';
  } catch(e) {$('detail-source').textContent=`无法读取清单：${e.message}`;}
}
const chainStatus=()=>{
  const status=$('chain-status').textContent;
  $('status-chain').textContent=status.startsWith('RPC 区块')?'X Layer · 只读已核验':
    status.includes('读取失败')?'X Layer · 读取失败':
    $('chain-read').disabled?'X Layer · 未部署 / 无 RPC':'X Layer · 已配置，未核验';
};
new MutationObserver(chainStatus).observe($('chain-status'),{childList:true,characterData:true,subtree:true});
chainStatus();
window.addEventListener('brain-tick',e=>{
  const s=e.detail;
  $('status-gates').textContent=`${s.gates.toLocaleString('en-US')} 元件`;
  $('status-flips').textContent=`Δ ${s.changedBits}/${s.nLatch}`;
  if(s.phase==='generation'&&s.elapsedMs>0)$('status-rate').textContent=`${(s.emitted*1000/s.elapsedMs).toFixed(2)} tok/s`;
  else if(s.phase==='manual'||s.phase==='stateless')$('status-rate').textContent='— tok/s';
});
let palette;
function colors() {
  const style=getComputedStyle(document.documentElement);
  palette=Object.fromEntries(['background','text','muted','accent','line','selected'].map(k=>[k,style.getPropertyValue('--'+k).trim()]));
}
colors();
// Adapt only presentation tokens in the pinned terminal, not its text/data.
export function benchColor(kind,background=false) {
  if(background)return kind==='accent'?palette.accent:kind==='selectedBg'?palette.selected:palette.background;
  if(kind==='userMessageBg')return palette.background;
  if(/accent|link$|success|error|warning/i.test(kind))return palette.accent;
  return /muted|dim|border|thinking|quote|toolOutput/i.test(kind)?palette.muted:palette.text;
}
export function benchTerminalTheme() {
  return {background:palette.background,foreground:palette.text,cursor:palette.accent,cursorAccent:palette.background,
    selectionBackground:palette.selected,selectionForeground:palette.text,
    ...Object.fromEntries(['black','red','green','yellow','blue','magenta','cyan','white','brightBlack','brightRed','brightGreen','brightYellow','brightBlue','brightMagenta','brightCyan','brightWhite'].map(k=>[k,/black/i.test(k)?palette.muted:palette.text]))};
}
function theme() {colors();window.browserPi?.terminal.refreshTheme();window.dispatchEvent(new Event('bench-theme'));}
window.addEventListener('bench-ready',theme);
matchMedia('(prefers-color-scheme: dark)').addEventListener('change',theme);
let ready = false;

function errorText(message) {
  if (/fetch|network|CORS|HTTP|timeout|Failed to load/i.test(message))
    return '大脑数据没能完整读取。请检查网络后重试，或在「换大脑」选择下载好的本地文件。';
  return '这次操作没有完成。可按下面的原因修正，或在「换大脑」恢复默认。';
}
export function onBenchEvent(e) {
  if (e.type === 'brain_tick') window.dispatchEvent(new CustomEvent('brain-tick',{detail:e}));
  if (e.type === 'busy' && e.action === 'load') {
    $('status-brain').textContent='◌ 正在加载大脑';
    $('bench-loading').setAttribute('aria-busy', 'true');
    $('bench-stage').textContent = '开始读取当前大脑 · 清单 → 网表下载/解压 → 校验 → 分词器';
    $('bench-error').hidden = $('bench-retry').hidden = true;
  }
  if (e.type === 'brain_progress') {
    $('bench-stage').textContent = progressText(e).stage;
    const pct=e.phase==='records'&&e.fileTotal>0?` ${Math.min(99,Math.floor(e.fileBytes*100/e.fileTotal))}%`:'';
    $('load').textContent=(({manifest:'读清单…',records:'读取网表…',verify:'校验网表…',tokenizer:'准备分词器…'})[e.phase] ?? '加载中…')+pct;
    $('bench-bytes').textContent = progressText(e).bytes;
    const bar = $('bench-progress'); bar.hidden = false;
    if (e.fileTotal > 0) { bar.max = e.fileTotal; bar.value = e.fileBytes; }
    else bar.removeAttribute('value'); // Unknown length is not a made-up percentage.
  }
  if (e.type === 'loaded') {
    ready = true;
    const active=document.querySelector('.brain-tree .selected:not([hidden])')??$('side-current');
    active.querySelector('.status-dot').classList.add('active');
    active.querySelector('time').textContent=new Intl.DateTimeFormat('zh-CN',{hour:'2-digit',minute:'2-digit'}).format(new Date());
    $('status-brain').textContent='● 大脑已就绪';
    netlistDetails();
    document.body.dataset.brain='ready';
    $('bench-stage').textContent = '大脑已就绪 · 网表采样 token 在本浏览器逐门计算';
    $('bench-loading').setAttribute('aria-busy', 'false');
    $('bench-progress').hidden = $('bench-error').hidden = $('bench-retry').hidden = true;
    $('bench-bytes').textContent += ' · 可以填入示例，按 Enter 发送。';
  }
  if (e.type === 'idle') {
    window.dispatchEvent(new Event('brain-idle'));
    $('bench-loading').setAttribute('aria-busy', 'false');
    if (!ready && !$('bench-progress').hidden) {
      $('bench-progress').hidden = true;
      $('bench-stage').textContent = '加载已结束但尚未就绪 · 可重试或换本地文件';
      $('bench-retry').hidden = false;
    }
  }
  if (e.error && e.errorName !== 'AbortError') {
    $('status-brain').textContent=ready?'● 已就绪 · 本次操作失败':'○ 加载失败';
    $('bench-error').textContent = errorText(e.error) + '\n原因：' + e.error;
    $('bench-error').hidden = false;
    $('bench-loading').setAttribute('aria-busy', 'false');
    $('bench-retry').hidden = ready;
    more.open=$('bench-loading').open=true;
    view('chat');
    if(matchMedia('(max-width: 760px)').matches)sidebar(false);
    $('bench-error').focus();
  }
  if (e.type === 'bench_tool_guard') {
    const why=e.repeat?'连续两次调用了完全相同的工具':`工具调用已达 ${e.rounds} 轮上限`;
    const msg=`已自动停止：${why}。这颗大脑还不会在工具返回后自己作答，结果见上方。`;
    import('./bench-i18n.js').then(m=>m.t(msg),()=>msg).then(text=>window.browserPi?.terminal.notice?.(text));
  }
  if (e.type === 'agent_event' && e.event.type === 'tool_execution_end') {
    const t = e.event;
    $('bench-run-status').textContent = `实际执行：${t.toolName} ${t.isError ? '未成功，请查看返回原因' : '已返回'}。这不等于理解了自然语言参数。`;
    $('bench-result').hidden = false;
    $('bench-tool-result').textContent = JSON.stringify(t, null, 2);
  }
}
$('bench-retry').onclick = () => $('load').click();
async function fillExample(text) {
  const pi = window.browserPi;
  if (!pi) return;
  await pi.ready;
  if (pi.busy) { $('bench-run-status').textContent = '当前正在运行，请先停止或等待结束，再填入示例。'; return; }
  if (pi.terminal.text.trim() && pi.terminal.text.trim() !== text && !await benchConfirm('输入区已有草稿，用这个示例替换吗？不会发送消息。', '替换')) return;
  pi.terminal.setDraft(text);
  more.open=false;
  view('chat');
  $('conversation-panel').scrollIntoView({block:'start'});
  $('bench-run-status').textContent = '示例已填入终端，按 Enter 发送。不会自动执行，也不会替换真实返回。';
}
$('bench-fill').onclick = () => fillExample($('bench-example').value);
for (const chip of document.querySelectorAll('[data-example]')) chip.onclick = () => fillExample(chip.textContent);
$('new-chat').addEventListener('click', () => {
  if (window.browserPi?.busy) return;
  $('bench-result').hidden = true;
  $('bench-run-status').textContent = '新对话 · 选择示例后按 Enter，等待本次实际结果。';
  $('session-time').textContent=`开始于 ${new Intl.DateTimeFormat('zh-CN',{hour:'2-digit',minute:'2-digit'}).format(new Date())}`;
});
$('workspace-drawer').addEventListener('toggle',()=>{
  $('workspace-toggle').setAttribute('aria-expanded',String($('workspace-drawer').open));
});
