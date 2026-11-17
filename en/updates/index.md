# Progress

> What is done, what is in progress, and what we won't do. Every item has a date.

## Done

| Date | What we did | See |
|---|---|---|
| 2026-11-12 | The home page now picks Chinese or English from your browser language: if you chose a language before, that choice is kept; otherwise a Chinese browser gets Chinese and any other gets English | [Home page](../../index.md) |
| 2026-11-04 | Bard chip logic: the cycles needed for a long test (L3) dropped from 1,594,643 on 10-29 to 711,441 (the version merged on 11-04), and every word it writes is the same as before | [Process ladder](../bard/nodes.md) |
| 2026-11-04 | The model machine writes in your browser: a toy binary model runs in the page and matches the reference implementation byte for byte | [Run it in your browser](../machine/index.md) |
| 2026-11-04 | The model machine works end to end: fetch, check, start the runtime, write text, in both the emulator and the circuit simulation; it also recovers if power is cut halfway through installing | [Model machine](../machine/index.md) |
| 2026-11-04 | The same boot loader runs a 1.7-billion-parameter ternary model (Bonsai by Prism ML, Apache-2.0) on an ordinary computer, with output byte for byte identical to running it directly | [Model machine](../machine/index.md) |
| 2026-11-01 | Full-chip layout of the Bard on a 55 nm teaching-and-research process: from estimated parasitics, not extracted from the routed layout, the layout tool reports 86.89 MHz, detailed routing has 0 violations, 60/60 block-level LVS match; full-chip LVS is still running | [Process ladder](../bard/nodes.md) |
| 2026-10-30 | Checkable list: 16 of 17 items have a single command you can rerun yourself (about 94%) | [Commands you can check](../reference/commands.md) |
| 2026-10-30 | The model machine's own runtime, s6rt: 33–34 tokens per second with 4 threads on an x86 desktop, and 24 steps of output byte for byte identical to the golden reference | [A large model on a small computer](../machine/sbc.md) |
| 2026-10-29 | The model machine installs from blank: on an emulated blank arm64 machine, one command goes all the way through "fetch firmware → check → start the model → write the first word", with 0 manual steps | [Fetch firmware from the chain](../machine/tapeboot.md) |
| 2026-10-12 | Bard chip design finished: it passes every design rule check the factory requires; the full 11-million-byte design files are stored on X Layer and read back byte for byte identical | [Fetch and check](https://1-2-245.aihashrate.stream/bard/v8g/) |
| 2026-10-05 | The first AI math component on chain: a 3,829-gate computing circuit taped out to X Layer, and every spot check on chain computed correctly | [Check it yourself](../start/verify.md) |
| 2026-09-26 | The gate brain slimmed to about 1/5: the gates needed per word dropped from about 1.4 trillion to about 260 billion, with results bit for bit unchanged | — |
| 2026-09-24 | Gate-level AI answers on its own in the browser: the whole model turned into logic gates, bit for bit identical to the model's integer reference implementation | [Try it](https://nand.aihashrate.stream/gate/) |
| 2026-09-08 | "21 gates that drive" goes on chain: a 21-gate driving circuit taped out to BNB Chain, with an open circuit contest | [Arena](https://nand.aihashrate.stream/arena.html) |

> The dates of the three model machine items on 11-04 are the dates they were made public, not the dates each was finished.

## In progress

As of 2026-11-04. No completion dates.

- Bard chip logic: keep cutting cycles. Every round counts gates and cycles together as a net value, and only a value below 1 counts as progress.
- Bard full chip on 55 nm: full-chip LVS is still running; after it finishes come full-chip flat LVS and DRC.
- Where and when the Bard will be made: not decided yet.
- Model machine: not on a real board yet, so real-hardware speed has not been measured.

## Not doing, and not promising

- Putting a whole AI model on chain: it is ten million times larger than what one circuit on chain can hold.
- Adding dividends or rights to the token: token holders have no contractual rights of any kind; see [FAQ](../start/faq.md).
- A production date or sales for the Bard: until the factory and cost are settled, there is no timeline and no pre-orders.
- A public tutorial for converting circuits: the tools are not ready for outside use yet.
