# Pi browser workspace - with impossible LLM as its brain, plus a NAND netlist tool

**2026-09-16: the model is replaced.** MiniCPM5-2B no longer runs here. Every token of Pi's reply is one
evaluation of the NAND netlist of [impossible LLM](../impossibleLLM/) - since v2 5,142,875 gates, 0 latches,
106 inputs (last 6 MiniCPM5 tokens x 17 bits + 4 random bits that pick among the teacher's most frequent
answers), 13 outputs = index into 8,192 token ids - gate by gate on the CPU (about 10 ms per token). No
weights are downloaded and no WebGPU is needed. The netlist records are loaded from `../impossibleLLM/netlist.bin`. Files:

- `brain/netlist-brain.js` - NEW. Loads `../impossibleLLM/{netlist.json,tokenizer.json,tokenizer_config.json,top8192.json}`,
  decodes the netlist, and exposes a `generate()` with the subset of the transformers.js contract the agent worker uses.
  The reply continues the user's last message (a 6-token window over the chat template would always see the same tail),
  skips the thinking phase, and stops after 48 tokens.
- `brain/chat_template.jinja` - the MiniCPM5 chat template (sha256 48636aba..., same file as the upstream ONNX repo), used
  only for the context-budget check.
- `assets/agent.worker-CS8jL-AS.js` - the model loader and the `generate()` call now go to the netlist brain; the model-cache
  check always reports ready (nothing to download).
- `assets/index-DnXFGQ8z.js`, `index.html` - labels (NAND instead of WebGPU, impossible LLM instead of MiniCPM5-2B) and the scope note.

Checked (v2): netlist = table semantics on 5.5M inputs, 0 mismatches (C evaluator); the in-page JS evaluator = reference
on 4,000 inputs; tokenization and packing = offline pipeline on 200/200 reference prompts; real Chrome: loads without a
download dialog, replies stream, 0 console errors. Limits: incoherent and language-mixing output, never emits tool calls
(so the agent cannot use the shell or `nand_step`), not on chain. v1 (54,147 gates, greedy) is archived at
`../impossibleLLM/v1/`.

---


This is a **derivative** of the HuggingFace Space **Pi browser workspace - MiniCPM5-2B** (MiniCPM5-2B-WebGPU-Pi). The upstream Space is reproduced unchanged; this build adds exactly one thing the Space cannot do: a tool the in-browser agent can call, whose implementation is a real 386-gate NAND netlist evaluated gate by gate in a Web Worker.

## Attribution (upstream)

- Upstream Space: https://huggingface.co/spaces/townbox/MiniCPM5-2B-WebGPU-Pi (Apache-2.0)
- This clone was taken from victor/MiniCPM5-2B-WebGPU-Pi, which mirrors that Space.
- Upstream credits (see NOTICE, kept verbatim):
  - **OpenBMB** - the MiniCPM5-2B model weights (fetched at runtime from the HF Hub, about 1.84 GB q4f16; not shipped here).
  - **earendil-works** - the Pi agent that runs in the browser.
  - **Vercel** - just-bash, the virtual filesystem/shell the agent drives.
  - **HuggingFace Transformers.js + Microsoft ONNX Runtime** - in-browser inference on WebGPU.

The upstream notice is preserved in NOTICE, and the top of the page itself carries this attribution (the #nt-credit chip in index.html, added by this build).

## What this build adds (and changes)

Only these files are additions or modifications of upstream:

- assets/nand.worker.js - the netlist evaluator: 386 NAND gates, 14 inputs, 3 outputs, evaluated in index order over a wire table. On load it exhaustively self-checks all 11^4 = 14,641 legal (agent, target) states against an independent reference implementation plus the grid-navigation policy invariants (NOOP exactly at the target, else strictly distance-decreasing).
- assets/chain-check.js - a read-only on-chain cross-check. The same netlist is burned on BNB Chain as cid 287 of the CPU contract 0x6Fb4089e7Cbaa9660Fd11056274Cbd8117EE5B38. This module re-evaluates that on-chain circuit with a plain eth_call (no signature, no gas, no wallet), decodes the output bits, and reports whether the chain agrees with the in-browser evaluation. It never throws: any RPC failure comes back as an explicit unavailable marker so the in-browser result still returns.
- assets/agent.worker-CS8jL-AS.js - the upstream bundle with one surgical splice: the tool list gains nand_step as its first entry, preceded by a small bridge that owns the worker and formats results. Upstream code is otherwise byte-identical apart from that insertion (pristine original kept at /tmp/pispace/assets/agent.worker-CS8jL-AS.js).
- index.html - only the attribution chip, the scope-note panel, and the self-check badge.
- NAND-TOOL.md - full documentation of the tool, bit conventions, and verification status.

## Runtime requirements (what must ship)

Everything else is upstream and required for the app to run:

    assets/agent.worker-CS8jL-AS.js        2.1 MB   the app (spliced)
    assets/index-DnXFGQ8z.js               763 KB   main page module
    assets/index-CLisF1Ml.css              334 KB   styles
    assets/editor-highlight.worker-*.js     61 KB   editor syntax worker
    assets/nand.worker.js                   28 KB   this build
    assets/chain-check.js                  5.6 KB   this build
    runtime/ort-wasm-simd-threaded.asyncify.mjs   47 KB   ONNX Runtime loader
    runtime/ort-wasm-simd-threaded.asyncify.wasm  23.6 MB  ONNX Runtime (asyncify path)
    assets/ort-wasm-simd-threaded.asyncify-DMmc6YqF.wasm  23.6 MB  same bytes, hashed copy

Both 23.6 MB wasm copies are byte-identical (same Git-LFS oid) and both filenames appear in the bundle (the runtime/ un-hashed name 3x, the assets/ hashed name 2x), so both are candidates for the fetch ORT resolves at load time. Until one browser Network observation settles which URL actually 200s, do not delete either. Dropping the wrong one costs a broken model load; dropping the right one saves 23.6 MB.

Images (empty-cat-v1.png 668 KB, modal-cat-v1.png 513 KB, social-thumbnail-v3.png 2.1 MB) are upstream UI assets; keep them.

## Status of the on-chain check

Verified standalone under node: 24 states spread across the 11x11 grid, all 24 chain answers agree with the in-browser netlist, 0 disagreements, 0 unavailable, about 100 ms per eth_call (step gas 937,314). See NAND-TOOL.md for the repro recipe.

## License

Apache-2.0, inherited from the upstream Space. Model weights remain under their own license and are fetched at runtime, never shipped.
