# 权重存储方案调研原始记录（2026-10-10）

范围：用一颗通用引擎芯片加可换的权重存储，替代现在约 15 mm² 的 SKY130 硬连线小模型 ASIC，模型约 2.2–2.3 Mbit（约 280 KB），只读。
规则：每条事实都附来源；价格都标上采集日期（全部为 2026-10-10 当天抓取或检索到的快照，网页本身的日期另注）；推算出来的数字标「估算」；查不到的写「未查到」。整个过程没有联系任何厂商，没有填表，也没有下单。

先给结论：280 KB 对现成存储器来说太小了。一颗 4 Mbit 的 SPI NOR 在立创不到 1 美元，单价最低的 16 Mbit 普冉 P25Q16SH 约 0.2–0.4 美元，可以反复擦写 10 万次。换模型只要一个几美元的 CH341A 烧录器，成本接近 0。真正的瓶颈不在存储器，而在 SKY130 GPIO 焊盘的速度：输出约 33 MHz，输入约 66 MHz。

---

## 0. 带宽基准（估算）

- 权重量：2.3 Mbit = 287.5 KB。
- 如果每个 token 都要把全部权重读一遍，那么每 token 的时间 = 287.5 KB / 带宽。
- SKY130 gpiov2 焊盘：输出最高 33 MHz，输入最高 66 MHz，驱动 4 mA（Tiny Tapeout 文档，来源 https://tinytapeout.com/specs/gpio/ ，引用的是同一个 pad 宏）。SPI 时钟由我们的芯片输出，所以实际可用时钟约 33 MHz（估算）。

| 接口 | 时钟 | 每片带宽 | 读完 287.5 KB | 每 token 上限（估算） |
|---|---|---|---|---|
| 单片 QSPI，SDR | 33 MHz（受焊盘限制） | 16.5 MB/s | 17.4 ms | 约 57 tok/s |
| 单片 QSPI，SDR | 133 MHz（器件额定值，SKY130 焊盘跑不到） | 66.5 MB/s | 4.3 ms | 约 230 tok/s |
| 8 片 QSPI 并联（共用 CLK/CS，32 根数据线，34 个引脚） | 33 MHz | 132 MB/s | 2.2 ms | 约 460 tok/s |
| 并行 NOR x16，70 ns | 约 14 MHz | 约 28 MB/s | 约 10 ms | 约 100 tok/s |
| Octal xSPI DTR | 200 MHz | 400 MB/s | 0.7 ms | SKY130 焊盘跑不到，而且是 1.8 V 器件 |

OpenFrame 有 44 个 GPIO（见第 5 节），足够接 8 片 QSPI 并联。总存储成本约 8 × 0.28 美元 ≈ 2.2 美元（估算，按 P25Q16SH 200+ 档价格算）。

---

## 1. 现成存储器

### 1.1 串行 SPI/QSPI NOR（立创/LCSC，2026-10-10 抓取的产品页）

