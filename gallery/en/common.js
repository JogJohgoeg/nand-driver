
export const G = window.GALLERY;

export const CONTAINER = new Set(['288.732', '1.2.245']);

export const PENDING = [];   
export function chips() {                    
  const all = [...G.chips, ...PENDING.filter((p) => !G.chips.some((c) => c.tid === p.tid))];
  const rank = (c) => (c.chain ? 0 : 2) + (layoutPath(c) ? 0 : 1);
  return all.map((c, i) => [rank(c), i, c]).sort((a, b) => a[0] - b[0] || a[1] - b[1]).map((x) => x[2]);
}
export function where(c) { return c.chain ? `${G.chains[c.chain].name} #${c.id}` : (c.where || 'Not on chain'); }
export function layoutPath(c) { return CONTAINER.has(c.tid) ? null : (c.img || null); }
export function esc(s) { return String(s).replace(/[&<>"]/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[m])); }

export function descParts(c) { return [plain(c).say, `${c.name}${c.desc ? `: ${c.desc}` : ''}`]; }
export function plural(n, unit) { return `${n.toLocaleString('en-US')} ${unit}`; }


export const PLAIN = {
  'bard': { short: 'The Bard', say: 'A language model that writes sentences in the style of children\'s stories, often incoherent, built directly as a chip layout.' },
  'bard-storybox': { short: 'Story machine board', say: 'A story machine circuit board designed for the Bard; not fabricated yet.' },
  'xc7a100t-miniboard': { short: 'Test board', say: 'A board for running the circuit before the chip exists; not fabricated yet.' },
  '279.732': { short: 'Car controller', say: 'Drives a small car around a track; the first entry in the arena.', go: 'Watch it drive' },
  '280.732': { short: 'Car with memory', say: 'A car controller that remembers what just happened, and drives faster.', go: 'Watch it drive' },
  '281.732': { short: 'Duck steering brain', say: 'Decides which way a walking robot duck goes.', go: 'Watch the duck' },
  '282.732': { short: 'Combined brain · site', say: 'Adds memory to the duck brain; the 21 NAND site lives here too.', go: 'Open the site' },
  '900283.732': { short: 'Agent manager v2', say: 'Keeps an agent\'s conversation turns and tool calls in line.', go: 'See demo' },
  '900284.732': { short: 'Agent manager v3', say: 'The public agent manager: retries and call counts all have limits.', go: 'See demo' },
  '285.732': { short: 'Text model v1', say: 'A small language model. Every character is computed on chain. The output is mostly strings of words, not yet sentences.', go: 'Try it' },
  '286.732': { short: 'Text model v2', say: 'The second version of the text model; the demo page uses it by default.', go: 'Try it' },
  '287.732': { short: 'Grid walking policy', say: 'Tells you the next move on a grid map; agents use it as a tool.', go: 'Open the tool bench' },
  '288.732': { short: 'Authenticator', say: 'Holds the on-chain authenticator site, like the two-step codes on your phone.', go: 'Open the site' },
  '1.2.245': { short: 'TapeID container', say: 'The car controller on X Layer; the TapeID site and the Bard layout are stored here.', go: 'Open the site' },
  '3.2.245': { short: 'Ternary dot product', say: 'Multiplies two lists of numbers pair by pair and adds them up; a part for larger circuits.' },
  '290.732': { short: 'Up-and-down grid circuit', say: 'Meant to learn to reach a target on a grid, but it only moves down or up; NAND plays Squared now uses 287.' },
};
export const plain = (c) => PLAIN[c.tid] || { short: c.name, say: c.desc || '' };


export const GATES = { '279.732': 21, '280.732': 90, '281.732': 39, '282.732': 25, '900283.732': 282, '900284.732': 350, '285.732': 5069,
  '286.732': 5120, '287.732': 386, '288.732': 1, '1.2.245': 21, '3.2.245': 3829, '290.732': 375 };
export const EASY_MAX = 100;   



export const SHELVES = [
  { id: 'hot', name: 'Popular', say: 'New here? Start with these: they run, you can play with them, and they are easy to follow.', tids: ['285.732', '279.732', '282.732', '287.732', 'bard', '281.732'] },
  { id: 'arena', name: 'Arena and cars', say: 'Cars on a track and moves on a grid, all decided by gate circuits on chain.', tids: ['279.732', '280.732', '1.2.245', '287.732'] },
  { id: 'brain', name: 'Brains', say: 'Small circuits that decide for a robot duck or an agent.', tids: ['281.732', '282.732', '900283.732', '900284.732', '287.732'] },
  { id: 'lm', name: 'Language models', say: 'Language models built whole as gate circuits. The Bard writes sentences in the style of children\'s stories that often don\'t hang together. The other two compute every character on chain and mostly produce strings of words.', tids: ['285.732', '286.732', 'bard', 'bard-storybox'] },
  { id: 'site', name: 'Sites and tools', say: 'Containers that hold websites, components for other circuits, and boards for trying out chips.', tids: ['282.732', '288.732', '1.2.245', '287.732', '3.2.245', 'xc7a100t-miniboard'] },
  { id: 'easy', name: 'Good places to start modifying', say: `Few gates (at most ${EASY_MAX}), and anyone can read the netlist on chain, so they are the easiest to follow.`,
    pick: (c) => c.chain && !CONTAINER.has(c.tid) && (GATES[c.tid] ?? Infinity) <= EASY_MAX, sort: (a, b) => GATES[a.tid] - GATES[b.tid] },
  { id: 'new', name: 'Recently on chain', say: 'On BNB Chain, by circuit number, highest first: a higher number went on chain later.', pick: (c) => c.chain === 'bsc', sort: (a, b) => b.id - a.id, limit: 6 },
];
export function chainShelves(all) {        
  return Object.keys(G.chains).map((k) => ({ id: 'chain-' + k, name: G.chains[k].name, say: `Circuits on ${G.chains[k].name}.`, pick: (c) => c.chain === k }))
    .filter((s) => all.some(s.pick));
}
export function shelfItems(s, all) {
  if (s.tids) return s.tids.map((t) => all.find((c) => c.tid === t)).filter(Boolean);
  const xs = all.filter(s.pick);
  return s.sort ? xs.sort(s.sort) : xs;
}


export const CAT_ZH = {};
export const catName = (k) => CAT_ZH[k.id] || k.name;


export const LICENSE = { '3.2.245': 'MIT' };
export const openness = (c) => !c.chain ? '' : LICENSE[c.tid] ? `Netlist public · ${LICENSE[c.tid]} license, free to modify` : 'Netlist public';

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
