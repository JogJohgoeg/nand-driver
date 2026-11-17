# FPGA port

> The Bard's full chip v8g routes on an XC7A100T with an open-source toolchain, with timing at 21.19 MHz. It is not on a real board yet.

## Results

| Device | Synthesis | Place and route | Timing |
|---|---|---|---|
| XC7A100T-1FTG256C | LUT about 45.0k / 63.4k, FF 21.4k (17%), RAMB18 107 + RAMB36 10 | Routed, about 12 minutes, under 1 GB of memory | 21.19 MHz, required above 16.7 MHz, passes |
| LFE5U-85F (ECP5) | LUT4 69.4k / 83.6k (83%) | Routing did not converge, stopped on 10-30 | — |
| XC7A75T | Estimated from the 100T result, LUT about 96% | Not tried | — |

- The input is the FPGA RTL of the full chip v8g (the Tang Mega 138K version). Only the target device changed.
- Timing requirements: 50 MHz main clock, SLOW=3. Single-cycle paths must run above 16.7 MHz, and three-cycle paths must be shorter than 60 ns.
- XC7A100T went all the way to a bitstream (3,825,899 bytes).

## Toolchain

All open-source tools:

- Yosys 0.69 (oss-cad-suite), `synth_xilinx`.
- openXC7: the openxc7 package of Apio 1.6.0, which includes nextpnr-xilinx. The chipdb for XC7A100T-FTG256 is a separate download, and its SHA-256 was checked.
- fasm2frames, xc7frames2bit: turn the routing result into a bitstream.

## Build

```sh Synthesize to a Xilinx 7 series netlist
yosys -p "read_verilog top_tang138k_ce.v uart_shell_ce.v machine_ce.v body_ram2_ce.v; synth_xilinx -family xc7 -top top -json syn_xc7.json; stat"
```

```sh Place and route on XC7A100T-FTG256, with a single-cycle target of 17 MHz
nextpnr-xilinx --chipdb xc7a100tftg256.bin --xdc xc7a100t.xdc --json syn_xc7.json --fasm pnr_xc7.fasm --freq 17 --timing-allow-fail --report pnr_xc7_report.json
```

Then use fasm2frames and xc7frames2bit to turn `pnr_xc7.fasm` into a bitstream.

Pin constraints `xc7a100t.xdc` (for verification only):

```text
set_property PACKAGE_PIN D13 [get_ports clk]
set_property IOSTANDARD LVCMOS33 [get_ports clk]
set_property PACKAGE_PIN A3 [get_ports rx]
set_property IOSTANDARD LVCMOS33 [get_ports rx]
set_property PACKAGE_PIN A2 [get_ports tx]
set_property IOSTANDARD LVCMOS33 [get_ports tx]
```

## Timing recheck

We walked the paths ourselves on the post-route SDF. The endpoints include the CE and SR pins, which nextpnr's own report does not check.

| Check | Longest (raw SDF) | Longest (with Artix-7 cell delays) | Required | Result |
|---|---|---|---|---|
| Single-cycle: the 5 flip-flops that toggle every cycle → 21,988 endpoints | 9.489 ns | 9.701 ns | < 20 ns | Passes |
| Three-cycle: all sequential cells | 47.187 ns | 47.390 ns | < 60 ns | Passes |

- The longest three-cycle path, 47.187 ns, is exactly 1 / 21.19 MHz, which agrees with nextpnr's report.
- The "with cell delays" column uses Artix-7 data from prjxray-db, because the nextpnr-xilinx SDF has no clock-to-output or setup times for block RAM, LUT-RAM and SRL. Clock skew is not counted.
- This is not sign-off. Sign-off needs Vivado.

## Gate-level cycle comparison

We ran the whole-board netlist in Verilator and fed it the three test cases L1, L2 and L3 over the serial port.

| Netlist | L1 (expects 32) | L2 (expects 5) | L3 (expects 128) |
|---|---|---|---|
| After synthesis | Passes | Passes | No result |
| After routing | Passes | Passes | No result |
| Negative control one: a RAM's read address tied to 0 | Fails | Fails | Stopped |
| Negative control two: 35 shift register addresses changed back to their synthesis values | Fails | Fails | Stopped |

- On L1 and L2, the outputs of the two real netlists are the same one by one, and the clock counts match the reference replay: L1 2,499,420 cycles, L2 5,612,207 cycles.
- Both negative controls fail, which shows this comparison can catch a RAM address that is off by one bit and a wrong shift register length.

## Not verified yet

1. Gate-level cycle comparison on L3.
2. The bitstream itself: the comparison checks the post-route netlist, not a netlist recovered from the bitstream.
3. ECP5: routing did not converge, so there was no cycle comparison or timing recheck.
4. Real hardware: there is no board. The schematic and PCB of a small XC7A100T board are drawn, but the board has not been made.

## Next

- [Process ladder](nodes.md): results for the same netlist on seven chip processes.
- [Story box](storybox.md): the same integer rules running on an ESP32-S3.