| 型号 | 容量 | 时钟 | 封装 | 价格（美元） | 库存 | 来源 |
|---|---|---|---|---|---|---|
| PUYA 普冉 P25Q16SH-SSH-IT（C2977257） | 16 Mbit | 133 MHz，Quad | SOP-8 | 5+ 0.4002 / 50+ 0.3179 / 200+ 0.2762 / 500+ 0.2321 / 5000+ 0.2008 | 4,440 | https://www.lcsc.com/product-detail/C2977257.html |
| GigaDevice GD25Q40CTIG（C79077） | 4 Mbit | 120 MHz，Quad | SOP-8 | 1+ 1.1603 / 100+ 0.7408 / 1000+ 0.6474 | 1,930 | https://www.lcsc.com/product-detail/C79077.html |
| Winbond W25Q16JVSSIQ（C131025） | 16 Mbit | 133 MHz，Quad | SOIC-8 208mil | 1+ 1.2169 / 100+ 0.831 / 1000+ 0.6898 | 50 | https://www.lcsc.com/product-detail/C131025.html |
| Winbond W25Q32JVSSIQ（C179173） | 32 Mbit | 133 MHz | SOIC-8 | 1+ 1.5101 / 100+ 1.0456 / 1000+ 0.9619 | 2,619 | https://www.lcsc.com/product-detail/C179173.html |
| GigaDevice GD25Q128ESIGR（C2928891） | 128 Mbit | 133 MHz | SOP-8 | 1+ 1.5379 / 100+ 1.0969 / 1000+ 0.8526 | 16,877 | https://www.lcsc.com/product-detail/C2928891.html |
| Zbit ZB25VQ16ATIG（C495746） | 16 Mbit | 104 MHz | SOP-8 | 无报价，页面显示 "Not available now" | 0 | https://www.lcsc.com/product-detail/C495746.html |
| XTX XT25Q16DDTIGT（C2759956） | 16 Mbit | — | UDFN-8 | 搜索快照中 1+ 约 0.53，无库存（未直接核实） | 0 | https://datasheet.lcsc.com/lcsc/2304140030_XTX-XT25Q16DDTIGT_C2759956.pdf |
| GD25Q16ESIGR | 16 Mbit | — | SOP-8 | 立创价格未查到；Digikey FR 约 0.55 欧元（1 片）到 0.44 欧元（1000 片），缺货 | — | https://punchouttest.digikey.fr/fr/products/detail/gigadevice-semiconductor-hk-limited/GD25Q16ESIGR/14113868 |
| Winbond W25Q40CLSNIG | 4 Mbit | — | SOIC-8 | Digikey 1 片 0.38，500 片约 0.31，交期 20 周（搜索快照） | — | https://azcus.digikey.com/en/products/detail/winbond-electronics/W25Q40CLSNIG/3008619 |

- 引脚：SPI 4 线（CS、CLK、DI、DO）；QSPI 6 线（CS、CLK、IO0–3），再加 VCC 和 GND，共 8 脚。
- 带宽：器件额定 133 MHz × 4 bit = 66.5 MB/s；配 SKY130 实际约 16.5 MB/s（估算，见第 0 节）。
- 价格趋势：TrendForce 2026-09 报告称，NOR 合约价 2026 上半年累计涨了 100–120%；2026 第四季度 128 Mb 及以下容量预计再涨 10–20%，256 Mb 以上在 2026 下半年预计涨 90–110%。来源：https://www.trendforce.com/presscenter/news/20260914-13235.html 、https://www.eetasia.com/trendforce-ai-demand-drives-sharp-split-in-nor-flash-pricing/ 。低容量 SPI NOR 涨得少，但上面的价格可能还会变。
- 烧录：CH341A USB 编程器约 4–7 美元（Tindie 1 片 7 美元，7 片以上 4 美元；网页日期未知）。来源：https://www.tindie.com/products/blinkingsilver/programmer-ch341a-series-burner-chip/ 。也可以让引擎芯片或任何 MCU 在电路板上直接烧写。

### 1.2 Octal SPI NOR（Digikey 搜索快照）
- GD25LX256EFIRR（256 Mbit，Octal DTR 200 MHz）：1 片约 4.23 美元，500 片约 3.44 美元。来源：https://azcus.digikey.com/en/products/detail/gigadevice-semiconductor-hk-limited/GD25LX256EFIRR/18083685
- MX25UM25645GXDI00（256 Mbit）：1 片约 4.11 到 6.96 美元，各列表不一致。来源：https://www.digikey.com/en/products/detail/macronix/MX25UM25645GXDI00/18110134
- 4–16 Mbit 容量的 Octal 器件：未查到。这类器件容量都偏大，是 1.8 V 的，SKY130 焊盘也跑不到 200 MHz DTR，对本项目不划算。

### 1.3 并行 NOR
- SST39SF040（4 Mbit，PLCC-32，5 V）：Digikey 1 片 2.68 美元，100 片 2.47 美元；Avnet 300 片约 2.19 美元；交期约 6 周（搜索快照）。来源：https://origin-www.findchips.com/detail/SST39SF040-70-4C-NHE/Microchip-Technology-Inc
- SST39LF040：Farnell IE 750+ 档 2.22 欧元，交期 22 周。来源：https://ie.farnell.com/microchip/sst39lf040-55-4c-nhe-t/flash-memory-4mbit-0-to-70deg/dp/3592516
- 立创的并行 NOR 价格：未查到。
- 引脚：4 Mbit x8 需要 19 根地址线、8 根数据线、3 根控制线，约 30 个 IO，比 QSPI 多出约 24 个，带宽却不比多片 QSPI 并联高。

