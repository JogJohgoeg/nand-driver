# 合约地址

> 核对时用到的链上合约和容器。都是公开合约，只读就能查。

## 网站文件仓库（SiteRegistry）

| 链 | 地址 |
|---|---|
| BNB Chain | `0xd006ffdd5ae313b17729621a00999cd3c71ce5e6` |
| Base、X Layer | `0xd6efb7adcc9c83dc4924ad56f6a8e4e969b9adb6` |

站点的每个文件和它的 sha256 都登记在这里。tapemule 读之前先核对实现地址，对不上就不读。

## 中枢（Hub）

| 链 | 代理地址 | 钉住的实现 |
|---|---|---|
| BNB Chain | `0xe61A9C7213a6Aa616C246a2B569e555B417b25ee` | `0x80aFE7B77F2dFD08e9feab7675780baC34a7EE85` |
| Base | `0xe61A9C7213a6Aa616C246a2B569e555B417b25ee` | `0x38A2d320b8984Bbac9b0a2691B6c0FD829A23867` |
| X Layer | `0xe61A9C7213a6Aa616C246a2B569e555B417b25ee` | `0xdCC57797089eBD9f26e686379A4323f353a3F9C6` |

```sh 核对三条链的中枢（tapemule 命令行，仓库公开后可用）
npm run tape -- hub bnb && npm run tape -- hub base && npm run tape -- hub xlayer
```

## 我们的处理器和电路

| 名字 | 链 | 地址 |
|---|---|---|
| TapeOut CPU（电路 #279「21 个门开车」在这里） | BNB Chain | `0x6Fb4089e7Cbaa9660Fd11056274Cbd8117EE5B38` |
| 处理器 #245（电路 1.2.245、3.2.245） | X Layer | `0xA93E807fAB41431827EBBa57443Fb687a95E2AA3` |
| Witness | BNB Chain | `0x12a580c1d02335e02d4e0fa812f5c2bc6f28ca42` |
| 竞技场 | BNB Chain | `0xeb248f4fb929686b045e63c47c69505cf0009888` |

```sh 在链上跑一次电路 #279（要装 Foundry 的 cast）
cast call 0x6Fb4089e7Cbaa9660Fd11056274Cbd8117EE5B38 \
  "eval(uint256,bytes)(bytes)" \
  279 0xff7f \
  --rpc-url https://bsc-rpc.publicnode.com
```

## 容器

| 站点 | 链 | 容器 |
|---|---|---|
| 282.732.tape（本站，域名 21nand.bem） | BNB Chain | `0x39d97ab281f04a5bc3aCc562f8DeA3f0b4266aA3` |
| 1.2.245.tape（吟游诗人设计图也在这里） | X Layer | `0x75c6E2D063963561c08c838476111adda7a1a6CD` |

> 出处：tapemule `packages/core/src/protocol.ts`（11-04 main），以及本站「核对」页。改地址先改这两处。
