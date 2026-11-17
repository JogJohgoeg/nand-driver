# Process ladder

> The same Bard netlist, through place and route on seven process platforms. This page lists the area and frequency on each one.

> The area, frequency and power on this page were computed by layout tools (OpenROAD-flow-scripts; LibreLane for SKY130) after a full flow run. They are not measured on a chip. The chip has not been made. Frequency is the result under a given timing constraint, not the limit.

## Two words first

- **body**: the full chip logic, without the ROM that stores the model. 190,098 combinational gates plus 80,283 registers.
- **Full chip**: body plus 60 ROM banks. On processes you can tape out, the ROM uses mask ROM macros. On ICsprout 55 nm and the predictive libraries, standard-cell constant tables take their place.

## Summary table

| Platform | Can it be taped out | body cell area | body frequency | Full-chip die area | Full-chip frequency |
|---|---|---|---|---|---|
| SKY130 (130 nm, baseline v8g) | Yes, open-source process | 2.352 mm² | About 8.6 MHz (ss corner, 200 ns clock, no setup-time optimization) | 15.09 mm² (full die, signed off) | — |
| IHP SG13G2 (130 nm SiGe) | Yes, open-source process | 6.83 mm² | 46.5 MHz | 22.09 mm² | 29.0 MHz |
| GF180MCU (180 nm) | Yes, open-source process | 10.77 mm² | 15.7 MHz (5 V library) | 38.44 mm² | 7.07 MHz (3.3 V library) |
| ICsprout 55 nm | With conditions (see below) | 0.826 mm² | 117 MHz | 7.70 mm² | From estimated parasitics, not extracted from the routed layout: 86.89 MHz |
| Nangate45 (45 nm predictive library) | No | 0.526 mm² | 146 MHz | 5.53 mm² | 85.4 MHz |
| ASAP7 (7 nm predictive library) | No | 0.0416 mm² | 294 MHz | 0.385 mm² | 110 MHz |
| GT2N (2 nm predictive library) | No | 0.0207 mm² | 550 MHz | Full chip not done | — |

- SKY130 full chip has no separately derived frequency, so it shows "—".
- Body routing DRC is 0 on all seven platforms.
- Predictive libraries only show how large and how fast it would be on a modern process. They have no manufacturable layout rules, so you can't tape out on them.
- Moving the same body from SKY130 to GT2N 2 nm makes the cell area about 1/114 of the original.
- IHP and GF180 come out larger than SKY130: their flip-flop cells are large, and the body has 80 thousand flip-flops.
- Full-chip frequency is lower than body frequency. On IHP and GF180, reading the ROM and the body's combinational logic share one cycle. On Nangate45 and ASAP7, the ROM columns limit the speed.

## Limits of ICsprout 55 nm

- The PDK comes from [openecos-projects/icsprout55-pdk](https://github.com/openecos-projects/icsprout55-pdk), Apache-2.0.
- The PDK is a preview. It can only go on small-batch shuttles for teaching and research, and its README prohibits commercial mass production.
- The PDK only ships Calibre DRC/LVS rules, with no open-source sign-off. We ran partial checks with third-party KLayout rules. This is not formal sign-off.
- Frequencies on this platform are computed from parasitics estimated at global routing, not from parasitics extracted from the routed layout (extraction is not enabled for this platform). We checked the logs for the full-chip 86.89 MHz run. The body 117 MHz run uses the same platform configuration and was not checked individually.
- Full-chip layout of 2026-11-01: detailed routing has 0 violations, the power network is fully connected, and the 60 ROM blocks match on LVS one by one (again a partial check with third-party rules). As of this record, full-chip LVS and full-chip DRC are not finished.

## Function check

| Platform | Post-route netlist replay L1 / L2 / L3 |
|---|---|
| SKY130 v8g | All pass, cycle counts 2,499,420 / 5,612,207 / 9,418,594 |
| IHP SG13G2 | All pass, cycle counts the same as SKY130 v8g |
| GF180MCU | All pass, cycle counts the same as SKY130 v8g |
| Nangate45, ASAP7 | Not replayed |

## Mask ROM area per bit

The three open-source processes you can tape out on use the same mask ROM structure. The SKY130 ROM is in the signed-off v8g full die. IHP SG13G2 and GF180MCU were redrawn, and all 60 banks have DRC 0 and match on LVS.

| Process | Area per bit (including precharge) |
|---|---|
| SKY130 | 0.56 µm² |
| IHP SG13G2 | 0.46 µm² |
| GF180MCU | 0.85 µm² |

## Tools used

- OpenROAD-flow-scripts image `openroad/orfs:26Q4-124-g3451ca1f5`, which includes OpenROAD, Yosys, KLayout and kepler-formal.
- Platforms: sky130hd, gf180, ihp-sg13g2, nangate45, asap7 and gt2n, all included in ORFS. ICsprout 55 nm uses a platform configuration we built ourselves.
- Power is only an OpenROAD estimate without stimulus. It is only good for comparing orders of magnitude, so the summary table leaves it out.

## Next

- [The Bard chip](index.md): sign-off results for SKY130 v8g.
- [FPGA port](fpga.md): results for the same full chip on an FPGA.
