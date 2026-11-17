# NAND 玩 Squared

打开 `index.html`（双击或本地静态服务器均可，无后端、无 API key）。页面上是一个 375 NAND 的 TapeOut 网表（`netlist_resyn_puf_full_learn_20k.json`，PufferLib Squared 策略经 DLGN 蒸馏后由 yosys/abc 导出），由一个 Web Worker 按位求值，实时驱动 11×11 的 Squared 游戏。右侧三方一致面板显示页面 NAND 求值 == Python 参考（LUT 门电路）每一步一致；“链上跑一步”按钮在用户把该网表烧录出 cid 后，用只读 eth_call 对 CPU 0x6Fb4…5B38 调 step() 并与页面结果对比。文件里的 `build_demo.py` 从网表 JSON 重新生成这一页。
