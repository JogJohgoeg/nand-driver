# 21 NAND 文档

> 把 AI 做成最基础的门电路，放上区块链，谁都能自己核对。

::: buttons
- [快速上手](../start/quickstart.md)
- [在浏览器里跑模型机](../machine/index.md)
- [合约地址](../reference/contracts.md)
- [链上芯片的版图](../gallery/index.md)
:::

## 最新

::: cards
- [模型机：浏览器里出字](../machine/index.md) 11-04 · 玩具二值模型在页面里运行，和参考实现逐字节一致。
- [吟游诗人：设计图上链](../bard/fetch.md) 10-12 · 完整版图存在 X Layer，取回可逐字节核对。
- [21 个门开车](../control/index.md) 09-08 · 电路 #279 写上 BNB Chain，竞技场按链上电路评分。
:::

## 快速上手

从链上读出一个文件登记的指纹，再下载这个文件自己算。两边一样，就说明没被改过。只读，不用钱包。

```sh 读链上登记的 sha256（要装 Foundry 的 cast）
cast call 0xd006ffdd5ae313b17729621a00999cd3c71ce5e6 \
  "fileInfo(address,string)(uint32,string,bytes32,uint40,uint256)" \
  0x39d97ab281f04a5bc3aCc562f8DeA3f0b4266aA3 home.css \
  --rpc-url https://bsc-rpc.publicnode.com
```

::: tabs
@@ macOS
```sh 下载同一个文件，自己算 sha256
curl -s https://282-732.aihashrate.stream/home.css | shasum -a 256
```
@@ Linux
```sh 下载同一个文件，自己算 sha256
curl -s https://282-732.aihashrate.stream/home.css | sha256sum
```
@@ Windows
```powershell 下载同一个文件，自己算 sha256
Invoke-WebRequest https://282-732.aihashrate.stream/home.css -OutFile home.css; Get-FileHash home.css -Algorithm SHA256
```
:::

两个 sha256 一样就对了。详细步骤见[快速上手](../start/quickstart.md)。

## 入口

::: cards
- [吟游诗人芯片](../bard/index.md) 写儿童故事风格句子的语言模型，直接做成芯片。
- [模型机](../machine/index.md) 跑二值模型的小电脑。
- [门电路 AI](../gate-ai/index.md) 整个模型换成门电路，在浏览器里算。
- [会开车的电路](../control/index.md) 21 个门开车，39 个门给小鸭转向。
- [做电路](../build/index.md) 把自己的小电路放上链。
- [参考](../reference/contracts.md) 合约地址、文件格式、核对命令。
:::
