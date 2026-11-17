# Full-machine architecture

> The model machine's main line runs in pure software on a small computer (SBC). This page covers FPGA plus ESP32-C3, a research line that has only run in simulation.

> **The main line is pure software on an SBC**: a runtime we wrote runs the model on a small ARM computer, and fetching firmware from the chain works the same way. See [A large model on a small computer](sbc.md). The FPGA plus ESP32-C3 design below is a research line: we designed the circuits ourselves, and so far they have only run in simulation. No physical board exists yet.

## Research line: one diagram

```text
 tape container on chain (BSC / X Layer)
   tapeboot/<board>/channel/*.json   channel pointer
   tapeboot/<board>/<seq>/…          manifest and files
        │  read-only eth_call: fileInfo / readRange (if a node fails, try the next; always check hashes)
        ▼
 ESP32-C3: boot firmware + TapeBoot client
   read channel → check signature and hashes → fetch chunk by chunk (cached on microSD)
        │  SPI mailbox: write the runtime and TBW1 into DDR3, then release soft core reset
        ▼
 FPGA (GW2A-18)
   rv32ima soft core ── bus ── DDR3 controller (128 MB)
                         ├─ UART
                         ├─ timer / SYSCON
                         ├─ HDMI text console
                         └─ binary multiply-add unit (XNOR + popcount, reads weights from DDR3 itself)
```

> It runs in simulation now. No physical board exists yet.

## Parts

| Part | What it is | What it does |
|---|---|---|
| ESP32-C3 | Boot chip. Runs the boot firmware, which includes the TapeBoot client | Connects to Wi-Fi and reads the chain; checks signatures and hashes; fetches chunk by chunk; writes DDR3 through the SPI mailbox; watches the heartbeat to decide between commit and rollback |
| microSD | Attached to the C3 | Chunk cache and the two slots, A and B. With no network, it boots from the most recent slot that passed its checks |
| GW2A-18 FPGA | Target board: Tang Primer 20K | Holds the circuits below. The bitstream stays in the onboard flash. You flash it over USB, not from the chain |
| rv32ima soft core | M-mode, no MMU, compatible with mini-rv32ima | Starts running from `0x8000_0000` after reset |
| DDR3 | 128 MB | The first 16 MB hold the runtime; the rest holds a model of up to 112 MB |
| Binary multiply-add unit | XNOR + popcount | Computes a whole matrix-vector product in one go, reading DDR3 by itself |
| UART | 8250 subset, 8N1, 115200 | Serial output |
| HDMI text console | 80×30 characters, 2 bytes per cell (character + color) | Screen output |
| Runtime | TBRT bare-metal runtime (main), TapeOut Linux (secondary) | Loads the model, runs inference, writes text |

## Three interfaces

| Interface | Two sides | What it covers | See |
|---|---|---|---|
| IF-1 | Model ↔ hardware, runtime | Layout of the TBW1 weight file. The whole file goes on chain as is, into DDR3 as is, and the multiply-add unit reads it directly, with no conversion along the way | [TBW1 weight format](../reference/tbw1.md) |
| IF-2 | Hardware ↔ system | Memory map, multiply-add unit registers, the SPI mailbox between the C3 and the FPGA | Further down this page |
| IF-3 | Protocol ↔ system | TapeBoot: on-chain paths, manifest, signature, check order, A/B slots | [Fetch firmware from the chain](tapeboot.md), [TapeBoot spec](../reference/tapeboot.md) |

## Memory map

Peripheral addresses are the same as in mini-rv32ima, so the TapeOut Linux image on chain can boot as is.

| Address | Size | Content |
|---|---|---|
| `0x8000_0000` | 16 MB | Runtime / operating system |
| `0x8100_0000` | Up to 112 MB | Model area: the TBW1 file sits here as is |
| `0x1000_0000` | `0x100` | UART |
| `0x1100_4000` / `0x1100_BFF8` | — | mtimecmp / mtime |
| `0x1110_0000` | 4 | SYSCON: write `0x5555` to power off, `0x7777` to restart |
| `0x2000_0000` | `0x100` | Binary multiply-add unit |
| `0x2100_0000` | 8 KB | HDMI text console |
| `0x2200_0000` | `0x100` | Mailbox: status registers between the C3 and the soft core |

## Multiply-add unit registers

