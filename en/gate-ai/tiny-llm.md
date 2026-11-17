# A tiny language model

> impossible LLM v2: one netlist of 5,142,875 NAND gates. It reads the last 6 tokens and writes the next token in one evaluation.

::: buttons
- [Try it in your browser](https://nand.aihashrate.stream/impossibleLLM/)
- [v1 archive](https://nand.aihashrate.stream/impossibleLLM/v1/)
:::

## How to use it

1. Open the page and wait for it to load the netlist (7.9 MB compressed, 36 MB unpacked) and the tokenizer (about 2 MB).
2. Type a beginning in the input box and click "Generate 48 tokens".
3. Tick "Greedy" to fix the random bits at 0. The same beginning then writes the same text every time.

Everything is computed gate by gate in the browser. There is no backend.

## How it works

For each token it writes: it takes the numbers of the last 6 tokens (102 bits) plus 4 random bits, runs them through 5,142,875 gates, and gets a 13-bit code, which is one of 8,192 common tokens.

- The structure is a 6-level back-off lookup: first look up the last 6 tokens; if there is no entry, back off to 5, and so on down to 1.
- Each entry stores the 3 answers the teacher model (MiniCPM5-2B) gives most often in that context, and their shares. The random bits pick one by share.
- In the browser each token takes about 10 ms.

## Some numbers

| Item | Value |
|---|---|
| Gates | 5,142,875 NAND gates, 0 latches |
| Input / output | 106 bits / 13 bits |
| Teacher | MiniCPM5-2B, taking its most likely token |
| Training text | 10 million tokens of English Wikipedia, 8 million of web pages, 8 million of dialogue, 6 million of Chinese Wikipedia |
| Table entries | 293,717 |

## How often it matches the teacher

| Test text | v1 | v2 greedy | v2 sampled |
|---|---|---|---|
| English Wikipedia | 0.235 | 0.309 | 0.233 |
| Dialogue | 0.074 | 0.303 | 0.226 |
| Web pages | 0.116 | 0.241 | 0.177 |
| Chinese Wikipedia | 0.004 | 0.219 | 0.174 |

The teacher itself scores about 0.49 on Wikipedia (measured at v1). With 80 beginnings, each writing 48 tokens: v1 got stuck in short loops every time; v2 sampled, 0%.

## How it was checked

- The netlist matches the lookup rules bit for bit: all 293,717 entries × 16 random-bit values, 200,000 random inputs, and about 200,000 inputs from each of the four kinds of test text, with 0 mismatches.
- The evaluator in the page has 0 mismatches against the reference on 4,000 inputs.

## What it can't do

- It can't write coherent text. It only sees the last 6 tokens, so sentences often jump between Chinese, English, and code.
- Sometimes "�" shows up: a Chinese character is made of several bytes, and sometimes only part of it gets written.
- It can't call tools and has no memory.
- **It is not on chain.** By the container cost model, one step is about 11.6 billion gas, about 170 blocks, so in practice it can't run on chain. That cost model was only measured up to 5,300 gates; here it is extrapolated about 1,000 times.

## Next

- [What a large model on chain would cost](cost.md)
- [Gate brain](index.md): the whole BitCPM4-1B turned into gates, computed on the GPU.
