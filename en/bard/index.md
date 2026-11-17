# The Bard chip

> A language model built directly as a chip. This version writes English sentences in the style of children's stories. They often don't hang together, the characters get mixed up, and a ⁇ (a word the model doesn't know) sometimes appears. We are working on upgrading it into a chip that can tell a coherent story; it is not there yet. The design files are stored on X Layer. It has not been sent to a factory yet.

::: buttons
- [Watch it write and fetch the design files in the app](../../app/#bard)
- [Fetch the design files from the chain (gateway page)](https://1-2-245.aihashrate.stream/bard/v8g/)
:::

## What it is

- The chip has no processor and no program. What the model learned is etched into the circuit. Turn on the power and it writes.
- The model comes from tiny-tiny-stories (MIT license). It writes English sentences in the style of children's stories; they often don't hang together and the characters get mixed up.
- The design uses only open-source tools. The process is SkyWater SKY130.
- The full design files are stored on X Layer. Anyone can fetch them and check them byte for byte.

## Numbers

| Item | Value |
|---|---|
| Process | SkyWater SKY130 (`sky130_fd_sc_hd`) |
| Layout size | 3,166.63 × 4,766.63 µm, 15.09 mm² |
| Parameters etched into the chip | About 1 million |
| Cell instances | 460,676 |
| Version | v8g |
| Design files on chain | 2026-10-12, X Layer, `bard/v8g/` on 1.2.245.tape |

## Sign-off results (v8g)

| Check | Result |
|---|---|
| KLayout DRC | 0 |
| Netgen LVS | Match (Circuits match uniquely) |
| Antenna (OpenROAD check) | 0 nets |
| Setup time, nine corners | 0 violations, worst slack 26.73 ns |
| Hold time, nine corners | 0 violations, worst slack 0.0509 ns |
| Post-route netlist replay | L1→32 (2,499,420 cycles), L2→5 (5,612,207 cycles), L3→128 (9,418,594 cycles), the same as the reference implementation |

> All of these results were computed by layout tools and simulation. The chip has not been made, so there is no measured data.

> Scope of the antenna row: the check ran on the layout before fill was added. That layout and the GDS that was later signed off have not been matched by hash; the records from that time say they are the same design. The check used the antenna data in the cell library, not a foundry sign-off tool.

## Where it stands

- 2026-10-12: the design passed every design rule check (DRC), and the design files were stored on X Layer.
- Where and when it will be made: not decided yet.
- The same netlist has been through place and route on seven platforms. See [Process ladder](nodes.md).
- The full chip routes on an XC7A100T FPGA, with timing at 21.19 MHz. See [FPGA port](fpga.md). It is not on a real board yet.
- ESP32-S3 firmware writes sentences with the same integer rules. On a computer it was compared with the standard implementation on 12 sets, and all of them match. See [Story box](storybox.md). It is not on a real board yet.

## Pages in this group

::: cards
- [Fetch the design files from the chain](fetch.md) Fetch the two parts, join them back into the original file, check the sha256.
- [Process ladder](nodes.md) The same netlist: area and frequency on seven platforms.
- [FPGA port](fpga.md) Routes on an XC7A100T; gate-level cycle comparison matches on L1 and L2.
- [Story box](storybox.md) An ESP32-S3 writes sentences with the chip's integer rules.
:::
