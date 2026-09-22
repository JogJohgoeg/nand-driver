import { progressText } from './brain-source.js';
import './bench-lab.js';
const $ = id => document.getElementById(id);
$('bench-load-slot').append($('load'));
const more=$('bench-secondary');
$('bench-intro').after(more);
$('workspace-drawer').append($('workspace-panel'));
$('workspace-panel').querySelector('details.terminal').open=false;
more.append($('nt-scope'));
$('nt-scope').querySelector('summary').textContent='范围、证据与署名';
$('nt-scope').append(document.querySelector('.terminal-panel>footer'),document.querySelector('.setup-credits'));
const licenses=document.createElement('p');
licenses.innerHTML='<a href="./NOTICE" target="_blank" rel="noopener">NOTICE</a> · <a href="./brain/MAKE_A_BRAIN.md" target="_blank" rel="noopener">制作大脑与依赖说明</a>';
$('nt-scope').append(licenses);
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
    $('bench-loading').setAttribute('aria-busy', 'true');
    $('bench-stage').textContent = '开始读取当前大脑 · 清单 → 网表下载/解压 → 校验 → 分词器';
    $('bench-error').hidden = $('bench-retry').hidden = true;
  }
  if (e.type === 'brain_progress') {
    $('bench-stage').textContent = progressText(e).stage;
    $('load').textContent=({manifest:'读清单…',records:'读取网表…',verify:'校验网表…',tokenizer:'准备分词器…'})[e.phase] ?? '加载中…';
    $('bench-bytes').textContent = progressText(e).bytes;
    const bar = $('bench-progress'); bar.hidden = false;
    if (e.fileTotal > 0) { bar.max = e.fileTotal; bar.value = e.fileBytes; }
    else bar.removeAttribute('value'); // Unknown length is not a made-up percentage.
  }
  if (e.type === 'loaded') {
    ready = true;
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
    $('bench-error').textContent = errorText(e.error) + '\n原因：' + e.error;
    $('bench-error').hidden = false;
    $('bench-loading').setAttribute('aria-busy', 'false');
    $('bench-retry').hidden = ready;
    more.open=$('bench-loading').open=true;
    $('bench-error').focus();
  }
  if (e.type === 'agent_event' && e.event.type === 'tool_execution_end') {
    const t = e.event;
    $('bench-run-status').textContent = `实际执行：${t.toolName} ${t.isError ? '未成功，请查看返回原因' : '已返回'}。这不等于理解了自然语言参数。`;
    $('bench-result').hidden = false;
    $('bench-tool-result').textContent = JSON.stringify(t, null, 2);
  }
}
$('bench-retry').onclick = () => $('load').click();
$('bench-fill').onclick = async () => {
  const pi = window.browserPi;
  if (!pi) return;
  await pi.ready;
  if (pi.busy) { $('bench-run-status').textContent = '当前正在运行，请先停止或等待结束，再填入示例。'; return; }
  if (pi.terminal.text.trim() && !confirm('输入区已有草稿。用所选示例替换？不会发送消息。')) return;
  pi.terminal.setDraft($('bench-example').value);
  more.open=false;
  $('conversation-panel').scrollIntoView({block:'start'});
  $('bench-run-status').textContent = '示例已填入终端，按 Enter 发送。不会自动执行，也不会替换真实返回。';
};
$('new-chat').addEventListener('click', () => {
  if (window.browserPi?.busy) return;
  $('bench-result').hidden = true;
  $('bench-run-status').textContent = '新对话 · 选择示例后按 Enter，等待本次实际结果。';
});
$('workspace-drawer').addEventListener('toggle',()=>{
  $('workspace-toggle').setAttribute('aria-expanded',String($('workspace-drawer').open));
});