### 1.4 OTP EPROM / 掩模 ROM
- AT27C040-70PU（4 Mbit OTP，DIP-32）：Digikey MX 1 片 11.58 美元，库存 348。Digikey DK 页面显示 Last Time Buy Date 为 01/07/2026，即将停产或已停产。来源：https://www.digikey.com.mx/en/products/detail/atmel/AT27C040-70PU/1008550 、https://www.digikey.dk/en/products/detail/atmel/AT27C040-70PU/1008550
- AT27C040-70JU-T（PLCC）：1 片 9.03 美元，750 片一盘 8.26 美元。来源：https://www.digikey.com/en/products/detail/microchip-technology/AT27C040-70JU-T/6834163
- 掩模 ROM：Renesas 仍有定制掩模 MCU，但表示已不再接受基于 EPROM 的订单。来源：https://www.renesas.com/en/products/rom-ordering 。独立定制掩模 ROM 芯片的 MOQ 和价格：未查到（eBay 上只有 Macronix MX23C6410 这类二手库存）。来源：https://www.ebay.de/itm/196463065153
- 结论：OTP 单价是 SPI NOR 的 10–40 倍，正在停产，而且换一次模型就要换一颗芯片，没有优势。

### 1.5 并行 SRAM / PSRAM / HyperRAM（只在需要 RAM 时才用，权重仍然要从 flash 装入）
- IS62WV51216EBLL-45TLI（8 Mbit 并行 SRAM，TSOP-44）：立创起价 2.9388 美元，1 片 4.4997 美元，库存 66（搜索快照）。来源：https://fat.lcsc.com/product-detail/SRAM_ISSI-Integrated-Silicon-Solution-IS62WV51216EBLL-45TLI_C1348903.html
- APS6404L-3SQR-SN（64 Mbit QSPI PSRAM，SOP-8）：立创 C5333729 显示 "Not available now"（2026-10-10 抓取）。Mouser India 1 片 ₹223.63，3000 片 ₹173.31，库存 63,709（快照日期未知）。来源：https://www.lcsc.com/product-detail/C5333729.html 、https://www.mouser.in/c/embedded-solutions/memory-data-storage/memory-ics/dram/?pg=2
- APS6404L-3SQR-ZR（C3040877）：1 片 5.181 美元，1000+ 1.8999 美元，库存 0（快照）。来源：https://fat.lcsc.com/product-image/C3040877.html
- HyperRAM S27KL0643：Digikey marketplace 300 片约 1.95 美元；Future Electronics 10 片 3.82 美元（快照）。来源：https://www.findchips.com/search/KS0642 、https://www.futureelectronics.com/p/7210043

---

## 2. FPGA 方案

