# Chrome 应用商店上架资料（web2tape）

上传包：`../dist/web2tape-extension.zip`（`sh ../build_site.sh` 生成；版本见 manifest.json）
截图：`screenshot-1280x800.png`
图标：包里的 icon128.png
隐私政策网址：https://nand.aihashrate.stream/web2tape/privacy
主页网址：https://nand.aihashrate.stream/web2tape/
类别：工具（Tools）　语言：中文（简体），可加英文

## 简短说明（≤132 字符）
把正在看的网站存到区块链上：点一下按钮，预览，连钱包确认，得到一个永久网址。

## 详细说明
web2tape 把一个网站存到区块链（TapeOut）上，生成一个永久的新网址；原网站以后改版或关掉，链上这份也还在。

怎么用：
1. 在想存的网站上点工具栏里的 web2tape 按钮
2. 自动打开 web2tape 并预览：默认顺着站内链接存整个网站（最多 30 页，可调）
3. 按「连接钱包，存上链」，在钱包里确认（支持合并确认的钱包 1 次，其他 2 次），完成后得到新网址

存下来的是网页的样子（静态快照）：文字、图片、样式、字体都在链上；搜索、登录、评论这类功能不会保留。
读网页不带你的登录状态，不收集任何数据；存上链的内容公开且无法删除，请只存你有权公开的内容。

## 单一用途说明（Single purpose）
把用户指定的网站读成静态快照，交给 web2tape 页面存到区块链上。

## 权限说明（Permission justification）
- host_permissions `<all_urls>`：用户要存的网站可以是任何网址；插件需要读取该网站的公开网页、图片、样式、字体（不带 Cookie）。
- tabs：工具栏按钮读取当前标签页的网址并打开 web2tape；对靠脚本渲染的页面，临时在后台打开该网址的标签页，读完关闭。
- scripting：在上述临时标签页里读取渲染后的 HTML（document.documentElement.outerHTML）。
- 内容脚本只注入 https://nand.aihashrate.stream/web2tape/* 与本机开发地址，用于页面与插件之间传话。

## 数据使用声明（Privacy practices）
不收集任何用户数据（不勾选任何数据类型）；不出售、不转让；不用于与单一用途无关的目的；不用于信用评估。
远程代码：不使用（所有代码都在包内）。
