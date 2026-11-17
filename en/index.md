# 21 NAND docs

> We turn AI into the most basic logic gates and put them on a blockchain, so anyone can check them.

::: buttons
- [Quickstart](start/quickstart.md)
- [Run the model machine in your browser](machine/index.md)
- [Contract addresses](reference/contracts.md)
- [Layouts of our chips on chain](../gallery/en/index.md)
:::

## Latest

::: cards
- [Model machine: writes in your browser](machine/index.md) 11-04 · A toy binary model runs in the page and matches the reference implementation byte for byte.
- [The Bard: design files on chain](bard/fetch.md) 10-12 · The full layout is stored on X Layer; fetch it and check it byte for byte.
- [21 gates that drive](control/index.md) 09-08 · Circuit #279 is written on BNB Chain, and the arena scores cars by the circuit on chain.
:::

## Quickstart

Read the fingerprint recorded on chain for a file, then download the file and compute it yourself. If the two match, the file has not been changed. Read-only, no wallet.

```sh Read the sha256 recorded on chain (needs Foundry's cast)
cast call 0xd006ffdd5ae313b17729621a00999cd3c71ce5e6 \
  "fileInfo(address,string)(uint32,string,bytes32,uint40,uint256)" \
  0x39d97ab281f04a5bc3aCc562f8DeA3f0b4266aA3 home.css \
  --rpc-url https://bsc-rpc.publicnode.com
```

::: tabs
@@ macOS
```sh Download the same file and compute its sha256
curl -s https://282-732.aihashrate.stream/home.css | shasum -a 256
```
@@ Linux
```sh Download the same file and compute its sha256
curl -s https://282-732.aihashrate.stream/home.css | sha256sum
```
@@ Windows
```powershell Download the same file and compute its sha256
Invoke-WebRequest https://282-732.aihashrate.stream/home.css -OutFile home.css; Get-FileHash home.css -Algorithm SHA256
```
:::

If the two sha256 values are the same, it checks out. Step by step: see [Quickstart](start/quickstart.md).

## Where to go

::: cards
- [The Bard chip](bard/index.md) A language model that writes sentences in the style of children's stories, built directly as a chip.
- [Model machine](machine/index.md) A small computer that runs binary models.
- [Gate-level AI](gate-ai/index.md) A whole model turned into logic gates, computed in your browser.
- [Circuits that drive](control/index.md) 21 gates drive a car; 39 gates steer a little duck.
- [Build a circuit](build/index.md) Put your own small circuit on chain.
- [Reference](reference/contracts.md) Contract addresses, file formats, commands to check things.
:::

## Further reading

[The story of the Bard chip](https://x.com/zhuoning293/article/2109613608728465866), told by the person who built it.