All are 32 bits. Write the addresses and sizes, set bit0 of `CTRL` to start, then wait for bit1 of `STATUS`.

| Offset | Name | Description |
|---|---|---|
| `0x00` | CTRL | bit0 start, bit1 clear interrupt |
| `0x04` | STATUS | bit0 busy, bit1 done, bit2 error |
| `0x08` | W_ADDR | Byte address of the weight tensor in DDR3 |
| `0x0C` | X_ADDR | Input vector, 64-bit aligned |
| `0x10` | Y_ADDR | int32 output |
| `0x14` | COLS | Number of columns |
| `0x18` | ROWS | Number of rows |
| `0x1C` | SCALE_ADDR | Address of the scale table |
| `0x20` | SCALE_KIND | Scaling method, see [TBW1](../reference/tbw1.md) |
| `0x24` | GROUP | Group size |
| `0x28` | PERF_CYCLES | Read-only, cycles used |
| `0x2C` | ACT_BITS | Input bit width; 0 and 1 both mean one-bit input |
| `0x30` | W_KIND | 0 = one-bit weights (reset value), 1 = INT8, anything else is an error |

## SPI mailbox

The C3 is the host. Mode 0, most significant bit first, SCK no faster than 1/8 of the FPGA clock. One chip-select low period is one command. All multi-byte fields are little-endian.

| Command | Format | What it does |
|---|---|---|
| `0x01` WRITE | `addr[4]` followed by data | Writes to DDR3. Works only while the soft core is in reset |
| `0x02` READ | `addr[4] dummy[2]`, then read continuously | Reads DDR3. Works only while the soft core is in reset |
| `0x03` RESET | `v[1]` | bit0 = 1 holds the soft core in reset, 0 releases it. Held by default at power-on |
| `0x04` REG_WR | `reg[1] v[4]` | For now it can only write `0x00` BOOT_INFO |
| `0x05` REG_RD | `reg[1] dummy[1]`, then read `v[4]` | Reads a register from the table below |

| Register | Content |
|---|---|
| `0x00` BOOT_INFO | High 16 bits = low 16 bits of the manifest's seq; low 16 bits = first 2 bytes of the manifest's sha256. Only lets the runtime print which version it is |
| `0x04` HEARTBEAT | The soft core adds 1 every second; cleared during reset |
| `0x08` MSG | Status code from the soft core to the C3; cleared during reset |
| `0x0C` STATUS | bit0 soft core in reset, bit1 soft core powered off, bit2 DDR3 access refused outside reset, bit3 multiply-add unit busy, bit4 DDR3 calibration done, bit5 calibration failed |
| `0x10` Version | ASCII `MB01`; `MB02` when it has the DDR3 calibration bits |

## Boot order

1. The FPGA starts from the onboard flash and the DDR3 controller calibrates.
2. The C3 reads the mailbox version every 10 ms. The FPGA counts as up only when it reads `MB01` or `MB02`. If it reads neither within 2 seconds, it stops: it fetches no files and leaves the slots alone.
3. Wait for bit4 of STATUS (DDR3 calibration done).
4. TapeBoot reads the channel, fetches the manifest, checks the signature, then fetches chunk by chunk and checks the hashes. See [Fetch firmware from the chain](tapeboot.md).
5. Through the mailbox, write the runtime to `0x8000_0000` and TBW1 to `0x8100_0000`, then write BOOT_INFO.
6. Release the soft core reset. The soft core starts running from `0x8000_0000`.
7. If HEARTBEAT goes from 0 to non-zero within 60 seconds, the version counts as healthy and is committed. Otherwise it goes back to the old slot.

## Two runtimes

| Runtime | Use | Health test |
|---|---|---|
| TBRT bare-metal runtime (main line) | Runs inference right after start, driving the multiply-add unit and HDMI directly | A heartbeat within 60 seconds |
| TapeOut Linux (secondary line) | Boots the Linux 6.5.12 on chain as is and matches the on-chain machine instruction by instruction; about 41.8 million instructions to boot | The soft core has not powered off 60 seconds after reset is released |

The `role` of a file in the manifest, `runtime` or `os`, decides which one starts.

## The version without an FPGA

The same TapeBoot also runs as a Linux program on a small ARM computer. Fetching, checking and the A/B slots are all the same; the heartbeat goes through a pipe instead. See [A large model on a small computer](sbc.md).
