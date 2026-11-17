# 模型机

> 跑二值模型的小电脑。权重只有开和关，这页就能跑一个玩具模型。

## 在这里跑

<div class="demo">
<p><button class="btn primary" id="run" type="button" disabled style="display:inline-grid;text-align:center"><span style="grid-area:1/1">写 200 个字</span><span style="grid-area:1/1;visibility:hidden" aria-hidden="true">写 200 个字</span><span style="grid-area:1/1;visibility:hidden" aria-hidden="true">再写 200 个</span><span style="grid-area:1/1;visibility:hidden" aria-hidden="true">正在写…</span><span style="grid-area:1/1;visibility:hidden" aria-hidden="true">停</span></button> <label class="btn" style="cursor:pointer">换一个 .tbw1<input type="file" id="file" accept=".tbw1" hidden></label></p>
<pre class="demo-out" aria-live="polite"><span class="p" id="prompt"></span><span id="gen"></span></pre>
<p class="demo-facts">文件 <span id="f-file">toy_bmlp.tbw1 · 102,400 B</span> · <span id="f-shape">看前 24 个字节 · 两层各 512 个二值单元 · 524,288 个一位权重</span><br>文件 sha256 <span id="f-sha" data-reg="11c1c4b177a2308ee64732335335e044e4cf32ce0ddef75210b0d5fa4f5ed568">11c1c4b177a2308ee64732335335e044e4cf32ce0ddef75210b0d5fa4f5ed568</span><span id="f-sha-st" style="display:block">（登记值，正在核对…）</span><br>输出 sha256 <span id="f-out" data-reg="0aef22dfb94c5a76f0aa1eba5ac3f3a1852ba1982a1965a5235b696579a7acca">0aef22dfb94c5a76f0aa1eba5ac3f3a1852ba1982a1965a5235b696579a7acca (200 B)</span><span id="f-out-st" style="display:block">（标准答案，写完 200 个字后核对）</span><span id="f-speed">—</span></p>
</div>
<script src="../machine/bmlp.js" defer></script>
<script src="../machine/demo.js" data-model="../machine/toy_bmlp.tbw1" defer></script>

全在浏览器里算：不连服务器、不上链、不用钱包。

## 自己核对

1. 看上面「文件 sha256」，应该是 `11c1c4b177a2308ee64732335335e044e4cf32ce0ddef75210b0d5fa4f5ed568`。
2. 点一次「写 200 个字」，「输出 sha256」应该是 `0aef22dfb94c5a76f0aa1eba5ac3f3a1852ba1982a1965a5235b696579a7acca`。
3. 换电脑、换浏览器再跑，结果一样。页面只用整数运算。

## 它是什么

- 二值模型：每个权重只有 +1 或 −1，乘法变成「比一比两个位一不一样，再数个数」。
- 电路是我们自己设计的：处理器核、二值乘加单元、内存控制器、显示和串口。目前在仿真里跑通，还没做成实物。
- 开机时从 tape 容器取回运行时和模型，逐个核对指纹和签名；核不上就退回上一个能用的版本。

## 这个玩具模型

| 项 | 值 |
|---|---|
| 大小 | 102,400 字节 |
| 看前面 | 24 个字节 |
| 隐层 | 两层，各 512 个二值单元 |
| 一位权重 | 524,288 个 |
| 训练语料 | 吟游诗人的模型写出的故事，源头 tiny-tiny-stories（MIT） |

它只为把整条路跑通，写出的英文还不通顺。

## 做到哪了

- 已做到：取回、核对、起运行时、写字，在模拟器和电路仿真里跑通，和参考实现逐字节相同。
- 已做到：同一套引导程序在普通电脑上运行 17 亿参数的三值模型（Prism ML 的 Bonsai，Apache-2.0），输出和直接运行相同。
- 还没做：上真板子、量真机速度。
