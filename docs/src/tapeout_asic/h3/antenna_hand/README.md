# v8 整机天线手写修复与整片签核脚本（H2）

这些脚本把 v8 整机的天线违例网从 7,451 修到 0，并做了整片签核，结果发布为 `machine-r135-rom-v8g`。过程和结论写在 [../HIER.md](../HIER.md) 的 v8g 一节。

所有脚本都在远程机器上跑，不在本机跑。EDA 工具一律在 LibreLane 3.0.14 的 rootfs 里用 bwrap 运行（入口 `$WORK/h2/ll.sh`）。

| 目录 | 远程原位置 | 内容 |
|---|---|---|
| `hand/` | build-host `$WORK/h2/post/hand/` | 手写修复工具，见下文；`*_head/_mid/_tail/_loop.py` 是拼装前的分段源码。 |
| `post/` | build-host-2 `$WORK/h2/post/` | `post.sh TAG ODB` 一条命令跑完填充、九角 STA、StreamOut、KLayout DRC、Magic 抽取、cmp.py 和 Netgen；`v2sp.py`/`mklvs.py` 生成按网名匹配的 Netgen 输入。 |
| `eco31/` | build-host-2 `$WORK/h2/eco31/` | 最后一根网的处理：换大一号单元、挪位、只拆 3 根网，按过滤后的 GRT 导引跑 DRT。 |

`hand/` 里的工具：

| 文件 | 做什么 |
|---|---|
| `hand2.py` | 用 A* 把 diode 布到空位。 |
| `hand_t.py` | 在走线树上找切点：把一整段线抬到上一层跳过去。 |
| `hand_j.py` | 加跳线。 |
| `hand_b.py` | 把栅极一侧接到驱动端。 |
| `hand_r.py` | 重新选引脚的接入点（repin）。 |
| `cellmove.py` | 在已布线的 DEF 上挪单元、换型号、移动 via。 |
| `defcheck.py` | 只对新加图形查 DRC，对 KLayout 校准过。 |
| `chainN.sh` | 一轮修复接一次 OpenROAD 天线检查。 |
