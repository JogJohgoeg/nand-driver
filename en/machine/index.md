# Model machine

> A small computer that runs binary models. Each weight is just on or off, and this page can run a toy model.

## Run it here

<div class="demo">
<p><button class="btn primary" id="run" type="button" disabled style="display:inline-grid;text-align:center"><span style="grid-area:1/1">Write 200 characters</span><span style="grid-area:1/1;visibility:hidden" aria-hidden="true">Write 200 characters</span><span style="grid-area:1/1;visibility:hidden" aria-hidden="true">Write 200 more</span><span style="grid-area:1/1;visibility:hidden" aria-hidden="true">Writing…</span><span style="grid-area:1/1;visibility:hidden" aria-hidden="true">Stop</span></button> <label class="btn" style="cursor:pointer">Use another .tbw1<input type="file" id="file" accept=".tbw1" hidden></label></p>
<pre class="demo-out" aria-live="polite"><span class="p" id="prompt"></span><span id="gen"></span></pre>
<p class="demo-facts">File <span id="f-file">toy_bmlp.tbw1 · 102,400 B</span> · <span id="f-shape">24-byte context · 2 binary layers of 512 · 524,288 one-bit weights</span><br>File sha256 <span id="f-sha" data-reg="11c1c4b177a2308ee64732335335e044e4cf32ce0ddef75210b0d5fa4f5ed568">11c1c4b177a2308ee64732335335e044e4cf32ce0ddef75210b0d5fa4f5ed568</span><span id="f-sha-st" style="display:block">(registered value, checking…)</span><br>Output sha256 <span id="f-out" data-reg="0aef22dfb94c5a76f0aa1eba5ac3f3a1852ba1982a1965a5235b696579a7acca">0aef22dfb94c5a76f0aa1eba5ac3f3a1852ba1982a1965a5235b696579a7acca (200 B)</span><span id="f-out-st" style="display:block">(reference answer; checked after 200 characters)</span><span id="f-speed">—</span></p>
</div>
<script src="../../machine/bmlp.js" defer></script>
<script src="../../machine/demo.js" data-model="../../machine/toy_bmlp.tbw1" defer></script>

Everything is computed in your browser: no server connection, nothing on chain, no wallet.

## Check it yourself

1. Look at "File sha256" above. It should be `11c1c4b177a2308ee64732335335e044e4cf32ce0ddef75210b0d5fa4f5ed568`.
2. Click "Write 200 characters" once. "Output sha256" should be `0aef22dfb94c5a76f0aa1eba5ac3f3a1852ba1982a1965a5235b696579a7acca`.
3. Run it again on another computer or in another browser. The result is the same. The page uses integer arithmetic only.

## What it is

- A binary model: each weight is only +1 or −1, so multiplying becomes "compare two bits, then count the matches".
- We designed the circuits ourselves: processor core, binary multiply-add unit, memory controller, display and serial port. So far they run in simulation. No physical board exists yet.
- At boot it fetches the runtime and the model from a tape container, and checks each fingerprint and signature. If a check fails, it goes back to the last version that worked.

## This toy model

| Item | Value |
|---|---|
| Size | 102,400 bytes |
| Looks back | 24 bytes |
| Hidden layers | Two, with 512 binary units each |
| One-bit weights | 524,288 |
| Training text | Stories written by the Bard's model, originally from tiny-tiny-stories (MIT) |

It exists only to run the whole path end to end. The English it writes doesn't read smoothly yet.

## Progress

- Done: fetch, check, start the runtime and write text, in the emulator and in circuit simulation, byte for byte identical to the reference implementation.
- Done: on an ordinary computer, the same boot loader runs a ternary model with 1.7 billion parameters (Bonsai from Prism ML, Apache-2.0), and the output is the same as running it directly.
- Not done yet: running on a real board, measuring speed on real hardware.
