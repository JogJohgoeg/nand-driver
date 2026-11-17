# 工艺阶梯

> 同一份吟游诗人网表，在七个工艺平台上做完布局布线。这页列每个平台的面积和频率。

> 这页的面积、频率、功耗都是版图工具（OpenROAD-flow-scripts；SKY130 用 LibreLane）跑完整流程后算出来的，不是芯片实测。芯片还没造出来。频率是给定时序约束下的结果，不是极限。

## 先看两个词

- **body**：整机逻辑，不含存模型的 ROM。190,098 个组合门加 80,283 个寄存器。
- **整机**：body 加 60 个 ROM bank。可流片工艺上 ROM 用掩模 ROM 宏；ICsprout 55 nm 和预测库上用标准单元常量表代替。

## 总表

| 平台 | 能不能流片 | body 单元面积 | body 频率 | 整机芯片面积 | 整机频率 |
|---|---|---|---|---|---|
| SKY130（130 nm，基线 v8g） | 能，开源工艺 | 2.352 mm² | 约 8.6 MHz（ss 角，200 ns 时钟，未做建立时间优化） | 15.09 mm²（已签核整片） | — |
| IHP SG13G2（130 nm SiGe） | 能，开源工艺 | 6.83 mm² | 46.5 MHz | 22.09 mm² | 29.0 MHz |
| GF180MCU（180 nm） | 能，开源工艺 | 10.77 mm² | 15.7 MHz（5 V 库） | 38.44 mm² | 7.07 MHz（3.3 V 库） |
| ICsprout 55 nm | 有条件（见下） | 0.826 mm² | 117 MHz | 7.70 mm² | 按估的寄生参数算、没有从布线结果抽取：86.89 MHz |
| Nangate45（45 nm 预测库） | 不能 | 0.526 mm² | 146 MHz | 5.53 mm² | 85.4 MHz |
| ASAP7（7 nm 预测库） | 不能 | 0.0416 mm² | 294 MHz | 0.385 mm² | 110 MHz |
| GT2N（2 nm 预测库） | 不能 | 0.0207 mm² | 550 MHz | 没做整机 | — |

- SKY130 整机没有单独折算频率，所以写「—」。
- 七个平台的 body 布线 DRC 都是 0。
- 预测库只用来看「现代工艺下多大多快」，没有可制造的版图规则，不能流片。
- 同一份 body 从 SKY130 换到 GT2N 2 nm，单元面积约为原来的 1/114。
- IHP 和 GF180 比 SKY130 大：它们的触发器单元大，body 里有 8 万个触发器。
- 整机频率比 body 低：IHP、GF180 是读 ROM 和 body 组合逻辑挤在同一拍；Nangate45、ASAP7 被 ROM 列限速。

## ICsprout 55 nm 的限制

- PDK 来自 [openecos-projects/icsprout55-pdk](https://github.com/openecos-projects/icsprout55-pdk)，Apache-2.0。
- PDK 是预览版，只能走教学、科研的小批量班车，README 写明禁止商业量产。
- PDK 只带 Calibre 的 DRC/LVS 规则，没有开源签核。我们用第三方 KLayout 规则做了部分检查，不是正式签核。
- 这个平台上的频率是按全局布线估的寄生参数算的，没有从布线结果抽取寄生参数（平台没开抽取）。整机 86.89 MHz 那一版核过日志；body 117 MHz 用的是同一份平台配置，没有逐个核。
- 2026-11-01 的整机版图：详细布线 0 违例，电源网络全通，60 个 ROM 块逐块 LVS 一致（同样是第三方规则的部分检查）。到这份记录为止，整机 LVS、整机 DRC 还没做完。

## 功能核对

| 平台 | 布线后网表回放 L1 / L2 / L3 |
|---|---|
| SKY130 v8g | 全部通过，拍数 2,499,420 / 5,612,207 / 9,418,594 |
| IHP SG13G2 | 全部通过，拍数和 SKY130 v8g 相同 |
| GF180MCU | 全部通过，拍数和 SKY130 v8g 相同 |
| Nangate45、ASAP7 | 没回放 |

## 掩模 ROM 每位面积

三家开源可流片工艺用同一种掩模 ROM 结构。SKY130 的 ROM 在已签核的 v8g 整片里；IHP SG13G2 和 GF180MCU 是重画的，60 个 bank 全部 DRC 0、LVS 一致。

| 工艺 | 每位面积（含预充电） |
|---|---|
| SKY130 | 0.56 µm² |
| IHP SG13G2 | 0.46 µm² |
| GF180MCU | 0.85 µm² |

## 用的工具

- OpenROAD-flow-scripts 镜像 `openroad/orfs:26Q4-124-g3451ca1f5`，自带 OpenROAD、Yosys、KLayout、kepler-formal。
- 平台用 ORFS 自带的 sky130hd、gf180、ihp-sg13g2、nangate45、asap7、gt2n；ICsprout 55 nm 是自建的平台配置。
- 功耗只是 OpenROAD 的无激励估算，只能比数量级，所以总表没列。

## 下一步

- [吟游诗人芯片](index.md)：SKY130 v8g 的签核结果。
- [FPGA 移植](fpga.md)：同一台整机在 FPGA 上的结果。