| 器件/板子 | 片上 RAM | 能否把 2.3 Mbit 全放在片内 | 芯片价格 | 板子价格 | 来源 |
|---|---|---|---|---|---|
| Lattice iCE40UP5K-SG48I | 1 Mbit SPRAM + 120 Kbit EBR（凭记忆，未在本次检索中核实） | 不能，需要外接 flash | 立创 1+ 10.95 美元，100+ 7.98 美元，库存 761 | iCEBreaker：Mouser 115.20 美元，SparkFun 旧价 84.95 美元 | https://www.lcsc.com/product-detail/C2678152.html ；https://www.sparkfun.com/icebreaker-fpga.html |
| Gowin GW1NR-9（Tang Nano 9K） | 468 Kbit BSRAM，封装内带 64 Mbit PSRAM，板上 32 Mbit flash | 片内放不下；封装内 PSRAM 可以放下 | 立创芯片价：未查到 | 2022 年发布价 14.99 美元起；Spotpear 33.9 美元 | https://wiki.sipeed.com/hardware/en/tang/Tang-Nano-9K/Nano-9K.html ；https://www.cnx-software.com/2022/01/17/tang-nano-9k-fpga-board-can-emulate-picorv32-risc-v-soft-core-with-all-peripherals/ |
| Gowin GW2AR-18（Tang Nano 20K） | 828 Kbit BSRAM，板上 64 Mbit 32 位 SDR SDRAM，64 Mbit flash，20,736 个 LUT4 | 片内放不下；SDRAM 和 flash 绰绰有余 | 立创 GW2AR-LV18QN88C8/I7（C380550）1+ 43.81 美元，库存 125 | 2023 年发布价 25 美元起；零售 26.8–34 美元 | https://wiki.sipeed.com/hardware/en/tang/tang-nano-20k/nano-20k.html ；https://www.lcsc.com/product-detail/C380550.html ；https://www.cnx-software.com/news/risc-v/page/31/?amp=1 |
| Gowin GW2A-18（Tang Primer 20K） | 828 Kbit BSRAM，128 MB DDR3，32 Mbit flash | 片内放不下 | 未查到 | Robu.in ₹2,249（快照） | https://wiki.sipeed.com/hardware/en/tang/tang-primer-20k/primer-20k.html ；https://aws.robu.in/?p=790009 |
| Gowin GW5A-25（Tang Primer 25K） | BSRAM 未查到；板上 64 Mbit flash | 未查到 | 未查到 | Spotpear 28.99 美元（变体不明） | https://spotpear.com/index.php/shop/Sipeed-FPGA-Tang-Primer-25K-Dock-Gowin-PMOD-SDRAM-GW5A-LV25MG121-RISCV-Retro-Game-Open-Source-linux/Tang-Primer-25K-Dock-Kit.html |
| Efinix T20F256 | 1,044 Kbit | 片内放不下 | Digikey C3 13.18 美元，C4 11.59 美元 | 未查到 | https://www.digikey.fr/en/products/detail/efinix-inc/T20F256C3/10654501 ；https://www.efinixinc.com/shop/t20.php |
| Lattice ECP5 LFE5U-25F | 约 1 Mbit EBR（凭记忆，未核实） | 片内放不下 | 市场报价约 3.9 美元（Dasenic，未核实）；立创 45F 款 1 片 17.21 美元 | 未查到 | https://mx.dasenic.com//product/lattice-semiconductor-corporation-lfe5u-25f-6bg256c-4534064 ；https://lcsc.com/product-detail/image/LFE5U-45F-6BG256C_C1550834.html |
| Anlogic 安路 EG4S20（Lichee Tang） | 约 130 KB SRAM，内置 64 Mbit SDRAM，板上 8 Mbit flash | 片内放不下；内置 SDRAM 可以 | 未查到 | 早年 Seeed 售价低于 18 美元（日期不明） | https://tang.sipeed.com/en/hardware-overview/lichee-tang/ ；https://abopen.com/news/seeed-studio-stocks-sub-18-risc-v-sipeed-tang-primer-fpga-board/ |
| AMD Spartan-7 XC7S6 | 180 Kbit（Digikey 列表写 184,320 bit） | 不能 | Digikey US 19.04 美元，交期 16 周 | 未查到 | https://azcus.digikey.com/en/products/detail/amd/XC7S6-1CSGA225C/9380274 |

整个设计能不能跑在便宜 FPGA 上（判断，非来源事实）：
- 现在的硬连线版本把权重固化在门里（约 15 mm² SKY130），放进 2 万 LUT 的 FPGA 基本不现实；要放下需要 8 万 LUT 以上的中高端器件，价格未查到。
- 改成「通用引擎加外部权重」后就很合适：Tang Nano 20K（约 25–34 美元）板上有 64 Mbit flash 和 32 位 SDRAM。上电后把权重从 flash 搬到 SDRAM 或 BSRAM，引擎用 2 万 LUT 实现 MAC 阵列和控制。SDRAM 32 位 × 约 100 MHz ≈ 400 MB/s（估算），比 SKY130 焊盘能做到的高一个数量级。换模型只需重新烧 flash，成本为 0。
- 片内能放下 2.3 Mbit 的 FPGA 型号和价格：未查到（ECP5-85 等中档器件应该能放下，但未核实价格）。实际上没必要，外部 flash 或 PSRAM 已经够用。

