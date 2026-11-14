# dsh-session-landing

进入会话时，把窗口顶部对齐到**最新输出块的开头**；如果最新输出本身比窗口还矮，这条规则会自动夹到底部（等于贴底）。

## 它解决什么问题

DSH 官方会为每个会话在内存里记住一份「语义化阅读位置」：只要曾经把滚动移开底部（手动滚一下、点侧栏搜索结果跳转、「加载更早」），这个会话就被钉上一个中段位置，之后**每次进入都会还原它**。还原时如果锚点行已不存在（长会话里回合过程区重新分组后很常见），官方会退化成用保存时的**旧像素值**硬跳，于是表现为「点进一个老对话，落到中上某个说不清的地方」。

官方没有任何设置项能改这个行为（`ui-chat` 命名空间只有 `linkOpening` / `performanceUsage` / `transcriptView`）。

本插件在会话打开后接管这一次落点：

- 找到当前窗口里**最新回合**的第一个输出行 —— 也就是「已完成，用时 X 分 Y 秒」那一行（它由 `turn-process` 节点渲染在正文上方）；
- 把该行的顶边对齐到滚动容器顶边下方 8px；
- 写入位置上夹到真实滚动范围内：最新输出比窗口矮时，目标位置自然被夹到最底部；
- 历史分页 / 图片与代码块延迟布局期间持续校正，几何稳定 1.5 秒后收手；
- 用户一旦滚动、触摸、点击或按翻页键，**立刻让位**，不再干预（输入框内的点击与按键不算阅读手势）。

正在流式输出的会话不会被顶部对齐打乱：这种情况直接钉到底部，随后交回官方的贴底跟随。

## 安装

源码放在本地插件目录，再用 junction 挂进 profile 的 `node_modules`：

```powershell
$src = "D:\Users\c1732\DeepSeekHarness\Agent学习\plugins\dsh-session-landing"
$dst = "D:\DeepSeekHarness\.dsh\profiles\desktop\node_modules\dsh-session-landing"
New-Item -ItemType Junction -Path $dst -Target $src
```

然后在 profile 的 `cordis.patch.yml` 里追加：

```yaml
- insert:
    - id: session-landing
      name: 'dsh-session-landing'
```

改完**必须完全退出并重启 DSH**（客户端插件不走热加载）。

## 开关与回滚

- 开关：设置 → 通用 → 「会话落点」。
- 一键回滚：删掉 `cordis.patch.yml` 里上面那个 `- insert:` 块，重启即回到官方默认（连 junction 都不用删）。

## 与其它插件的关系

- `dsh-history-autoload`（进会话自动加载全部历史）：本插件会在分页期间持续重算落点，两者可以共存。
- `dsh-search-locate`（点搜索结果跳到命中行）：它是显式跳转，会在本插件收手之后发生；如果你点的是搜索结果，以命中行为准。

## 依赖的内部契约

本插件读写的是 DSH 客户端已有的 DOM 标记，升级 app 后若这些标记改名需要同步更新：

| 选择器 | 用途 |
| --- | --- |
| `[data-chat-flow]` | 正文列容器 |
| `[data-chat-anchor-key]` / `[data-chat-flow-kind]` / `[data-chat-turn]` | 流条目与回合归属 |
| `[data-turn-process-hidden]` | 折叠进过程区、当前不可见的行 |
| `[data-chat-running]` | 会话正在流式输出 |
| `[data-conversation-scroll]` | 共享滚动容器（缺省时回退到最近的可滚动祖先） |
| `[data-composer-seat]` | 输入区，用于把手势排除在「阅读意图」之外 |

## License

MIT
