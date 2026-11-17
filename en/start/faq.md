# FAQ

> Is your computer good enough, do you need a wallet, can you buy the chip, does the token come with any rights.

## Do I need a wallet to check things?

No. All the commands in [Check it yourself](verify.md) are read-only. You only need a wallet to build your own circuit and put it on chain; see [Build a small circuit](../build/index.md).

## Can my computer run the gate brain?

When the page opens, it checks your computer first and tells you right away if it is not enough.

| Level | Setup | Speed |
|---|---|---|
| Runs | An ordinary laptop with 8 GB of memory, no dedicated graphics card | About 3 minutes the first time, then about 1.5 seconds per word |
| Runs comfortably | 16 GB of memory or more, a stronger graphics card | Can use "long answers", about 0.5 seconds per word |

- Browser: the latest Chrome or Edge on a computer. Safari needs version 18 or later, with WebGPU turned on in settings.
- Phones can't run it yet.
- Keep 2 to 4 GB of disk space free.

[Open the gate brain](https://nand.aihashrate.stream/gate/)

## Do I have to wait this long every time?

No. The first time, it builds the circuit on your computer and saves it; next time it is ready in ten to twenty-some seconds.

It has to rebuild when: we release a new version, you clear your browser data, you use a private window, or your disk is short of space.

## Does a run leave anything of mine on chain?

No. The gate brain runs only on your own computer, not on chain.

It is far too big: one word takes about 260 billion gates, while one circuit on BNB Chain has to be written in a single transaction and can hold only about 5,700 gates. So only small circuits go on chain.

## Has the Bard chip been made? Can I buy one?

- Not made yet, and not for sale.
- On 2026-10-12 the design passed every design rule check the factory requires, and the full design files were stored on X Layer.
- Which factory, how much it costs and when it will be made are all still undecided.
- What you can do now: [fetch the design files from the chain](https://1-2-245.aihashrate.stream/bard/v8g/) and check the fingerprints yourself.

## How is the Bard different from the gate brain?

- The gate brain: simulates logic gates on your computer's graphics card.
- The Bard: a chip meant to be made physically in a factory. The model has about 1 million parameters; the whole chip is 15 square millimeters.

## Can I turn my own small model into a circuit?

Technically yes, but our conversion tools are not ready for outside use yet, so there is no public tutorial for now.

- A reference cost: putting a circuit of about 3,800 gates on chain on X Layer cost about 0.0023 OKB net.
- If you use someone else's processor, you also buy transistors at that processor's price.
- Start with very small logic; for the steps see [Build a small circuit](../build/index.md).

## Does the token come with rights to the circuits, income or chips?

No.

- The token contract only defines how the trading fee is split: most goes to the project's circuit account, and a part is used for buybacks.
- Token holders have no contractual rights to the circuits, tool income or any future chip. There are no dividends and no revenue share.
- Buying transistors and opening a Container are usage fees for building circuits, not investments.

## What is the most useful way for anyone to take part?

- Try it and tell us how it went. In the gate brain page, "Settings → Test your computer" submits your speed in one tap; if you hit an error, send us the error message.
- Build a small circuit of your own and go through putting it on chain yourself.

## Glossary

| Term | Meaning |
|---|---|
| Gate / NAND | The most basic switching circuit. It outputs 0 only when both inputs are 1, and 1 otherwise. Every computation can be built from it. |
| Circuit | Many gates connected in order to do one job, such as adding or driving. |
| Transistor | The material on TapeOut. Each gate in a circuit uses one; you buy enough before going on chain. |
| Tape-out | Formally writing a circuit on chain. Once it is there, anyone can call it and check it. |
| Processor / CPU | A factory on TapeOut. Each has its own transistors and price; a circuit is taped out to a particular processor. |
| Container | The on-chain account every circuit comes with. It can receive payments and hold web files. This website lives in one circuit's Container. |