---

## 3. 光学 ROM 设想

### 3.1 掩模和菲林价格
- 铬版（钠钙玻璃）：
  - Advance Reproductions：4"×4" 铬版 4低成本，最小线宽 0.75 µm（MIT labnetwork，2025-03）。来源：https://mtl.mit.edu/pipermail/labnetwork/2025-March/007107.html
  - Purdue wiki 汇总：Front Range Photomask 5" 铬版约 500 美元，做 2 µm 线宽另加 100 美元，5 天交货；TOPPAN 约 500 美元；Applied Image 约 5低成本；UIUC 校内 4"/5" 铬版 200 美元（页面无日期）。来源：https://purdue.atlassian.net/wiki/x/0ihf 、https://purdue.atlassian.net/wiki/x/CB5f
  - UCSB NCF：3–5" 钠钙铬版校内价 3低成本，CD 2 µm ± 0.25 µm。来源：https://ece.ucsb.edu/oewiki/images/d/d9/NCF_mask_writing.pdf
  - UH 纳米中心：5"×5" 塑料掩模 70 美元（CD 8 µm）、钠钙 300 美元（5 µm）、石英 600 美元（2 µm）。来源：https://uhnf.egr.uh.edu/pythography/photolithography-guide/photomask
  - 空白铬版（未图形化）：Nanofilm 3–5" 每片 20–25 美元。来源：同 MIT labnetwork 链接
- 中国掩模厂：清溢光电、路维光电主做量产和面板客户（清溢已量产 180 nm 半导体掩模），科研小批量报价未查到。来源：https://m.gelonghui.com/p/561869 、https://www.chinabaogao.com/tuozi/202403/698008.html
- Infinite Graphics：未查到。
- 激光光绘菲林（约 10 µm）：CAD/Art Services（Output City）已并入 Artnet Pro，光绘分辨率最高 50,000 DPI，价格要询价，网页未公开。来源：https://www.outputcity.com/ 。2014 年 MEMSnet 帖子称其保证 10 µm 特征。来源：https://isicopy.memsnet.org/memstalk/25909 。国内 50,000 dpi 菲林每张价格：未查到。参考价可用上面 UH 的塑料掩模 70 美元（5"，8 µm）。

### 3.2 便宜 CMOS 图像传感器
- OV2640：1600×1200（UXGA），像素 2.2 µm，UXGA 下最高 15 fps。来源：https://files.waveshare.com/wiki/common/OV2640DS_en.pdf 、https://cdn.robotshop.com/media/W/Wav/RB-Wav-73/pdf/OV2640-datasheet.pdf
- OV2640 模组价格：eBay.de 约 3.71–6.17 美元（2025 年列表），见 https://www.ebay.de/itm/405751152034 ；立创 Waveshare 模组（C359962）约 10.11 美元（2024-11 快照），见 https://www.flux.ai/lcsc/ov2640-camera-board.md
- OV5640（5 MP，2592×1944）：Waveshare 板子 17.59 欧元。来源：https://www.waveshare.com/directory/currency/switch/currency/EUR/uenc/aHR0cHM6Ly93d3cud2F2ZXNoYXJlLmNvbS9wcm9kdWN0L21vZHVsZXMvb3Y1NjQwLWNhbWVyYS1ib2FyZC1hLmh0bQ,,/
- GC0308 模组 5–8.5 美元（made-in-china，MOQ 5），GC2053 模组约 6.9 美元。来源：https://m.made-in-china.com/hot-china-products/Cmos_Module_Factory.html
- GC2145 芯片价格：未查到。

