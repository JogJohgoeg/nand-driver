# Gate brain

> The small model BitCPM4-1B, turned entirely into NAND gates. Your computer's GPU computes the answer gate by gate, bit for bit identical to the model's integer reference implementation.

::: buttons
- [Open the gate brain](https://nand.aihashrate.stream/gate/)
- [Progress](https://nand.aihashrate.stream/progress/)
:::

## What you need

- Chrome or Edge on a computer, latest version. It must support WebGPU (the browser uses the GPU to compute).
- 8 GB of memory or more, and a fairly recent GPU. Phones and tablets usually can't run it.
- The first time, you need to be online to download about 580 MB of model weights.

> If your device isn't enough, the page checks first and tells you. It doesn't download a single byte.

## How to use it

1. Open the page and click "Get ready".
2. Wait while it downloads the model and builds the gate circuit on your computer. This usually takes 2–8 minutes; newer computers are faster. Don't close the page while it gets ready.
3. When it's ready, type a question at the bottom and click "Ask".
4. Next time you open it, it's ready in a dozen seconds or so, even offline. The built circuit is kept in the browser's local storage.

Your questions are not sent to any server. Everything is computed on your computer.

## Some numbers

| Item | Value |
|---|---|
| Model | BitCPM4-1B (OpenBMB, Apache-2.0) |
| Gates computed per word | about 258.3 billion |
| "Memory switches" that hold the context | about 109 million |
| Question plus answer, at most | 128 tokens |
| Long-answer mode | about 512 tokens; needs a new setup, about 7.6 GB of memory, and each word is slower |
| First download | about 580 MB |

The page converts between text and token numbers itself. That part is not done in gates.

## How you know it computes correctly

- Three standard tests (two Q&A, one tool call) are compared with the reference implementation. Every word's number is the same. Each test runs once on first open and again on later opens.
- The reference is the integer version of this model. Against the official floating-point version, about half the answers are identical word for word (12–13 of 25); the rest mostly diverge after a dozen or so words and mean much the same.
- When we break a piece of the model file on purpose, the page sees the fingerprint doesn't match and refuses to run.
- Every change to the circuit first gets a formal equivalence proof or an exhaustive test, then the comparison above. If it isn't bit for bit identical, it doesn't go live.
- The page's "Settings → Run log" shows measured numbers for each answer. They stay only in your browser.


## Follow-up questions: tested, and it often loses the thread

The page sends the earlier questions and answers along with the next question, but the model often forgets what was said earlier. What we tested and what came out (2026-11-10):

| What was tested | Result | Line to pass | Verdict |
|---|---|---|---|
| 20 two-turn items where the second question cannot be answered without the first turn (default mode) | 12 / 20 right | 14 | Fail |
| The same second questions asked alone, without the earlier turn (control) | 1 / 20 right by luck | at most 4 | Pass |
| 10 four-turn dialogues, 3 questions each that need the earlier turns (long-answer mode) | 23 of 30 right; 8 dialogues with at least 2 right | all 10 with at least 2 right | Fail |
| Those 30 questions asked alone (control) | 4 / 30 right by luck | at most 6 | Pass |
| The same inputs run again in a fresh process | 40 / 40 answers identical token for token | 40 / 40 | Pass |

- For comparison: the official floating-point model, given this set of items, scored 14 / 20 on the first row and 9 / 10 dialogues on the third.
- Limits: tested on one machine with one graphics card, not in a browser, and only on this one set of items. Whether answers to follow-up questions match the reference implementation word for word was not tested (there is no reference output for follow-up questions).
- For a more reliable answer, press "Start over" and ask again.

## Progress

| Date | What happened |
|---|---|
| 2026-09-24 | The whole model turned into gates, answering on its own in the web page, bit for bit identical to the model's integer reference implementation |
| 2026-09-26 | Gates per word cut from about 1.4 trillion to about 260 billion, results still bit for bit the same |

> The whole model is not put on chain: it is ten million times larger than one on-chain circuit can hold. For the cost of running a large model on chain, see [What a large model on chain would cost](cost.md).

## Next

- [From graph to gates](ncd2net.md): compile a neural network diagram into a NAND netlist.
- [A tiny language model](tiny-llm.md): a language model with only 5.14 million gates.
