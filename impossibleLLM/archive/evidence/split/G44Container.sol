// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface ICircuits {
  function step(uint256 cid, bytes calldata state, bytes calldata input) external view returns (bytes memory, bytes memory);
}

contract G44Container {
  address public immutable CPU;
  uint256 public immutable C0;
  uint256 public immutable C1;
  uint256 public immutable C2;
  uint256 public immutable C3;
  uint256 public immutable C4;
  bytes public WIRING;

  constructor(address cpu, uint256[5] memory cids, bytes memory wiring) {
    CPU = cpu;
    C0 = cids[0];
    C1 = cids[1];
    C2 = cids[2];
    C3 = cids[3];
    C4 = cids[4];
    WIRING = wiring;
  }

  function rd16m(bytes memory b, uint off, uint i) internal pure returns (uint) {
    uint o = off + i * 2;
    return (uint256(uint8(b[o])) << 8) | uint256(uint8(b[o + 1]));
  }
  function rd24m(bytes memory b, uint off, uint i) internal pure returns (uint) {
    uint o = off + i * 3;
    return (uint256(uint8(b[o])) << 16) | (uint256(uint8(b[o + 1])) << 8) | uint256(uint8(b[o + 2]));
  }
  function setBit(bytes memory b, uint i, uint v) internal pure {
    if (v == 1) b[i >> 3] = bytes1(uint8(b[i >> 3]) | uint8(uint8(1) << uint8(i & 7)));
    else b[i >> 3] = bytes1(uint8(b[i >> 3]) & ~uint8(uint8(1) << uint8(i & 7)));
  }
  function getBit(bytes memory b, uint i) internal pure returns (uint) {
    return (uint8(b[i >> 3]) >> (i & 7)) & 1;
  }
  function ctxBit(bytes calldata ctx, uint i) internal pure returns (uint) {
    return (uint8(ctx[i >> 3]) >> (i & 7)) & 1;
  }

  function run(bytes calldata ctx) external view returns (bytes6) {
    require(ctx.length >= 24, 'ctx');
    bytes memory W = WIRING;
    bytes memory buf = new bytes(2446);
    {
      bytes memory inp = new bytes(3);
      for (uint i = 0; i < 24; i++) setBit(inp, i, ctxBit(ctx, rd16m(W, 0, i)));
      (, bytes memory out) = ICircuits(CPU).step(C0, '', inp);
      for (uint i = 0; i < 2624; i++) setBit(buf, rd24m(W, 48, i) - 194, getBit(out, i));
    }
    {
      bytes memory inp = new bytes(259);
      for (uint i = 0; i < 2070; i++) setBit(inp, 0 + i, getBit(buf, rd24m(W, 7920, i) - 194));
      (, bytes memory out) = ICircuits(CPU).step(C1, '', inp);
      for (uint i = 0; i < 2531; i++) setBit(buf, rd24m(W, 14130, i) - 194, getBit(out, i));
    }
    {
      bytes memory inp = new bytes(292);
      for (uint i = 0; i < 2331; i++) setBit(inp, 0 + i, getBit(buf, rd24m(W, 21723, i) - 194));
      (, bytes memory out) = ICircuits(CPU).step(C2, '', inp);
      for (uint i = 0; i < 1068; i++) setBit(buf, rd24m(W, 28716, i) - 194, getBit(out, i));
    }
    {
      bytes memory inp = new bytes(171);
      for (uint i = 0; i < 1363; i++) setBit(inp, 0 + i, getBit(buf, rd24m(W, 31920, i) - 194));
      (, bytes memory out) = ICircuits(CPU).step(C3, '', inp);
      for (uint i = 0; i < 41; i++) setBit(buf, rd24m(W, 36009, i) - 194, getBit(out, i));
    }
    {
      bytes memory inp = new bytes(138);
      for (uint i = 0; i < 1102; i++) setBit(inp, 0 + i, getBit(buf, rd24m(W, 36132, i) - 194));
      (, bytes memory out) = ICircuits(CPU).step(C4, '', inp);
      for (uint i = 0; i < 6; i++) setBit(buf, rd24m(W, 39438, i) - 194, getBit(out, i));
    }
    bytes6 res;
    res |= bytes6(uint48(getBit(buf, 19561)) << 40);
    res |= bytes6(uint48(getBit(buf, 19562)) << 32);
    res |= bytes6(uint48(getBit(buf, 19563)) << 24);
    res |= bytes6(uint48(getBit(buf, 19564)) << 16);
    res |= bytes6(uint48(getBit(buf, 19565)) << 8);
    res |= bytes6(uint48(getBit(buf, 19566)) << 0);
    return res;
  }
}
