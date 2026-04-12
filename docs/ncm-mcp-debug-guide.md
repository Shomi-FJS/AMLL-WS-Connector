# 网易云音乐 MCP 调试指南

本文档记录了通过 MCP (Chrome DevTools Protocol) 调试网易云音乐客户端的常用方法。

## 目录

1. [环境准备](#环境准备)
2. [基础 API 调用](#基础-api-调用)
3. [InfLinkApi 调试](#inflinkapi-调试)
4. [歌词系统调试](#歌词系统调试)
5. [插件日志系统](#插件日志系统)
6. [常见问题排查](#常见问题排查)
7. [状态字段参考](#状态字段参考)

---

## 环境准备

### 1. 启动网易云远程调试

```powershell
bun run devtools:launch -- --exe "D:\Cloudmusic_32\CloudMusic\cloudmusic.exe" --port 9222
```

### 2. 获取 Target ID

```powershell
Invoke-RestMethod -Uri "http://127.0.0.1:9222/json/list" | ConvertTo-Json -Depth 5
```

返回示例：
```json
{
  "id": "640C7784AAE05E32DDAF5BD08380B56D",
  "title": "网易音乐",
  "type": "page",
  "url": "orpheus://orpheus/pub/app.html#/m/disc/rec/",
  "webSocketDebuggerUrl": "ws://127.0.0.1:9222/devtools/page/..."
}
```

### 3. 启动 CDP 代理

```powershell
bun run devtools:proxy -- "http://localhost:9222/devtools/inspector.html?ws=localhost:9222/devtools/page/<TARGET_ID>" --listen-port 9444
```

代理启动后，可通过以下端点访问：

| 端点 | 方法 | 说明 |
|------|------|------|
| `/api/target` | GET | 获取当前目标信息 |
| `/api/logs` | GET | 获取控制台日志 |
| `/api/evaluate` | POST | 执行 JavaScript |

---

## 基础 API 调用

### 执行 JavaScript 表达式

```powershell
$body = @{
  expression = "document.location.href"
} | ConvertTo-Json

Invoke-RestMethod -Uri "http://127.0.0.1:9444/api/evaluate" -Method POST -ContentType "application/json" -Body $body
```

### 获取全局变量

```powershell
$body = @{
  expression = @'
(function() {
  return {
    hasNej: typeof window.NEJ !== "undefined",
    hasInfLinkApi: typeof window.InfLinkApi !== "undefined",
    hasAmllLogApi: typeof window.AMLL_LOG_API !== "undefined",
    hasLoadedPlugins: typeof window.loadedPlugins !== "undefined"
  };
})()
'@
} | ConvertTo-Json

Invoke-RestMethod -Uri "http://127.0.0.1:9444/api/evaluate" -Method POST -ContentType "application/json" -Body $body
```

---

## InfLinkApi 调试

InfLinkApi 是 InfLink-rs 插件提供的播放控制 API。

### 获取 API 信息

```powershell
$body = @{
  expression = @'
(function() {
  const api = window.InfLinkApi;
  if (!api) return { error: "InfLinkApi not found" };
  
  return {
    version: api.version,
    availableMethods: Object.keys(api).filter(k => typeof api[k] === "function")
  };
})()
'@
} | ConvertTo-Json

Invoke-RestMethod -Uri "http://127.0.0.1:9444/api/evaluate" -Method POST -ContentType "application/json" -Body $body
```

### 获取当前歌曲信息

```powershell
$body = @{
  expression = "window.InfLinkApi.getCurrentSong()"
} | ConvertTo-Json

Invoke-RestMethod -Uri "http://127.0.0.1:9444/api/evaluate" -Method POST -ContentType "application/json" -Body $body
```

返回示例：
```json
{
  "songName": "歌曲名",
  "authorName": "歌手名",
  "albumName": "专辑名",
  "ncmId": 123456789,
  "duration": 240000
}
```

### 获取播放状态

```powershell
$body = @{
  expression = "window.InfLinkApi.getPlaybackStatus()"
} | ConvertTo-Json

Invoke-RestMethod -Uri "http://127.0.0.1:9444/api/evaluate" -Method POST -ContentType "application/json" -Body $body
```

返回值：`"Playing"` | `"Paused"` | `"Stopped"`

### 获取播放进度

```powershell
$body = @{
  expression = "window.InfLinkApi.getTimeline()"
} | ConvertTo-Json

Invoke-RestMethod -Uri "http://127.0.0.1:9444/api/evaluate" -Method POST -ContentType "application/json" -Body $body
```

返回示例：
```json
{
  "currentTime": 45000,
  "totalTime": 240000
}
```

### 播放控制

```powershell
# 播放
$body = @{ expression = "window.InfLinkApi.play()" } | ConvertTo-Json

# 暂停
$body = @{ expression = "window.InfLinkApi.pause()" } | ConvertTo-Json

# 下一首
$body = @{ expression = "window.InfLinkApi.next()" } | ConvertTo-Json

# 上一首
$body = @{ expression = "window.InfLinkApi.previous()" } | ConvertTo-Json
```

### 获取音量和播放模式

```powershell
$body = @{
  expression = @'
(function() {
  const api = window.InfLinkApi;
  return {
    volume: api.getVolume(),
    playMode: api.getPlayMode()
  };
})()
'@
} | ConvertTo-Json

Invoke-RestMethod -Uri "http://127.0.0.1:9444/api/evaluate" -Method POST -ContentType "application/json" -Body $body
```

---

## 歌词系统调试

### 检查 NEJ 事件系统

V2 版本网易云使用 NEJ 框架的事件系统分发歌词。

```powershell
$body = @{
  expression = @'
(function() {
  const nej = window.NEJ;
  const nejV = nej ? nej.P("nej.v") : null;
  
  if (!nejV) return { error: "NEJ not found" };
  
  const ge = nejV.Ge;
  const geStr = ge.toString();
  const isWrapped = geStr.includes("NEJ.R.slice") || geStr.includes("args:");
  
  return {
    nejVExists: true,
    geType: typeof ge,
    geWrapped: isWrapped,
    hasE9: typeof ge.e9 === "function"
  };
})()
'@
} | ConvertTo-Json

Invoke-RestMethod -Uri "http://127.0.0.1:9444/api/evaluate" -Method POST -ContentType "application/json" -Body $body
```

### 手动触发 lrcload 事件

```powershell
$body = @{
  expression = @'
(function() {
  const nej = window.NEJ;
  const nejV = nej.P("nej.v");
  const api = window.InfLinkApi;
  const song = api.getCurrentSong();
  
  const mockLyricPayload = {
    song: { id: song.ncmId },
    lyric: {
      lrc: {
        lines: [
          { time: 0, lyric: "[00:00.00] 测试歌词第一行" },
          { time: 5000, lyric: "[00:05.00] 测试歌词第二行" }
        ],
        offset: 0
      }
    }
  };
  
  nejV.Ge(window, "lrcload", mockLyricPayload);
  return { success: true, songId: song.ncmId };
})()
'@
} | ConvertTo-Json

Invoke-RestMethod -Uri "http://127.0.0.1:9444/api/evaluate" -Method POST -ContentType "application/json" -Body $body
```

### 通过 API 获取歌词

```powershell
$body = @{
  expression = @'
(function() {
  const api = window.InfLinkApi;
  const song = api.getCurrentSong();
  const songId = song.ncmId;
  
  return fetch(`https://music.163.com/api/song/lyric?id=${songId}&lv=1&kv=1&tv=-1`)
    .then(res => res.json())
    .then(data => ({
      songId,
      songName: song.songName,
      hasLrc: !!data.lrc?.lyric,
      hasYrc: !!data.yrc?.lyric,
      hasTlyric: !!data.tlyric,
      hasRomalrc: !!data.romalrc,
      lrcPreview: data.lrc?.lyric?.substring(0, 300)
    }));
})()
'@
} | ConvertTo-Json

Invoke-RestMethod -Uri "http://127.0.0.1:9444/api/evaluate" -Method POST -ContentType "application/json" -Body $body
```

---

## 插件日志系统

AMLL WS Connector 插件提供了 `AMLL_LOG_API` 用于日志管理。

### 获取日志统计

```powershell
$body = @{
  expression = "AMLL_LOG_API.getLogStats()"
} | ConvertTo-Json

Invoke-RestMethod -Uri "http://127.0.0.1:9444/api/evaluate" -Method POST -ContentType "application/json" -Body $body
```

### 获取日志列表

```powershell
$body = @{
  expression = "AMLL_LOG_API.listLogs({ pageSize: 50 })"
} | ConvertTo-Json

Invoke-RestMethod -Uri "http://127.0.0.1:9444/api/evaluate" -Method POST -ContentType "application/json" -Body $body
```

### 按类型筛选日志

```powershell
$body = @{
  expression = "AMLL_LOG_API.listLogs({ types: ['error', 'warn'], pageSize: 20 })"
} | ConvertTo-Json

Invoke-RestMethod -Uri "http://127.0.0.1:9444/api/evaluate" -Method POST -ContentType "application/json" -Body $body
```

### 按标签筛选日志

```powershell
$body = @{
  expression = "AMLL_LOG_API.listLogs({ tag: 'AmllStateSync', pageSize: 20 })"
} | ConvertTo-Json

Invoke-RestMethod -Uri "http://127.0.0.1:9444/api/evaluate" -Method POST -ContentType "application/json" -Body $body
```

### 导出日志

```powershell
$body = @{
  expression = "AMLL_LOG_API.exportLogs({ format: 'text' })"
} | ConvertTo-Json

Invoke-RestMethod -Uri "http://127.0.0.1:9444/api/evaluate" -Method POST -ContentType "application/json" -Body $body
```

### 清除日志

```powershell
$body = @{
  expression = "AMLL_LOG_API.clearLogs()"
} | ConvertTo-Json

Invoke-RestMethod -Uri "http://127.0.0.1:9444/api/evaluate" -Method POST -ContentType "application/json" -Body $body
```

---

## 常见问题排查

### 1. InfLinkApi 未定义

**症状**：`window.InfLinkApi` 返回 `undefined`

**排查步骤**：

```powershell
$body = @{
  expression = @'
(function() {
  const plugins = window.loadedPlugins;
  const infLinkrsPlugin = plugins ? plugins["InfLinkrs"] : null;
  
  return {
    hasLoadedPlugins: !!plugins,
    infLinkrsPlugin: infLinkrsPlugin ? {
      name: infLinkrsPlugin.manifest?.name,
      version: infLinkrsPlugin.manifest?.version,
      finished: infLinkrsPlugin.finished
    } : null
  };
})()
'@
} | ConvertTo-Json

Invoke-RestMethod -Uri "http://127.0.0.1:9444/api/evaluate" -Method POST -ContentType "application/json" -Body $body
```

**解决方案**：
- 确保 InfLink-rs 插件已安装并启用
- 检查 BetterNCM 是否正常运行

### 2. NEJ 事件系统未找到

**症状**：`window.NEJ` 返回 `undefined`

**排查步骤**：

```powershell
$body = @{
  expression = @'
(function() {
  return {
    nejExists: typeof window.NEJ !== "undefined",
    nejVExists: typeof window.NEJ?.P === "function" && !!window.NEJ.P("nej.v"),
    playerExists: typeof window.player !== "undefined",
    playerState: window.player?.playState
  };
})()
'@
} | ConvertTo-Json

Invoke-RestMethod -Uri "http://127.0.0.1:9444/api/evaluate" -Method POST -ContentType "application/json" -Body $body
```

**解决方案**：
- 确认网易云版本为 2.10.x（V2 版本）
- 如果是 3.x 版本，需要使用 V3 适配器

### 3. 插件未加载

**症状**：`loadedPlugins` 中没有目标插件

**排查步骤**：

```powershell
$body = @{
  expression = @'
(function() {
  const plugins = window.loadedPlugins;
  if (!plugins) return { error: "loadedPlugins not found" };
  
  const pluginList = Object.keys(plugins).map(key => ({
    name: plugins[key].manifest?.name,
    version: plugins[key].manifest?.version,
    finished: plugins[key].finished
  }));
  
  return { plugins: pluginList };
})()
'@
} | ConvertTo-Json

Invoke-RestMethod -Uri "http://127.0.0.1:9444/api/evaluate" -Method POST -ContentType "application/json" -Body $body
```

### 4. 代理连接失败

**症状**：`Invoke-RestMethod` 报错 "无法连接到远程服务器"

**排查步骤**：

1. 检查网易云是否在运行：
```powershell
Invoke-RestMethod -Uri "http://127.0.0.1:9222/json/list"
```

2. 检查代理是否在运行：
```powershell
Invoke-RestMethod -Uri "http://127.0.0.1:9444/api/target"
```

3. 重启代理：
```powershell
bun run devtools:proxy -- "http://localhost:9222/devtools/inspector.html?ws=localhost:9222/devtools/page/<TARGET_ID>" --listen-port 9444
```

---

## 快速诊断脚本

一键获取所有状态：

```powershell
$body = @{
  expression = @'
(function() {
  const api = window.InfLinkApi;
  const nej = window.NEJ;
  const plugins = window.loadedPlugins;
  
  return {
    ncm: {
      hasNej: !!nej,
      hasInfLinkApi: !!api,
      infLinkApiVersion: api?.version
    },
    playback: api ? {
      song: api.getCurrentSong(),
      status: api.getPlaybackStatus(),
      timeline: api.getTimeline()
    } : null,
    plugins: plugins ? Object.keys(plugins).map(k => ({
      name: plugins[k].manifest?.name,
      version: plugins[k].manifest?.version
    })) : null,
    amll: {
      logApi: typeof AMLL_LOG_API !== "undefined",
      logStats: AMLL_LOG_API?.getLogStats()
    }
  };
})()
'@
} | ConvertTo-Json

Invoke-RestMethod -Uri "http://127.0.0.1:9444/api/evaluate" -Method POST -ContentType "application/json" -Body $body | ConvertTo-Json -Depth 6
```

---

## 状态字段参考

本节记录通过 MCP 可获取的所有状态字段。

### InfLinkApi 字段

#### API 信息

| 字段 | 类型 | 说明 | 示例值 |
|------|------|------|--------|
| `version` | string | InfLink-rs 插件版本 | `"3.2.11"` |

#### getCurrentSong() 返回字段

| 字段 | 类型 | 说明 | 示例值 |
|------|------|------|--------|
| `songName` | string | 歌曲名称 | `"IF YOU"` |
| `authorName` | string | 歌手名称 | `"BIGBANG"` |
| `albumName` | string | 专辑名称 | `"D"` |
| `ncmId` | number | 网易云歌曲 ID | `32922450` |
| `duration` | number | 歌曲时长（毫秒） | `264215` |
| `cover.url` | string | 封面图片 URL | `"https://p3.music.126.net/..."` |

#### getPlaybackStatus() 返回值

| 值 | 说明 |
|------|------|
| `"Playing"` | 正在播放 |
| `"Paused"` | 已暂停 |
| `"Stopped"` | 已停止 |

#### getTimeline() 返回字段

| 字段 | 类型 | 说明 | 示例值 |
|------|------|------|--------|
| `currentTime` | number | 当前播放时间（毫秒） | `45000` |
| `totalTime` | number | 总时长（毫秒） | `264215` |

#### getVolume() 返回字段

| 字段 | 类型 | 说明 | 示例值 |
|------|------|------|--------|
| `volume` | number | 音量值（0-1） | `0.5` |
| `isMuted` | boolean | 是否静音 | `false` |

#### getPlayMode() 返回字段

| 字段 | 类型 | 说明 | 示例值 |
|------|------|------|--------|
| `isShuffling` | boolean | 是否随机播放 | `false` |
| `repeatMode` | string | 循环模式 | `"List"` / `"Single"` / `"None"` |

#### 可用方法列表

| 方法 | 参数 | 说明 |
|------|------|------|
| `getCurrentSong()` | 无 | 获取当前歌曲信息 |
| `getPlaybackStatus()` | 无 | 获取播放状态 |
| `getTimeline()` | 无 | 获取播放进度 |
| `getPlayMode()` | 无 | 获取播放模式 |
| `getVolume()` | 无 | 获取音量信息 |
| `play()` | 无 | 播放 |
| `pause()` | 无 | 暂停 |
| `stop()` | 无 | 停止 |
| `next()` | 无 | 下一首 |
| `previous()` | 无 | 上一首 |
| `seekTo(time)` | number | 跳转到指定时间（毫秒） |
| `toggleShuffle()` | 无 | 切换随机播放 |
| `toggleRepeat()` | 无 | 切换循环模式 |
| `setRepeatMode(mode)` | string | 设置循环模式 |
| `setVolume(vol)` | number | 设置音量（0-1） |
| `toggleMute()` | 无 | 切换静音 |
| `addEventListener(event, cb)` | string, function | 添加事件监听 |
| `removeEventListener(event, cb)` | string, function | 移除事件监听 |

---

### 歌词 API 字段

通过 `https://music.163.com/api/song/lyric?id={songId}&lv=1&kv=1&tv=-1` 获取。

#### 返回字段

| 字段 | 类型 | 说明 | 示例 |
|------|------|------|------|
| `lrc.lyric` | string \| null | 普通歌词（行级时间戳） | `"[00:14.030]그녀가 떠나가요"` |
| `yrc.lyric` | string \| null | 逐字歌词（字级时间戳） | `"[00:14.030]<그녀가 0,500>..."` |
| `tlyric.lyric` | string \| null | 翻译歌词 | `"[00:14.030]她离开了"` |
| `romalrc.lyric` | string \| null | 罗马音歌词 | `"[00:14.030]geunyeoga tteonagayo"` |

#### 歌词类型判断

| 字段存在 | 说明 |
|---------|------|
| `lrc.lyric` 存在 | 有普通歌词，支持行级高亮 |
| `yrc.lyric` 存在 | 有逐字歌词，支持字级高亮 |
| `tlyric.lyric` 存在 | 有翻译歌词 |
| `romalrc.lyric` 存在 | 有罗马音歌词 |

---

### NEJ 事件系统字段

| 字段 | 类型 | 说明 |
|------|------|------|
| `nejVExists` | boolean | NEJ.v 命名空间是否存在 |
| `geType` | string | Ge 方法的类型（应为 `"function"`） |
| `geWrapped` | boolean | Ge 是否被 AOP 包装（插件拦截歌词的标志） |
| `hasE9` | boolean | Ge 是否有 e9 方法（AOP 包装器） |

---

### BetterNCM 插件字段

#### loadedPlugins 结构

| 字段路径 | 类型 | 说明 |
|---------|------|------|
| `loadedPlugins[name]` | object | 插件实例 |
| `loadedPlugins[name].manifest.name` | string | 插件名称 |
| `loadedPlugins[name].manifest.version` | string | 插件版本 |
| `loadedPlugins[name].manifest.author` | string | 插件作者 |
| `loadedPlugins[name].manifest.description` | string | 插件描述 |
| `loadedPlugins[name].finished` | boolean | 插件是否加载完成 |
| `loadedPlugins[name].injects` | array | 插件注入点列表 |

---

### AMLL_LOG_API 字段

#### getLogStats() 返回字段

| 字段 | 类型 | 说明 |
|------|------|------|
| `total` | number | 日志总数 |
| `byLevel.debug` | number | debug 级别日志数 |
| `byLevel.info` | number | info 级别日志数 |
| `byLevel.warn` | number | warn 级别日志数 |
| `byLevel.error` | number | error 级别日志数 |

#### listLogs() 返回字段

| 字段 | 类型 | 说明 |
|------|------|------|
| `messages` | array | 日志消息列表 |
| `total` | number | 总日志数 |
| `pageIdx` | number | 当前页索引 |
| `pageSize` | number | 每页大小 |

#### message 结构

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | number | 日志 ID |
| `type` | string | 日志类型（`"log"` / `"warning"` / `"error"`） |
| `timestamp` | number | 时间戳（毫秒） |
| `text` | string | 日志文本 |
| `args` | array | 附加参数 |

#### listLogs() 选项参数

| 参数 | 类型 | 说明 |
|------|------|------|
| `pageSize` | number | 每页大小（默认 100） |
| `pageIdx` | number | 页索引（默认 0） |
| `types` | string[] | 按类型筛选（`["error", "warn"]`） |
| `tag` | string | 按标签筛选 |
| `since` | number | 起始时间戳 |

---

### 全局环境状态字段

| 字段 | 类型 | 说明 |
|------|------|------|
| `hasNej` | boolean | NEJ 框架是否存在（V2 版本标志） |
| `hasInfLinkApi` | boolean | InfLinkApi 是否存在 |
| `hasAmllLogApi` | boolean | AMLL_LOG_API 是否存在 |
| `hasLoadedPlugins` | boolean | BetterNCM 插件系统是否存在 |
| `player.playState` | string | 原生播放器状态 |

---

### 完整状态获取脚本

```powershell
$body = @{
  expression = @'
(function() {
  const api = window.InfLinkApi;
  const nej = window.NEJ;
  const plugins = window.loadedPlugins;
  
  return {
    // 环境状态
    environment: {
      hasNej: !!nej,
      hasInfLinkApi: !!api,
      hasAmllLogApi: typeof AMLL_LOG_API !== "undefined",
      hasLoadedPlugins: !!plugins
    },
    
    // InfLinkApi 信息
    infLinkApi: api ? {
      version: api.version,
      methods: Object.keys(api).filter(k => typeof api[k] === "function")
    } : null,
    
    // 播放状态
    playback: api ? {
      song: api.getCurrentSong(),
      status: api.getPlaybackStatus(),
      timeline: api.getTimeline(),
      volume: api.getVolume(),
      playMode: api.getPlayMode()
    } : null,
    
    // 插件列表
    plugins: plugins ? Object.keys(plugins).map(k => ({
      name: plugins[k].manifest?.name,
      version: plugins[k].manifest?.version,
      finished: plugins[k].finished
    })) : null,
    
    // 日志状态
    logs: typeof AMLL_LOG_API !== "undefined" ? {
      stats: AMLL_LOG_API.getLogStats()
    } : null
  };
})()
'@
} | ConvertTo-Json -Depth 3

Invoke-RestMethod -Uri "http://127.0.0.1:9444/api/evaluate" -Method POST -ContentType "application/json" -Body $body | ConvertTo-Json -Depth 6
```

---

## 相关文档

- [DevTools MCP 直连说明](./devtools-mcp.md)
- [InfLink-rs API 类型定义](../src/types/inflink.d.ts)
