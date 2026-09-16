# TapeoutLLM · 浏览器工作台

打开 `index.html`（双击或本地静态服务器，无后端、无 API key）。一个专用 Web Worker 按位求值已经烧在 BSC 上的一步模型网表（默认 cid 286 = netlist_resyn_cap_s4，5,120 NAND；可切 cid 285），在页面里逐字符续写文本；打开「链上执行」后每个字符都来自对 CPU 0x6Fb4…5B38 的只读 eth_call step()，并与浏览器内求值逐字对照。页面加载时用 SHA-256 校验嵌入的 nl_hex 与烧录 calldata 一致。`build_tapeoutllm_ws.py` 从网表 JSON 重新生成这一页。
