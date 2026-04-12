# DevTools MCP 直连说明

## 背景

如果打开的是：

`http://localhost:9222/devtools/inspector.html?ws=localhost:9222/devtools/page/...`

那么这个地址本身不是网易云页面本体，而只是一个 DevTools 前端页面。

它的作用是：

- 浏览器标签页里打开一个 DevTools UI
- 这个 UI 再通过 `ws=.../devtools/page/...` 去连接网易云 CEF 的真实 target

所以它天然是一个“壳页面”，不是被调试对象本身。

## 为什么会看到两个 DevTools

- 左边那层 DevTools，是 `inspector.html` 远程连接网易云 target 后显示出来的真正调试界面
- 右边那层 DevTools，是又对 `inspector.html` 这个浏览器标签页按了一次 `F12`

因此：

- 左边更接近网易云本体日志
- 右边是在调试 `inspector.html` 自己

## 给 AI 和自动化工具的硬规则

### 禁止

不要把下面这些地址当成“目标页面”去导航、截图、点元素或再按 `F12`：

- `http://localhost:9222/devtools/inspector.html?...`
- `http://127.0.0.1:9333/devtools/inspector.html?...`
- 任何 `devtools://` 页面
- 标题类似 `DevTools - ...` 的页面

### 原因

`Chrome DevTools MCP` 这类工具的模型是“控制一个浏览器标签页”，不是“直接附着到任意 CDP WebSocket target”。

如果 AI 去：

1. 打开 `inspector.html`
2. 再对这个页面做 `navigate_page` / `take_snapshot` / `F12`

那么它调试到的就还是外层 DevTools 容器，而不是网易云本体。

这会导致错误结论，例如：

- “AI 访问不到网易云页面”
- “当前页面是 about:blank”
- “只能看到 DevTools 自己的错误”

## 正确入口

真实目标不是 `inspector.html`，而是它后面的 target：

`ws://localhost:9222/devtools/page/<target-id>`

也就是 `ws=` 参数指向的那个 WebSocket。

## 推荐做法

### 给 CDP / MCP 客户端

先启动代理：

```powershell
bun run devtools:proxy -- "http://localhost:9222/devtools/inspector.html?ws=localhost:9222/devtools/page/640C7784AAE05E32DDAF5BD08380B56D" --listen-port 9333
```

然后只允许客户端连接：

- `http://127.0.0.1:9333/json/list`
- 返回结果中的 `webSocketDebuggerUrl`

不要再去打开：

- `http://127.0.0.1:9333/devtools/inspector.html?...`
- `http://localhost:9222/devtools/inspector.html?...`

### 给 AI / 脚本调用

先启动代理：

```powershell
bun run devtools:proxy -- "http://localhost:9222/devtools/inspector.html?ws=localhost:9222/devtools/page/640C7784AAE05E32DDAF5BD08380B56D" --listen-port 9444
```

然后优先使用这些 HTTP API，而不是页面导航：

- `GET http://127.0.0.1:9444/`
- `GET http://127.0.0.1:9444/api/bootstrap`
- `GET http://127.0.0.1:9444/api/target`
- `GET http://127.0.0.1:9444/api/logs?recent=50`
- `POST http://127.0.0.1:9444/api/evaluate`

其中：

- `/` 是给 AI 看的引导页面，页面中会明确列出“AI 应该读取什么”和“AI 不应该读取什么”
- `/api/bootstrap` 是给 AI 程序直接读取的统一 JSON 引导入口

示例：

```http
POST /api/evaluate
Content-Type: application/json

{"expression":"document.location.href"}
```

## AI 的推荐调用顺序

1. 调 `GET /api/bootstrap`
   先读取统一引导信息，确认可用入口和禁止入口
2. 调 `GET /api/target`
   先确认当前连接到的是不是 `orpheus://orpheus/pub/app.html...`
3. 调 `GET /api/logs`
   直接读取网易云本体日志
4. 调 `POST /api/evaluate`
   在网易云本体上下文里执行脚本
5. 只有在明确需要 CDP target 列表时，才用 `/json/list`

## AI 不应该做什么

AI 不应该：

1. `navigate_page("http://127.0.0.1:9333/json/list")`
2. 从页面里提取 `devtoolsFrontendUrl`
3. 再 `navigate_page(".../devtools/inspector.html?...")`
4. 再对这个页面截图、取快照、执行脚本

这条路径会重新回到 DevTools 容器页面，属于错误用法。

## 本地脚本说明

- `bun run devtools:launch -- --exe "D:\\Cloudmusic_32\\CloudMusic\\cloudmusic.exe" --port 9222`
  用远程调试端口启动网易云
- `bun run devtools:resolve -- "<inspector.html?ws=...>"`
  从 `inspector.html?ws=...` 解析出真正的 `webSocketDebuggerUrl`
- `bun run devtools:tail -- "<inspector.html?ws=...>"`
  直接订阅真实 target 的控制台日志、异常和 `Log.entryAdded`
- `bun run devtools:proxy -- "<inspector.html?ws=...>" --listen-port 9333`
  启动本地代理，并暴露给 MCP / AI 的稳定入口

## 一句话原则

不要调试 `inspector.html`。

要么直接连接它背后的 `ws://.../devtools/page/...` target，
要么调用本项目代理提供的 `/api/target`、`/api/logs`、`/api/evaluate`。
