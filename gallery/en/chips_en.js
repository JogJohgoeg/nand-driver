// English text for the gallery's chip list. Loaded after ../chips.js and overwrites every field the pages show.
(function () {
  var G = window.GALLERY;
  var LAY = function (die, what, extra, drive) {
    return 'Real SKY130A layout (the on-chain netlist instantiated gate by gate in sky130 standard cells → OpenROAD place and route, DRC/LVS/antenna all 0 → rendered in KLayout). Die ' + die + '; ' + (extra || '') + 'all ' + what + ' on chain are placed in the layout, each gate in a cell of the same name' + (drive ? ' (some swapped to nand2_2/4/8 for more drive, same name)' : '') + '. Layout display only; no timing sign-off.';
  };
  var CATS = { drive: 'Arena and robot drivers', agent: 'Agent control', lm: 'Language models', kit: 'Computing components', site: 'Website containers', chip: 'Chip layouts', board: 'Circuit boards' };
  var T = {
    'bard': { name: 'The Bard · full-chip layout v8g', desc: 'A small language model built directly as a gate-level circuit (tiny-stories integer version INT-C16). SKY130A full-chip routing, 3.167 × 4.767 mm, full-chip sign-off DRC 0, LVS matches; research version, not taped out. The sign-off layout is stored in X Layer 1.2.245.tape.',
      links: ['Fetch the layout from chain'], imgCap: 'Eighth version, full view (rendered in KLayout). The lower 3 rows × 20 columns are 60 mask ROM macros holding the model weights; above and at the sides is the main body of the chip (about 190,000 gates, 80,000 flip-flops).' },
    'bard-storybox': { name: 'BardStoryBox story machine · PCB', where: 'Our own board · not fabricated', desc: 'A small ESP32-S3 story machine board for the Bard: 41 × 51 mm, two layers, schematic and PCB DRC both 0; not fabricated.',
      imgCap: 'Real PCB 2D render from EasyEDA Pro: top layer red, bottom layer blue, silkscreen yellow; the ESP32-S3 module antenna sticks out past the board.' },
    'xc7a100t-miniboard': { name: 'XC7A100T small board · PCB', where: 'Our own board · not fabricated', desc: 'An Artix-7 FPGA small board we drew ourselves, to run the chip on an FPGA first: 4 layers, 111 parts, PCB DRC 0; not fabricated.',
      imgCap: 'Real PCB render from EasyEDA Pro (finished version), with GND copper pour on the top and bottom layers.' },
    '279.732': { name: 'NAND driver v1 · car controller', desc: 'A car controller of 21 NAND gates (DLGN training), entry 0 in season 0 of the NAND driving arena.', links: ['Arena demo'], imgCap: LAY('32.8 × 32.8 µm', '21 NAND', '', 1) },
    '280.732': { name: 'NAND driver v2b · with memory', desc: 'A variable-speed track driver of 87 NAND + 3 LATCH; with memory it finishes the track in 3,943 steps, a purely reactive one takes 8,826.', links: ['Arena demo'], imgCap: LAY('40.96 × 40.96 µm', '87 NAND and 3 LATCH', '', 1) },
    '281.732': { name: 'Microduck steering brain', desc: 'A steering brain of 39 NAND, sitting on top of the Microduck two-legged walking model and deciding which way to go.', links: ['Duck demo'], imgCap: LAY('35.52 × 35.52 µm', '39 NAND', '', 1) },
    '282.732': { name: 'Combined brain Part B · 21nand site container', desc: 'A memory override circuit of 22 NAND + 3 LATCH (forms the combined brain with #281); its container is 282.732.tape, where the 21nand site lives.', imgCap: LAY('32.8 × 32.8 µm', '22 NAND and 3 LATCH', '', 1) },
    '900283.732': { name: 'Agents-API session controller v2', desc: 'An agent session state machine of 264 NAND + 18 LATCH that manages turns, tool calls and subagents.' },
    '900284.732': { name: 'Agents-API session controller v3', desc: 'The public session controller, 325 NAND + 25 LATCH: turns, retries, subagents and compactions all have circuit breakers, and 16 safety properties are proven by SAT.' },
    '285.732': { name: 'TapeoutLLM one-step model · sampler v0.1', desc: 'A one-step language model of 5,069 NAND, the first time a whole language model was taped out on chain; every character it produces is really executed by a BSC node through eth_call. The output is mostly strings of words, not yet sentences.', links: ['Text continuation demo'], url0: '../../lm/index.html?lang=en', imgCap: LAY('257 × 257 µm (0.066 mm²)', '5,069 NAND', '', 1) },
    '286.732': { name: 'TapeoutLLM one-step model · sampler v0.2', desc: 'The second one-step model, 5,120 NAND (sampler v0.2); the demo page uses it by default.', links: ['Text continuation demo'], url0: '../../lm/index.html?lang=en', imgCap: LAY('258.2 × 258.2 µm (0.067 mm²)', '5,120 NAND', '', 1) },
    '287.732': { name: 'nand_step · 11×11 grid walking policy', desc: 'A path-finding policy of 386 NAND: give it your cell and the target cell, and it outputs the next direction; all 14,641 inputs tested exhaustively. A browser agent calls it as a tool; NAND plays Squared and "run one step on chain" in section 02 of the home page run it too.', links: ['NAND tool bench'], imgCap: LAY('68.16 × 68.16 µm', '386 NAND', '', 1) },
    '290.732': { name: 'Grid policy (distilled) · 11×11', desc: '375 NAND: the input is your position and the target position on an 11×11 grid (242 bits), the output is the next move (stop, down, up, left, right). Tested, it only moves down or up: of all 14,520 positions it reaches the target in just 636 (4.4%), worse than picking a random move each step. NAND plays Squared now uses 287.', links: [], imgCap: LAY('81.76 × 81.76 µm', '375 NAND') },
    '288.732': { name: 'Authenticator · website container', desc: 'A circuit of 1 NAND whose container holds the on-chain authenticator (a Google Authenticator clone; backups are encrypted with a passkey and stored on chain).' },
    '1.2.245': { name: '21 NAND Driver · TapeID container', desc: 'Circuit 1 on our own processor #245 (TapeID) on X Layer: a driver of 21 NAND; the container holds the TapeID site and also stores the sign-off layout of the Bard.', imgCap: LAY('32.8 × 32.8 µm', '21 NAND', 'the on-chain netlist is byte for byte identical to 279.732 and shares its layout; ') },
    '3.2.245': { name: '21nandkit DOT32_T · ternary dot product', desc: 'The first 21nandkit component on chain: a ternary dot product with 320-bit input and 32-bit output, 3,829 NAND; 8 spot checks on chain all correct.', imgCap: LAY('226.5 × 226.5 µm (0.051 mm²)', '3,829 NAND', '', 1) },
  };
  G.cats.forEach(function (k) { k.name = CATS[k.id] || k.id; });
  G.chips.forEach(function (c) {
    var t = T[c.tid] || {};
    c.name = t.name || c.tid; c.desc = t.desc || ''; if (c.where) c.where = t.where || '';
    c.imgCap = t.imgCap || ''; delete c.static; delete c.more;
    (c.links || []).forEach(function (l, i) { if (t.links && t.links[i]) l[0] = t.links[i]; if (i === 0 && t.url0) l[1] = t.url0; });
  });
})();
