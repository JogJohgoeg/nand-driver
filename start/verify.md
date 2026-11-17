# 自己核对

> 不用信我们：链上的网站文件、电路和模型，你自己拿命令复算。前四条现在就能做。

## 你需要

- Foundry 的 `cast`（装法见[快速上手](quickstart.md)）、`curl`、算 sha256 的工具
- 都是只读，不用钱包

## 1. 一个文件和链上登记的指纹一致

核什么：本站任意一个文件。凭什么：链上为每个文件登记的 sha256。

```sh 读链上登记的大小和 sha256
cast call 0xd006ffdd5ae313b17729621a00999cd3c71ce5e6 \
  "fileInfo(address,string)(uint32,string,bytes32,uint40,uint256)" \
  0x39d97ab281f04a5bc3aCc562f8DeA3f0b4266aA3 home.css \
  --rpc-url https://bsc-rpc.publicnode.com
```

```sh 下载同一个文件自己算（macOS 用 shasum -a 256）
curl -s https://282-732.aihashrate.stream/home.css | sha256sum
```

- 通过时：两个 sha256 一样（链上那个去掉开头的 `0x`）。
- 把 `home.css` 换成别的路径，核哪个文件都一样。

## 2. 在链上跑一次电路

核什么：电路 #279「21 个门开车」在链上给出的结果。要装 Foundry 的 `cast`。

```sh 调用 TapeOut CPU 上的电路 #279
cast call 0x6Fb4089e7Cbaa9660Fd11056274Cbd8117EE5B38 \
  "eval(uint256,bytes)(bytes)" 279 0xff7f \
  --rpc-url https://bsc-rpc.publicnode.com
```

只读调用，不收费。合约地址见[合约地址](../reference/contracts.md)。

## 3. 在浏览器里核对

- [模型机](../machine/index.md)：页面当场算模型文件和输出的 sha256，和页上写的值比。
- [吟游诗人设计图](https://1-2-245.aihashrate.stream/bard/v8g/)：从 X Layer 取回完整设计图，逐字节核对。

## 4. 吟游诗人设计图不经网关核

见[从链上取回设计图](../bard/fetch.md)的「方法三」：用 `cast` 直接读 X Layer 上两段文件登记的 sha256。

## 5. 用 tapemule 一次核完（仓库公开后）

> tapemule 命令行的仓库现在还没公开，这两条要等它公开后才能照做。它的好处是一次核完：读数钉在终局块，至少 2 家独立节点结果一致才算数。

```sh 取命令行工具（仓库公开后）
git clone https://github.com/BruceLanLan/tapemule.git
cd tapemule
npm ci
```

### 中枢合约是钉住的那份实现

核什么：三条链上的中枢（Hub）合约。凭什么：链上代码和实现地址，和 tapemule 里钉住的一致。

```sh 核对 BNB Chain 的中枢
npm run tape -- hub bnb
```

```sh 核对另外两条链
npm run tape -- hub base && npm run tape -- hub xlayer
```

- 通过时：`核对通过`，退出码 0。
- 读数钉在终局块，至少 2 家独立节点给的结果一致才算数。

### 一个站点的每个文件

核什么：`.tape` 站点的容器、持有人、激活状态，以及每个文件的字节。凭什么：链上为每个文件登记的 sha256。

```sh 逐个核对 282.732.tape 的文件
npm run tape -- open 282.732.tape --files
```

- 通过时：每个文件一行 `verified`，退出码 0。
- 有一个不是 `verified` 或读取失败，退出码 1。
- 换成别的站点名也一样，例如 `1.2.245.tape`、`288.732.tape`。

## 哪里得信别人

第 1 条比的是「下载到的文件」和「链上登记的 sha256」。登记本身靠一个合约，这里写清楚它由谁管。

- 本站的文件清单登记在协议的站点登记合约 `0xd006ffdd5ae313b17729621a00999cd3c71ce5e6` 里。这个合约不是我们写的。
- 它的管理地址是 `0xe4fc10592fa8ad7c408b81e99cfc54ef4b14283d`，是一把钥匙的普通钱包，不是多人共管。2026-11-14 只读查的（区块 133519690，三家公开节点结果相同）：这个地址上没有合约代码，发过 13 笔交易。
- 这意味着什么：这个合约可以升级，升级只认管理地址；管理人放弃管理权之后代码才冻结，现在没有放弃（按区块浏览器上公开验证过的源码和同一次只读查询）。升级之后，登记的内容理论上可以被改，我们拦不住。
- 你能怎么自己防：第 1 条读到的 sha256 是对着某个区块读的。读的时候带上区块号，同一个区块号换一家节点再读一遍，两家一样才算，然后把区块号和 sha256 一起记下来。我们现在没有在别处另发一份文件清单可以对照：站点列表页上那张文件清单也放在这个登记合约里，不算另一处。

```sh 带着区块号读（先取最新区块号，两家节点用同一个）
B=$(cast block-number --rpc-url https://bsc-rpc.publicnode.com)
cast call 0xd006ffdd5ae313b17729621a00999cd3c71ce5e6 \
  "fileInfo(address,string)(uint32,string,bytes32,uint40,uint256)" \
  0x39d97ab281f04a5bc3aCc562f8DeA3f0b4266aA3 home.css \
  --block $B --rpc-url https://bsc-dataseed.bnbchain.org
```

- 公开节点只留最近一小段区块的状态，隔久了不能用旧区块号重读。2026-11-14 试的三家：10 个区块之前的都答得上，1000 个区块之前的只有一家答得上，20000 个区块之前的三家都答不上。
- 没查的：这把钥匙是谁的；它过去 13 笔交易各做了什么。

买卖电路用的市场合约是另一个合约：它也能升级，升级权在一个 5 把钥匙里要 3 把的多人共管钱包手里（2026-11-12 只读查的）。



## 还没公开脚本的几条

> 这几条的脚本还没公开。下面只写核什么、凭什么、通过时看到什么。

| 核什么 | 凭什么 | 通过时 |
|---|---|---|
| TapeBoot 规范化、签名、取回的测试向量（C 版） | 一组固定的测试向量，不含私钥 | `全部通过：0 处失败` |
| 同一组向量（TS 参考客户端） | 同上 | 14 条通过 |
| 11 颗链上电路的网表 | 三方比 sha256：链上存的、烧录交易里的、我们留的那份 | 每颗一行 `一致`，退出码 0 |

第三条覆盖的电路：BNB Chain 上的 279.732 到 287.732 和 290.732，X Layer 上的 3.2.245。改一个字节会报 `不一致`，退出码 1。
