// 两页共用：哪些芯片放进图库、卡片上写什么（写结果，不写实现）
export const G = window.GALLERY;
// 网站容器没有单独版图：不借别的芯片的图（1.2.245 的图和 279.732 字节相同，不拿来冒充）
export const CONTAINER = new Set(['288.732', '1.2.245']);
// 已上链但版图还在排队的
export const PENDING = [];   // 290.732 的版图 11-09 已补上，进了 chips.js
export function chips() {                    // 链上的在前（有版图的在最前），不上链的版图、板子在后
  const all = [...G.chips, ...PENDING.filter((p) => !G.chips.some((c) => c.tid === p.tid))];
  const rank = (c) => (c.chain ? 0 : 2) + (layoutPath(c) ? 0 : 1);
  return all.map((c, i) => [rank(c), i, c]).sort((a, b) => a[0] - b[0] || a[1] - b[1]).map((x) => x[2]);
}
export function where(c) { return c.chain ? `${G.chains[c.chain].name} #${c.id}` : (c.where || '不上链'); }
export function layoutPath(c) { return CONTAINER.has(c.tid) ? null : (c.img || null); }
export function esc(s) { return String(s).replace(/[&<>"]/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[m])); }
// 详情页标题下面那两行字：[一句人话, 原名和细节]。详情页脚本和构建时的预渲染（prerender.mjs）用同一个函数，两边逐字相同
export function descParts(c) { return [plain(c).say, `${c.name}${c.desc ? `：${c.desc}` : ''}`]; }
export function plural(n, unit) { return `${n.toLocaleString('zh-CN')} ${unit}`; }
// 卡片上的一句人话（卡片只写它做什么；门数、训练方法、步数这些细节放详情页）。
// short：芯片带和卡片标题用的短名；say：一句话说它做什么；go：演示按钮上的短字（完整名字放 title）
export const PLAIN = {
  'bard': { short: '吟游诗人', say: '写儿童故事风格句子的语言模型，句子常不连贯；直接做成了芯片版图。' },
  'bard-storybox': { short: '故事机小板', say: '给吟游诗人设计的故事机电路板，还没打样。' },
  'xc7a100t-miniboard': { short: '验证小板', say: '用来在芯片做出来之前先跑通电路的板子，还没打样。' },
  '279.732': { short: '小车控制器', say: '控制一辆小车在赛道上跑，是竞技场的第一位参赛者。', go: '看它跑' },
  '280.732': { short: '带记忆的小车', say: '能记住刚才发生了什么的小车控制器，跑得更快。', go: '看它跑' },
  '281.732': { short: '鸭子转向大脑', say: '替一只会走路的机器鸭子决定往哪边走。', go: '看鸭子走' },
  '282.732': { short: '组合大脑 · 官网', say: '给鸭子大脑加上记忆；21 NAND 官网也放在它这里。', go: '打开官网' },
  '900283.732': { short: '智能体管家 第 2 版', say: '帮智能体管对话轮次和工具调用，不让它乱来。', go: '看演示' },
  '900284.732': { short: '智能体管家 第 3 版', say: '公开版智能体管家：出错重试、调用次数都有上限。', go: '看演示' },
  '285.732': { short: '续写模型 第 1 版', say: '一个小语言模型，每个字都在链上算出来；写出来多是词串，还不成句。', go: '试试续写' },
  '286.732': { short: '续写模型 第 2 版', say: '续写模型的第二版，演示页默认用它。', go: '试试续写' },
  '287.732': { short: '走格子策略', say: '在格子地图上告诉你下一步往哪走，智能体拿它当工具。', go: '打开工具台' },
  '288.732': { short: '身份验证器', say: '放链上身份验证器网站的地方，类似手机上的两步验证码。', go: '打开网站' },
  '1.2.245': { short: 'TapeID 容器', say: 'X Layer 上的小车控制器；TapeID 网站和吟游诗人的版图存在这里。', go: '打开网站' },
  '3.2.245': { short: '三值点积', say: '一次把两串数对应相乘再加起来，给更大的电路当零件。' },
  '290.732': { short: '只会上下的格子电路', say: '想学会在格子里走到目标，实际只会往下或往上走；小游戏现在改用 287 号电路。' },
};
export const plain = (c) => PLAIN[c.tid] || { short: c.name, say: c.desc || '' };

// 门数：卡片小字和「适合从这里开始改」分区要先有数排序；页面打开后再从链上现场读，读到了就以链上为准
export const GATES = { '279.732': 21, '280.732': 90, '281.732': 39, '282.732': 25, '900283.732': 282, '900284.732': 350, '285.732': 5069,
  '286.732': 5120, '287.732': 386, '288.732': 1, '1.2.245': 21, '3.2.245': 3829, '290.732': 375 };
export const EASY_MAX = 100;   // 「适合从这里开始改」：已上链（网表谁都能读）、门数 ≤ 100、不是网站容器
// 首页分区：标题 + 一句说明 + 一行横滑卡片 +「看全部 N 个」
// 热门是我们自己挑的（还没有访问统计）；最近上链按 BNB Chain 电路编号倒排（编号越大上链越晚）
// 分区要么列 tids（按列出的顺序），要么给 pick + sort；limit 只截分区里那一行，「看全部」看 limit 之前的全部
export const SHELVES = [
  { id: 'hot', name: '热门', say: '第一次来，先看这几颗：能跑、能玩、能看懂。', tids: ['285.732', '279.732', '282.732', '287.732', 'bard', '281.732'] },
  { id: 'arena', name: '竞技场与小车', say: '在赛道上开小车、在格子里找目标，都由链上的门电路做决定。', tids: ['279.732', '280.732', '1.2.245', '287.732'] },
  { id: 'brain', name: '大脑', say: '替机器鸭子或智能体做决定的小电路。', tids: ['281.732', '282.732', '900283.732', '900284.732', '287.732'] },
  { id: 'lm', name: '语言模型', say: '把语言模型整颗做成门电路。吟游诗人写儿童故事风格的句子，常不连贯；另外两颗每个字都在链上算，写出来多是词串。', tids: ['285.732', '286.732', 'bard', 'bard-storybox'] },
  { id: 'site', name: '官网与工具', say: '放网站的容器、给别的电路当零件的组件，和跑通芯片用的板子。', tids: ['282.732', '288.732', '1.2.245', '287.732', '3.2.245', 'xc7a100t-miniboard'] },
  { id: 'easy', name: '适合从这里开始改', say: `门数少（不超过 ${EASY_MAX} 个），网表在链上谁都能读，改起来最容易看懂。`,
    pick: (c) => c.chain && !CONTAINER.has(c.tid) && (GATES[c.tid] ?? Infinity) <= EASY_MAX, sort: (a, b) => GATES[a.tid] - GATES[b.tid] },
  { id: 'new', name: '最近上链', say: 'BNB Chain 上按电路编号倒排，编号越大上链越晚。', pick: (c) => c.chain === 'bsc', sort: (a, b) => b.id - a.id, limit: 6 },
];
export function chainShelves(all) {        // 「按链看」：每条链一个分区，数量从数据算
  return Object.keys(G.chains).map((k) => ({ id: 'chain-' + k, name: G.chains[k].name, say: `${G.chains[k].name} 上的电路。`, pick: (c) => c.chain === k }))
    .filter((s) => all.some(s.pick));
}
export function shelfItems(s, all) {
  if (s.tids) return s.tids.map((t) => all.find((c) => c.tid === t)).filter(Boolean);
  const xs = all.filter(s.pick);
  return s.sort ? xs.sort(s.sort) : xs;
}

// 中文版分类名（中文页不留英文），chips.js 里的原名不动
export const CAT_ZH = { kit: '运算组件', board: '电路板' };
export const catName = (k) => CAT_ZH[k.id] || k.name;
// 能不能改：已上链的电路网表谁都能从链上读到，标「网表公开」；
// 只有仓库里查到许可文件的才写许可和「可以拿去改」。判定依据列在 README「能不能改」一节
export const LICENSE = { '3.2.245': 'MIT' };
export const openness = (c) => !c.chain ? '' : LICENSE[c.tid] ? `网表公开 · ${LICENSE[c.tid]} 许可，可以拿去改` : '网表公开';
// 中文页里卡片和分区说明允许出现的拉丁字母词（check.py 用同一份）：链名按站内中文版写法、站名、产品名、许可名
export const LATIN_OK = ['BNB Chain', 'X Layer', '21 NAND', 'TapeID', 'MIT'];

/* wait-tick:begin */
// Elapsed-time ticker for a real wait: start before the request, stop() when it settles.
function waitTick(node, label, more) {
  var t0 = performance.now(), span = document.createElement("span"), last = null, id = 0;
  span.setAttribute("aria-hidden", "true"); span.className = "tick";
  node.textContent = label; node.appendChild(span);
  function draw() { var t = " " + more(((performance.now() - t0) / 1000).toFixed(1)); if (t !== last) span.textContent = last = t; }
  draw(); id = setInterval(draw, 100);
  return { draw: draw, stop: function () { clearInterval(id); id = 0; } };
}
/* wait-tick:end */
export { waitTick };
