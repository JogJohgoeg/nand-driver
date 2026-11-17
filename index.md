# 21 NAND

> 把 AI 做成门电路，放上链，谁都能核对。每个模块点开就能用，不用钱包；打开时自动和链上记录核对。

- [打开应用](app/)
- [看文档](start/index.md)

## 01 模型机在浏览器里出字

一个玩具模型在浏览器里一个字节一个字节往外写。写出来还不通顺，不是故事；页面每次都核对：写出的字节和标准输出逐字节相同。

**200 字**：每次写出的都和标准答案逐字节一致

[写 200 个字](app/#machine)

自己核对：

```sh
curl -s https://282-732.aihashrate.stream/machine/toy_bmlp.tbw1 | shasum -a 256
```

应输出 11c1c4b177a2308ee64732335335e044e4cf32ce0ddef75210b0d5fa4f5ed568（模型文件，和页面上写的一样）。这条命令核的是模型文件本身。写字时，页面自己算输出的指纹，和标准答案 0aef22df… 比。Linux 把 shasum -a 256 换成 sha256sum。 详见 [文档](machine/index.md)。

## 02 NAND 玩 Squared

链上的一块电路自己玩 11×11 小游戏。点「链上跑一步」，区块链用同一个局面再算一次。

**178 / 178**：链上算的和你浏览器里算的完全一样

[开始玩](app/#squared)

自己核对：

```sh
cast call 0x6Fb4089e7Cbaa9660Fd11056274Cbd8117EE5B38 \
  "circuitInfo(uint256)(uint32,uint32,uint32,uint32)" 287 \
  --rpc-url https://bsc-rpc.publicnode.com
```

应输出 14、3、0、386（输入位、输出位、锁存器、与非门）。这条命令读出链上第 287 号电路的形状：14 位输入、3 位输出、386 个门。另外 178 个局面逐个让链上算一步，结果都和浏览器里一样。 详见 [文档](control/squared.md)。

## 03 门电路大脑

在你自己的电脑上向一个小 AI 提问，一问一答。回答和这个模型的整数参考实现一字不差，问题不会离开你的电脑。用电脑上新版 Chrome 或 Edge；第一次下载约 580 MB，以后不用再下；浏览器要占约 6 GB 内存；手机打不开。

**3 / 3**：标准题的回答和整数参考实现逐字一致

[打开门电路大脑](https://nand.aihashrate.stream/gate/)

自己核对：

```sh
curl -s https://nand.aihashrate.stream/gate/evidence/2026-09-26-b31/check-cold.json \
  | grep -o '"pass": true' | wc -l
```

应输出 4（三道题各一个，加上总的一个）。这是门电路大脑公开的实测记录（2026-09-26）：三道标准题全部通过，每个字都和这个模型的整数参考实现相同。 详见 [文档](gate-ai/index.md)。

## 04 开车竞技场

一辆只靠 21 个门开车的小车，在弯道上自己绕圈。点一下就开，不用钱包。

**24 / 24**：固定起点全部跑完一圈

[开一圈](app/#arena)

自己核对：

```sh
cast call 0x6Fb4089e7Cbaa9660Fd11056274Cbd8117EE5B38 \
  "eval(uint256,bytes)(bytes)" 279 0xff7f \
  --rpc-url https://bsc-rpc.publicnode.com
```

应输出 0x02（右转）。这条命令让区块链用链上第 279 号电路算一步：输入 0xff7f，输出 0x02，意思是右转。竞技场里点「让链上也算这一步」做的是同一件事。 详见 [文档](control/arena.md)。

## 05 自己核对

应用打开每个模块时，都在后台把文件和链上记录比一遍，对上了才运行。你也可以挑任何一个文件自己比。

**217 / 217**：本站文件都登记在链上，下载下来逐字节一致

[核对一个文件](app/#verify)

自己核对：

```sh
curl -s https://282-732.aihashrate.stream/home.css | shasum -a 256
```

应输出 bd39b1d07903e4b607dd1fae25ab46d22c6038fe10100ce4ff966df694cd9873（和链上登记的一样）。用 curl 从 282-732.aihashrate.stream 下载，217 个文件个个和链上登记一致。Linux 把 shasum -a 256 换成 sha256sum。 详见 [文档](start/verify.md)。

## 06 做电路

挑一个小电路，先在浏览器里把所有输入都试一遍，再用你的钱包写上链；之后谁都能运行、核对。只有这一步要用钱包。

**3,829 门**：我们放上链的一个计算电路，谁都能查到

[开始做电路](app/build.html)

自己核对：

```sh
cast call 0xA93E807fAB41431827EBBa57443Fb687a95E2AA3 \
  "circuitInfo(uint256)(uint32,uint32,uint32,uint32)" 3 \
  --rpc-url https://rpc.xlayer.tech
```

应输出 320、32、0、3829（输入位、输出位、锁存器、与非门）。这条命令读出 X Layer 上电路 3.2.245 的形状：320 位输入、32 位输出、3,829 个门。 详见 [文档](build/index.md)。

## 链上芯片

真实版图，点开看详情；[看全部芯片](gallery/)。

- [续写模型 第 1 版](gallery/chip.html?tid=285.732)：5,069 门 · BNB Chain #285
- [小车控制器](gallery/chip.html?tid=279.732)：21 门 · BNB Chain #279
- [组合大脑 · 官网](gallery/chip.html?tid=282.732)：25 门 · BNB Chain #282
- [走格子策略](gallery/chip.html?tid=287.732)：386 门 · BNB Chain #287
- [鸭子转向大脑](gallery/chip.html?tid=281.732)：39 门 · BNB Chain #281
- [带记忆的小车](gallery/chip.html?tid=280.732)：90 门 · BNB Chain #280

## 最近

- 2026-11-12 入口页现在会按浏览器语言选中英文：你选过语言就用你选的，没选过就看浏览器报的语言（中文用中文，其他用英文）
- 2026-11-04 吟游诗人芯片逻辑：跑一个长测试（L3）要的拍数从 10-29 的 1,594,643 降到 711,441（11-04 已合并的版本），写出的每个字都和原来一样
- 2026-11-04 模型机在浏览器里出字：玩具二值模型在页面里运行，和参考实现逐字节一致

## English

> Turn AI into logic gates, put it on chain, let anyone check it. Every module works with one tap and needs no wallet; each file is checked against its on-chain record before it runs.

- [Open app](app/)

### 01 A model that writes in your browser

A toy model runs in your browser and writes one byte at a time. The text is not fluent and not a story. Each run, the page checks that the bytes match the reference output exactly.

**200 chars**: identical to the reference output, byte for byte, every time

[Write 200 characters](app/#machine)

### 02 NAND plays Squared

A circuit on chain plays an 11×11 game by itself. Tap "Run one step on chain" and the blockchain computes the same move again.

**178 / 178**: the chain and your browser computed exactly the same moves

[Play](app/#squared)

### 03 Gate brain

Ask a small AI questions on your own computer, one at a time. Its answers match this model's integer reference implementation word for word, and your questions never leave your machine. Use a recent desktop Chrome or Edge; the first download is about 580 MB and is not repeated; the browser needs about 6 GB of memory; phones can't run it.

**3 / 3**: reference questions answered word for word like the integer reference implementation

[Open the gate brain](https://nand.aihashrate.stream/gate/)

### 04 Driving arena

A car driven by just 21 gates laps a winding track by itself. One tap to drive, no wallet.

**24 / 24**: every fixed start finishes a full lap

[Drive a lap](app/#arena)

### 05 Check it yourself

When the app opens a module it checks every file against the on-chain record in the background and only runs it if they match. You can check any file yourself too.

**217 / 217**: every file on this site is recorded on chain and downloads byte for byte

[Check a file](app/#verify)

### 06 Build a circuit

Pick a small circuit, test every input in your browser, then write it on chain with your wallet; after that anyone can run and check it. This is the only step that needs a wallet.

**3,829 gates**: a computing circuit we put on chain; anyone can look it up

[Start building](app/build.html)
