# Tiny Tapeout submission plan

**Primary information:** select **one IHP SG13G2 tile** for the combined RLT-mini and MiniCPM MAC. Placement/routing and official precheck pass; the routed IHP netlist passes the same functional vectors as RTL.

**Required context:** RLT-mini is untrained toy hard logic; MiniCPM weights and nonlinear operations stay on the host. One clock-buffer fanout warning remains despite passing timing, slew and capacitance checks. The authoritative evidence and physical comparison are in [REPORT.md](REPORT.md).

**Next judgement:** the user decides whether this demonstration merits submission to IHP26b by **2026-09-21**, at the captured **€385 Academic/Industry or €185 eligible Individual** calculator total for one tile and one devkit. No submission or purchase has occurred.

Expression: an ordered build/acceptance plan for one submission; detailed comparisons live in the report.

1. **Semantics and RLT-mini — complete.** Independent integer reference, complete 512-transition NAND/LATCH equivalence and 1,024-token serial/fast vectors.
2. **Tile RTL and MiniCPM datapath — complete.** Shared clocked serial bus; exact signed int8 × int4 arithmetic; real 2,048-term checkpoint-derived projection row; exhaustive product checks and maximum row-length test.
3. **Physical implementation — complete locally.** One-tile IHP and SKY GDS, PVT timing reports, LVS and official precheck. Routed IHP functional simulation passes using the documented zero-delay PDK simulation adapter.
4. **Submission — owner decision pending.** Confirm metadata/license and pricing category; review the disclosed clock-fanout exception with the shuttle operator if proceeding. Use IHP artifacts for IHP26b. No NEE or #279 is added to this candidate.
5. **Hardware acceptance — after manufacture.** Replay the same vectors at 1 MHz and then 10 MHz. Require exact outputs/states before making silicon performance or power claims.

Official [shuttle dates](https://tinytapeout.com/chips/), [IHP calculator](https://app.tinytapeout.com/calculator?pcbs=1&tiles=1&shuttle=ihp), [GPIO rules](https://tinytapeout.com/specs/gpio/) and [local hardening guide](https://tinytapeout.com/guides/local-hardening/) were checked September 13, 2026. Expected IHP chips: June 25, 2027; estimated delivery: August 16, 2027. The dates are estimates. Category eligibility and checkout tax adjustments are unverified.
