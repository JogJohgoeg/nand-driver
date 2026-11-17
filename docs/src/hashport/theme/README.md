# 全站绿色版式规范（2026-10-01）

用户：「重新设计主站点 UI，参考 hermes-agent.nousresearch.com」「我们换绿色」「全部统一」。
首页（`dlgn_ctrl/showcase.html`）和总表页（`build_chain_sites.py`）是样板，其余页面照这里统一。代码片段在 `green-kit.css`。

## 1. 气质

参考 Hermes Agent：整块**主色带**（绿）与**纸面带**（米白）交替；**超窄细体大标题**；**等宽小标签**（大写、宽字距）；
**方角**按钮与卡片（`border-radius:0`）；**虚线**分隔；折叠项右侧「+」；视口四周一道细框；页脚可有大号淡色字标。
不要圆角、阴影、渐变按钮、毛玻璃。信息照旧，只换皮和排版；每页的功能、交互、id、脚本依赖的类名都不能坏。

## 2. 颜色（只用这些）

| 用途 | 浅色 | 深色模式 |
|---|---|---|
| 主绿（色带、纸面上的标题/链接/主按钮） `--g` | `#006B35` | `#006A34` |
| 绿带里的内嵌面板 `--g-deep` | `#005C2B` | `#00522A` |
| 更深的内嵌（输入框底） `--g-deeper` | `#004A22` | `#00401F` |
| 视口细框 `--frame` | `#1E8C4E` | 同 |
| 强调（绿底上：亮起的门、强调字、焦点环） `--lime` | `#E4F53C` | 同 |
| 纸面底 `--bg` | `#F2F3EF` | `#0D1A12` |
| 卡片底 `--panel` | `#FFFFFF` | `#13241A` |
| 正文 `--ink` / 次要 `--ink2` / 再次 `--ink3` | `#0B2A18` / `#3C5446` / `#5A6E62` | `#E6EFE8` / `#A9BCB0` / `#7E9386` |
| 细线 `--line` / 粗线 `--line2` | `rgba(0,107,53,.26)` / `.55` | `rgba(91,224,143,.22)` / `.5` |
| 纸面上的强调/链接 `--hi` | `#006B35` | `#5BE08F` |
| 绿带上的文字 | `#F2F3EF`，次要 90% 不透明，小号标签 82% | 同 |
| 警告/错误 | `#B3261E`（深色模式 `#FF8A80`） | |
| 产品自带的识别色（279 号车的橙 `#E8622D` 等） | 保留，不当界面强调色 | |

对比度都按 WCAG AA：正文 ≥ 4.5，大字 ≥ 3。在绿带上：米白字 6.0、黄绿 5.5。

## 3. 字体

- **主站页面**（只在 nand.aihashrate.stream / Pages 上）可以用 Google Fonts：
  `https://fonts.googleapis.com/css2?family=Antonio:wght@100..700&family=Archivo:wdth,wght@62..125,100..900&family=IBM+Plex+Mono:wght@400;500&family=Noto+Sans+SC:wght@200..700&display=swap`
  - 标题、按钮、导航：`"Antonio","Noto Sans SC","PingFang SC","Microsoft YaHei",sans-serif`，细体（200–300），英文用大写。
  - 正文：`"Archivo","Noto Sans SC","PingFang SC","Hiragino Sans GB","Microsoft YaHei",system-ui,sans-serif`
  - 标签、数字、代码：`"IBM Plex Mono",ui-monospace,SFMono-Regular,Menlo,monospace`
- **链上页面**（282.732.tape、288.732.tape、1.2.245.tape 的文件，以及与链上同一文件的主站页面）**不连任何链外资源**，只用系统字体：
  - 标题：`"Avenir Next Condensed","Bahnschrift","DIN Condensed","Roboto Condensed","Arial Narrow","PingFang SC","Hiragino Sans GB","Microsoft YaHei",sans-serif` + `font-stretch:condensed`，细体 200–300
  - 正文：`-apple-system,BlinkMacSystemFont,"PingFang SC","Hiragino Sans GB","Microsoft YaHei","Noto Sans CJK SC","Segoe UI",system-ui,sans-serif`
  - 等宽：`ui-monospace,"SF Mono",Menlo,Consolas,monospace`
- 中文大标题加 `word-break:keep-all;overflow-wrap:anywhere`（只在标点处断行，太长再兜底）。中文不加大字距、不转大写；英文标签才 `text-transform:uppercase` + `letter-spacing:.1em`。

## 4. 组件

- **页头**：一条绿带（高约 64–76px），左边字标「21 NAND / DRIVER」（窄体细体、两行、大写）+ 小字 `TapeOut · BNB Chain`，链回主站首页；
  右边放本页已有的语言切换等控件。应用类页面（满屏布局）只需要把原有顶栏换成这个配色和字体，不必硬加一条。
- **主按钮**：纸面上绿底米白字，绿带上米白底绿字；次按钮：透明底 + 1px 线，或绿带上 `rgba(242,243,239,.14)` 底。方角，窄体字，英文大写。
- **卡片**：白底（深色模式 `--panel`）、1px `--line`、方角；需要强调时顶部 4px 绿线，或整张做成绿底。
- **小标签/chip**：等宽 12–12.5px，1px 虚线框；需要钱包等「要准备的」用实线绿框。
- **表格**：表头等宽小号大写、底部 1px 粗线；行与行之间虚线。数字等宽、`tabular-nums`。
- **折叠项**（details）：上下虚线，summary 窄体细体大字、右侧「+」，展开时旋转 45°。
- **输入框**：方角、1px 线；绿带里用 `--g-deeper` 底、米白字。焦点环：纸面上绿，绿带上黄绿。
- **视口细框**：`body::after{content:"";position:fixed;inset:0;border:5px solid #1E8C4E;pointer-events:none;z-index:1000}`（窄屏 3px）；满屏应用若遮挡操作可省。

## 5. 验收（每页都要过）

1. 功能不变：本页原有按钮、表单、运行、钱包、语言切换都照常；控制台无新报错。
2. 浅色、深色、中英文、手机宽 390px、桌面 1440px 各看一遍，无横向溢出。
3. 链上页面不出现任何 `https://` 的样式表、字体、脚本、图片（只读链上的 RPC 调用照旧）。
4. 文字对比度过 AA；可点区域在触屏下 ≥ 44px。
5. 截图（无头 Chrome）：`"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --disable-gpu --hide-scrollbars --window-size=1440,900 --screenshot=out.png URL`