### 3.3 容量和带宽估算（估算，非来源）
- 接触成像，每个 bit 占 3×3 像素（6.6 µm 周期），OV2640 一帧 533×400 ≈ 213 kbit 原始数据，加 ECC 后约 150 kbit。要装 2.3 Mbit 需要约 16 帧不同图案，也就是要做机械扫描或多片掩模，一次读不完。
- 带宽：15 fps × 150 kbit ≈ 280 KB/s，读完一遍约 1 s，比 QSPI 慢约 60 倍。这意味着必须先读进 RAM，然后照样需要 280 KB 的 RAM 或 PSRAM。
- 衍射：间隙 g 处的模糊尺度约 √(λg)。λ=0.55 µm、g=0.5 mm（典型保护玻璃厚度）时约 16 µm，所以 1–5 µm 的铬点必须去掉保护玻璃和微透镜、做到真接触才能分辨；10 µm 菲林也要求间隙在百微米以内（估算）。
- 解码需要做图像配准、阈值和 ECC，引擎芯片很难自己做，一般要外加 MCU 或 CPU。

### 3.4 先例
- 接触式、无透镜成像（样品直接贴在 CMOS 上，分辨率由像素孔径决定）：专利 https://image-ppubs.uspto.gov/dirsearch-public/print/downloadPdf/10107997 ；综述 https://www.ncbi.nlm.nih.gov/pmc/articles/PMC11501743/ 。用铬掩模贴在 CMOS 上当 ROM 的直接先例：未查到。
- LaserCard（Drexler）：16×85 mm 条带存 1–40 Mbit，产品版约 2 MB。来源：https://nanolithography.spiedigitallibrary.org/conference-proceedings-of-spie/329/0000/Laser-Card-For-Compact-Optical-Data-Storage-Systems/10.1117/12.933376.full ；只读光数据卡专利 https://patents.google.com/patent/US4863819
- 全息只读存储卡：约 6 MB（SPIE 1997），见 https://astronomicaltelescopes.spiedigitallibrary.org/conference-proceedings-of-spie/3010/0000/Compact-holographic-card-memory/10.1117/12.274436.full ；反射式全息卡约 1 bit/µm²，10×10 mm 约 10 MB（SPIE 2000），见 https://ebooks.spiedigitallibrary.org/conference-proceedings-of-spie/4092/0000/Optical-system-of-holographic-memory-card-writingreading-equipment/10.1117/12.402415.full ；ISO/IEC 11695 标准预览见 https://webstore.ansi.org/preview-pages/ISO/preview_ISO+IEC+11695-1-2008.pdf
- 纸质数据（Optar）：600 dpi 激光打印，A4 约 200 KB，用 Golay(24,12,8) 纠错。来源：https://en.wikipedia.org/wiki/Paper_data_storage 、https://lwn.net/Articles/242735/ 。按这个密度，280 KB 约 1.4 页 A4（估算），用扫描仪或 5 MP 相机分块拍照即可读回。这是光学方案里唯一真正「自己能做、零门槛」的路线，但只适合离线装载，不适合推理时实时读取。

### 3.5 可靠性风险（判断）
灰尘、划痕、对准和热漂移、照明不均、传感器坏点、菲林老化收缩、铬版在接触时磨损，这些都要靠强 ECC 和对准标记兜底。和 NOR 的 20 年保持、10 万次擦写相比没有优势（W25Q16JV 的参数来自上面立创页面）。

---

## 4. Tiny Tapeout（2026）

