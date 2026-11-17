# Contract addresses

> The on-chain contracts and containers used for checking. All are public contracts; reading them needs nothing but read-only calls.

## Website file store (SiteRegistry)

| Chain | Address |
|---|---|
| BNB Chain | `0xd006ffdd5ae313b17729621a00999cd3c71ce5e6` |
| Base, X Layer | `0xd6efb7adcc9c83dc4924ad56f6a8e4e969b9adb6` |

Every file of a site and its sha256 are recorded here. Before reading, tapemule checks the implementation address and refuses to read if it doesn't match.

## Hub

| Chain | Proxy address | Pinned implementation |
|---|---|---|
| BNB Chain | `0xe61A9C7213a6Aa616C246a2B569e555B417b25ee` | `0x80aFE7B77F2dFD08e9feab7675780baC34a7EE85` |
| Base | `0xe61A9C7213a6Aa616C246a2B569e555B417b25ee` | `0x38A2d320b8984Bbac9b0a2691B6c0FD829A23867` |
| X Layer | `0xe61A9C7213a6Aa616C246a2B569e555B417b25ee` | `0xdCC57797089eBD9f26e686379A4323f353a3F9C6` |

```sh Check the Hub on all three chains (tapemule command line, available once the repository is public)
npm run tape -- hub bnb && npm run tape -- hub base && npm run tape -- hub xlayer
```

## Our processors and circuits

| Name | Chain | Address |
|---|---|---|
| TapeOut CPU (home of circuit #279, "21 gates that drive") | BNB Chain | `0x6Fb4089e7Cbaa9660Fd11056274Cbd8117EE5B38` |
| Processor #245 (circuits 1.2.245, 3.2.245) | X Layer | `0xA93E807fAB41431827EBBa57443Fb687a95E2AA3` |
| Witness | BNB Chain | `0x12a580c1d02335e02d4e0fa812f5c2bc6f28ca42` |
| Arena | BNB Chain | `0xeb248f4fb929686b045e63c47c69505cf0009888` |

```sh Run circuit #279 once on chain (needs Foundry's cast)
cast call 0x6Fb4089e7Cbaa9660Fd11056274Cbd8117EE5B38 \
  "eval(uint256,bytes)(bytes)" \
  279 0xff7f \
  --rpc-url https://bsc-rpc.publicnode.com
```

## Containers

| Site | Chain | Container |
|---|---|---|
| 282.732.tape (this site, domain 21nand.bem) | BNB Chain | `0x39d97ab281f04a5bc3aCc562f8DeA3f0b4266aA3` |
| 1.2.245.tape (the Bard's design files are here too) | X Layer | `0x75c6E2D063963561c08c838476111adda7a1a6CD` |

> Source: tapemule `packages/core/src/protocol.ts` (11-04 main), and this site's "Check" page. To change an address, change it in both places first.