- 当前开放的 shuttle：首页列出 SKY26d、GF26c（倒计时未能读出）。来源：https://tinytapeout.com/
- 新闻：TTSKY26a 于 2026-04-26 售罄并开放 TTSKY26b（50% 面积留给 IEEE）；TTIHP26b 于 2026-09-21 截止，收了 123 个设计；2025-06-26 宣布 ChipFoundry Sky130 shuttle 首次允许 4 tile 高的设计。来源：https://tinytapeout.com/news/ 、https://tinytapeout.com/news/sky130-confirmed/
- TTSKY26a 走 ChipFoundry CI2605，2026-05-11 截止。来源：https://tinytapeout.com/chips/ttsky26a/
- 价格：计算器显示每 tile 70 欧元，开发板（PCB）300 欧元，经济运费 15 欧元，1 tile 加 1 板合计 385 欧元（检索快照；我抓取时计算器页面是空白）。模拟设计至少 2 tile，即 140 欧元。早鸟价只给个人，每人一次。来源：https://app.tinytapeout.com/calculator?tiles=1&pcbs=1 、https://tinytapeout.com/specs/analog/ 、https://tinytapeout.com/faq/
- Tile 大小：约 160×100 µm，约 1,000 个数字门。来源：https://tinytapeout.com/faq/ 。最大 16 tile（TT04 起），见 https://www.tinytapeout.com/news/tt04-opens/ ；ChipFoundry Sky130 shuttle 允许 4 tile 高，当前 8×4 能否使用未查到。
- IO：24 个用户 IO 加 clk、rst_n；输入 66 MHz，输出 33 MHz。来源：https://tinytapeout.com/specs/gpio/
- 存储：SKY130 上没有 SRAM 宏（只有 IHP 有）。DFFRAM RAM32（128 B）要占 3×2 tile；有 QSPI Pmod（16 MB flash 加 2 × 8 MB PSRAM）。来源：https://tinytapeout.com/specs/memory/
- 能否放下一个小引擎（估算）：16 tile ≈ 1.6 万门，约 0.26 mm²，够放一个 8 位串行或少量 MAC、一个 QSPI 读取器和一个小控制器；激活缓存只能放几百字节，KV 和激活基本要放到 Pmod 上的 PSRAM。费用 16 × 70 + 300 ≈ 1,420 欧元（估算），得到 1 颗芯片（FAQ：每块开发板对应一颗芯片）。带宽受 33 MHz 输出和 24 个 IO 限制，单片 QSPI 约 16.5 MB/s，大约 50 tok/s 量级（估算）。

## 5. ChipFoundry / SkyWater

- chipIgnite：每次 tapeout 14,9低成本，含 100 颗 QFN（或裸片）、10 块 M.2 子卡和评估板；另加 50 颗裸片 3,000 美元；预订金 500 美元。官方写明「We do not offer discounts for individual project submissions」，折扣只给批量购买的机构。从提交到拿到芯片约 5 个月。来源：https://chipfoundry.io/ 、https://chipfoundry.io/commercial-terms 、https://chipfoundry.io/faqs
- Shuttle 时间表：CI2609（承诺 2026-08-05，tapeout 2026-09-16，交付 2027-03-03）；CI2612（承诺 2026-11-04，tapeout 2026-12-07，交付 2027-05-25）。来源：https://chipfoundry.io/ 、https://chipfoundry.io/reservations
- 模板：Caravel 是 38 个 GPIO、约 10 mm²；OpenFrame 是 44 个 GPIO、约 15 mm²，无内置 SoC，用户逻辑直接连焊盘，用 CF_gpio_config 配置；Caravan 是 27 个 GPIO 加 11 个裸焊盘；Caravel Mini 是 36 个 GPIO、约 2 mm²。来源：https://chipfoundry.io/faqs 、https://github.com/chipfoundry/openframe_user_project 、https://github.com/efabless/openframe_timer_example
- 另有 double-wide OpenFrame（更大面积、更多 GPIO），价格未查到；GitHub 仓库 double_wide_openframe 于 2026-07-15 更新。来源：https://chipfoundry.io/ 、https://github.com/chipfoundry
- 外接存储是否容易（判断）：OpenFrame 的 44 个 GPIO 由用户逻辑直接驱动，接 QSPI 只需 6 个引脚，接 8 片并联也只要 34 个，没有协议或 IP 上的障碍（Caravel 里的 PicoRV32 示例本身就用 SPI flash 启动，见 https://github.com/efabless/openframe_timer_example ）。限制在焊盘速度（约 33 MHz 输出）和 4 mA 驱动，PCB 走线要短。
- 更便宜的 ChipFoundry 选项：
  - Caravel Mini / chipIgnite Mini：Efabless 时代 3,500 美元含 25 颗 QFN，见 https://efabless.com/chipignite-mini 。ChipFoundry 当前是否还提供、什么价格：未查到。
  - ChipDiscover：价格未公开。来源：https://chipfoundry.io/
  - Tiny Tapeout：见第 4 节。
- 非 SkyWater 的便宜选择：wafer.space GF180MCU Run 3，每个 slot 含 1,000 颗裸片。
  - 1/4 slot（4.90 mm²，核心 1.73 mm²，48 个 IO）：早鸟 2,000 美元 / 标准 3,000 美元。
  - 半 slot（9.9 mm²）：4,000 / 5,000 美元。
  - 整 slot（20.14 mm²，核心 12.92 mm²，56 个 IO）：7,000 / 8,000 美元。
  - COB 打线另加 1,500 美元。
  - 早鸟已于 2026-09-30 截止；购买截止 2026-12-09，GDS 截止 2026-12-16，2027 年第二季度出货。Crowd Supply 商品栏显示另一组价格（整 slot 7,500 美元）并标为售罄，两处不一致。
  - 来源：https://www.crowdsupply.com/wafer-space/gf180mcu-run-3 、https://www.crowdsupply.com/wafer-space/gf180mcu-run-2
  - 注意：工艺是 180 nm，密度低于 SKY130，设计要重新移植；IO 速度未查到。

---

## 6. 对比总表

| 方案 | 单价（2026-10-10） | 带宽 | 能否自己做 | 每换一次模型的成本 | 来源 |
|---|---|---|---|---|---|
| QSPI NOR 1 片（P25Q16SH 或 GD25Q40） | 0.20–1.16 美元 | 16.5 MB/s（配 SKY130，估算）；器件额定 66 MB/s | 能，CH341A 4–7 美元或在板烧写 | 约 0 美元（重烧） | LCSC C2977257、C79077；Tindie |
| QSPI NOR 8 片并联（OpenFrame） | 约 2.2 美元（估算） | 约 132 MB/s（估算） | 能 | 约 0 美元 | 同上 |
| 并行 NOR SST39SF040 | 2.2–2.7 美元 | 约 14–28 MB/s（估算） | 能 | 约 0 美元 | findchips / Farnell |
| OTP EPROM AT27C040 | 8–12 美元，已在停产 | 约 14 MB/s（估算） | 能（需编程器） | 换一颗芯片，约 9–12 美元 | Digikey |
| QSPI PSRAM / HyperRAM | 约 2–5 美元 | 同 QSPI；HyperRAM 更高 | 只是 RAM，还要配 flash | — | LCSC、Mouser.in、Future |
| FPGA 板 Tang Nano 20K（引擎加 SDRAM 加 flash） | 25–34 美元/块 | 约 400 MB/s（SDRAM，估算） | 能，开源或 Gowin 工具 | 0 美元 | Sipeed wiki、CNX、LCSC C380550 |
| FPGA 板 Tang Nano 9K | 约 15–34 美元 | 封装内 PSRAM | 能 | 0 美元 | Sipeed wiki、CNX |
| 光学 ROM：铬版加 OV2640 | 掩模 200–5低成本，传感器 4–10 美元，外加机械和 MCU | 约 0.28 MB/s（估算） | 半自制，掩模要外包 | 每次新做掩模 200–5低成本 | MIT labnetwork、Purdue、datasheet |
| 光学 ROM：菲林或纸（Optar） | 菲林约 70 美元/5"；纸几乎 0 | 只能离线装载 | 能 | 0–70 美元 | UH、Wikipedia/LWN |
| 硬连线 ASIC（现状，chipIgnite） | 14,9低成本 / 100 颗 | 片内，最高 | 外包流片 | 14,9低成本（重新流片） | chipfoundry.io |
| Tiny Tapeout 16 tile 引擎 | 约 1,420 欧元（估算）/ 1 颗 | 约 16.5 MB/s（估算） | 外包流片 | 0（权重在外部 flash） | tinytapeout.com |
| wafer.space GF180 1/4 slot 引擎 | 3,000 美元 / 1,000 颗裸片（标准价） | 未查到（IO 速度） | 外包流片 | 0（权重在外部 flash） | crowdsupply |
