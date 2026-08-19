# DSH 客户端增强插件包 — 设计文档

> 插件名：**dsh-toolkit**（工具包）· 包名：`@dsh-community/dsh-toolkit`
> 版本：0.1.0 · 状态：设计评审稿 · 作者：你 + DeepSeek Harness 编码代理

---

## 1. 背景与目标

DSH（DeepSeek Harness）是基于 Cordis 的插件化智能体框架，Web 客户端通过
`@deepseek-ai/dsh-client-*` 系列包以插件方式组装。本插件包目标是提供一个**可独立发布、
可扩展、遵循 DSH 官方插件约定**的客户端 UI 增强套件，包含四个相互独立、可单独启用的模块：

| 模块 | 功能 | 关键机制 |
|---|---|---|
| `exporter` | 会话导出（Markdown / HTML / JSON） | Conversation Node 组装 + 导出渲染器 |
| `trajectory-map` | 思考过程可视化流程图（工具调用链、重试、分支） | Conversation Definition + 独立视图标签页 |
| `command-palette` | 全局命令面板（搜索、执行命令、跳转） | `ctx.commands` 服务 + 键盘快捷键 + overlay UI |
| `chat-background` | 聊天界面背景自定义（图片/颜色/模糊/暗色适配） | settings 持久化 + CSS 变量 + 渲染层 |

设计约束：

- **零后端改动**：全部在客户端（browser）实现，不新增 Host RPC、不改会话日志。
- **可发布**：独立 npm 包，遵循 `dsh.client` 声明与 `/client` 子路径约定。
- **可扩展**：每个模块是独立 Cordis 插件 entry，通过组合配置启用；模块间不互相依赖。
- **风格一致**：复用 `--dsw-*` design token、ui-primitives 组件与既有 slot 体系。

---

## 2. 包工程结构

### 2.1 命名与元信息

```jsonc
// package.json（关键字段）
{
  "name": "@dsh-community/dsh-toolkit",
  "version": "0.1.0",
  "type": "module",
  "main": "lib/index.js",
  "types": "lib/types/index.d.ts",
  "publishConfig": { "access": "public" },
  "license": "MIT",
  "exports": {
    ".": { "types": "./lib/types/index.d.ts", "default": "./lib/index.js" },
    "./client": { "types": "./lib/types/client/index.d.ts", "default": "./lib/client.js" },
    "./src/*": "./src/*",
    "./package.json": "./package.json"
  },
  "dsh": {
    "client": {
      // 注意：这里是 manifest 依赖边元数据（包名），不参与 boot 等待。
      // boot 等待的是 bundle 导出的 inject（服务名）：v0.1 为 ['slots', 'sessions']。
      // 曾误把包名写进 bundle inject，导致 entry 永久 pending
      // （"waiting for services: @deepseek-ai/..."），已修复并由 tests/client-entry.test.ts 覆盖。
      "inject": [
        "@deepseek-ai/dsh-client-runtime",
        "@deepseek-ai/dsh-client-ui-layout",
        "@deepseek-ai/dsh-client-ui-conversation",
        "@deepseek-ai/dsh-client-ui-theme",
        "@deepseek-ai/dsh-client-ui-settings",
        "@deepseek-ai/dsh-commands",
        "@deepseek-ai/dsh-api-remotes"
      ],
      "platform": "web"
    }
  },
  "peerDependencies": {
    "react": "^18.2.0",
    "@deepseek-ai/cordis": "^4.0.1",
    "@deepseek-ai/dsh-client-runtime": "^0.1.0-rc.6",
    "@deepseek-ai/dsh-client-ui-conversation": "^0.1.0-rc.6",
    "@deepseek-ai/dsh-client-ui-layout": "^0.1.0-rc.6",
    "@deepseek-ai/dsh-client-ui-primitives": "^0.1.0-rc.6",
    "@deepseek-ai/dsh-client-ui-settings": "^0.1.0-rc.6",
    "@deepseek-ai/dsh-client-ui-theme": "^0.1.0-rc.6",
    "@deepseek-ai/dsh-commands": "^0.1.0-rc.6"
  }
}
```

> **关键约定**：客户端 bundle 只能经 `/client` 子路径导入本包的值，否则 loader externals
> 表会内联第二个模块实例，导致私有 scope-tag Symbol 无法匹配（dsh-client-runtime README 明示）。

### 2.2 目录结构

```
dsh-toolkit/
├── package.json
├── tsconfig.json
├── README.md
├── LICENSE
├── src/
│   ├── index.ts                 # Host 侧（空壳；本包无 Host 逻辑，仅类型再导出）
│   ├── client.ts                # 客户端 entry：四个模块的组装点
│   ├── types.ts                 # 公共类型（模块配置、跨模块契约）
│   ├── shared/
│   │   ├── settings.ts          # 通用 settings namespace 绑定工具（bindSettingsScope 封装）
│   │   └── css-vars.ts          # --dsw-* 派生变量工具
│   ├── exporter/
│   │   ├── entry.ts             # 导出器插件 entry（apply 注入）
│   │   ├── definition.ts        # Conversation Definition：把节点折叠成可导出数据
│   │   ├── render/
│   │   │   ├── markdown.ts      # Markdown 渲染器
│   │   │   ├── html.ts          # HTML 渲染器
│   │   │   └── json.ts          # JSON 渲染器
│   │   ├── ui/
│   │   │   ├── ExportMenu.tsx   # 页头工具按钮 + 菜单（格式/范围/复制/下载）
│   │   │   └── ExportModal.tsx  # 导出预览对话框
│   │   └── slots.ts             # 声明与消费的 slot
│   ├── trajectory-map/
│   │   ├── entry.ts             # 流程图插件 entry
│   │   ├── definition.ts        # 独立的 Conversation Definition（工具调用树组装）
│   │   ├── ui/
│   │   │   ├── TrajectoryView.tsx    # 独立会话视图标签页
│   │   │   └── FlowGraph.tsx         # 流程图渲染（SVG/DAG）
│   │   └── slots.ts
│   ├── command-palette/
│   │   ├── entry.ts
│   │   ├── actions.ts           # 命令动作注册（来自 ctx.commands + 自注册动作）
│   │   ├── ui/
│   │   │   ├── Palette.tsx      # overlay 主组件
│   │   │   ├── PaletteItem.tsx
│   │   │   └── shortcuts.ts     # 键盘快捷键（Ctrl/Cmd+K）
│   │   └── slots.ts
│   └── chat-background/
│       ├── entry.ts
│       ├── background.ts        # 背景状态管理（颜色/图片/模糊/模式）
│       ├── styles.css           # 背景 CSS 变量与渲染规则
│       ├── ui/
│       │   └── BackgroundSettings.tsx  # 设置界面条目
│       └── slots.ts
├── styles/                      # 打包时发布的静态样式
│   └── index.css
└── lib/                         # 构建产物（tsc 输出，发布时存在）
```

### 2.3 组合（cordis.yml）示例

```yaml
- id: dsh-toolkit
  name: '@dsh-community/dsh-toolkit'
  config:
    exporter:
      enabled: true
      defaultFormat: markdown
      includeToolCalls: true
    trajectoryMap:
      enabled: true
      defaultCollapsed: true
    commandPalette:
      enabled: true
      shortcut: 'mod+k'
    chatBackground:
      enabled: true
      allowImages: true
```

每个子配置可缺省，缺省即启用默认行为；`enabled: false` 的模块不注册任何内容
（fiber 保持挂起，参照 dsh-session-stats 的“无 registry 则挂起”模式）。

---

## 3. 模块设计 — 会话导出器 (`exporter`)

### 3.1 目标

把当前会话导出为人类可读或机器可读的产物，支持 Markdown、HTML、JSON 三种格式，
支持范围选择（当前已加载窗口 / 整个会话）与内容选择（是否含工具调用详情）。

### 3.2 数据来源与组装

不新增 Host 逻辑，纯客户端：

- 复用 `ConversationSnapshot.chat` 已组装的节点（user / assistant / tool / turn-tail / steering 等），
  并读取顶层兼容字段 `nodes`、`partial`、`runningCalls`。
- 通过 `useProjection` 读取 `sessionStats`（轮次/步数/token 统计）附加到导出头部。
- 通过 `useProjection('todos')` 读取任务计划，作为 Markdown 导出的可选任务清单段。

**折叠规则**（与 Chat Definition 一致）：仅导出人类可见记录；replacement 副本不导出；
compaction 检查点渲染为折叠标记行；Think 节点默认折叠（导出时按配置展开或省略）。

### 3.3 渲染器

| 格式 | 说明 |
|---|---|
| Markdown | `# 会话标题` + 元信息 + 按轮次分组的 `**User**` / `**Assistant**` 引用块；工具调用渲染为 `[tool: name]` 列表；代码块保留语法高亮标记 |
| HTML | 单文件内联 CSS，使用 `--dsw-*` token 派生静态颜色；保留代码高亮（复用 shiki 语法高亮产物或降级为 pre 块） |
| JSON | 结构化：`{ sessionId, title, cwd, stats, messages: [{ role, kind, content, toolCalls?, timing? }] }`，稳定 schema 供外部工具消费 |

### 3.4 UI 呈现

- **入口 1**：注册到 `conversation.session.header.utilities` slot —— 导出按钮 + 下拉菜单
  （格式、范围、含工具调用开关、复制 / 下载 / 预览）。
- **入口 2**：命令面板注册动作 `export session`（见 §5）。
- 导出预览使用 `ExportModal`（ui-primitives 的 Modal + 代码块展示）。

### 3.5 边界与限制

- **v0.1 仅导出已加载窗口内的节点**（与窗口分页一致，已确认决策）；“整个会话”导出列入
  v1.0 路线图（需先触发历史分页加载到头部，复用会话历史分页 API，加载期间显示进度）。
- 不导出会话日志中的非表面事件（如 retry 内部记录），除非 `includeToolCalls` 开启。

> **接口级细化**：本模块的完整接口设计（中间模型、渲染器签名、UI 状态机、注册流程）
> 见 [exporter-design.md](./exporter-design.md)。

---

## 4. 模块设计 — 思考过程流程图 (`trajectory-map`)

### 4.1 目标

把模型在会话中的“思考过程”——工具调用链（root/child `subCalls` 递归树）、重试、分支、
请求/响应——可视化为可读的流程图，替代逐条滚动的原始记录。

### 4.2 数据组装

参照 ui-trajectory 的模式：在同一个 Session 窗口上注册**独立的** `ConversationNodeDefinition`
与 target builder（不消费 Chat 兼容字段，不运行第二套 history fold）：

- 输入：`tool/call` → `tool/result` 配对、`llm/retry` / `llm/retry-started` 记录、
  Turn/Step Location 索引。
- 输出：一棵按启动顺序组织的**工具调用 DAG**（root call + 递归 `subCalls`），节点携带
  `callTime`、`status`（running / settled / error / cancelled）、重试次数、耗时。

### 4.3 UI 呈现

- **形态 A（已确认决策）**：注册为 `conversation.view` 列表中的独立标签页 —— “轨迹”视图，
  与 Chat / 既有 Trajectory 视图并列。用户在当前会话内切换查看。
- **形态 B**：在每条 assistant 消息的折叠区域渲染迷你流程图（按配置默认折叠）。

`FlowGraph` 组件：

- SVG 渲染 DAG：节点 = 工具调用卡片（名称、状态色、耗时），边 = call/result 关联；
  重试节点显示重试次数徽标；失败节点红色高亮 + 错误信息 tooltip。
- 交互：点击节点打开 `conversation.details.tool` 详情壳层（复用既有工具详情席位）；
  支持缩放 / 平移 / 重置布局。
- 无窗口数据时不渲染（与 ui-trajectory 相同的行为边界）。

### 4.4 依赖与隔离

- 只读 `useProjection` 与自身 Definition 的 State，不修改会话数据。
- 与其他视图（Chat / ui-trajectory）共存：各自独立注册、独立渲染，互不干扰。

> **接口级细化**：本模块的完整接口设计（图数据模型、布局算法、view 注册、FlowGraph 组件）
> 见 [trajectory-map-design.md](./trajectory-map-design.md)。

---

## 5. 模块设计 — 命令面板 (`command-palette`)

### 5.1 目标

提供类似 VS Code 的全局命令面板：按 `Ctrl/Cmd+K` 弹出 overlay，输入即过滤，
可执行：DSH 注册的命令（`ctx.commands` 列表）、切换/打开会话、切换主题、执行导出等。

### 5.2 动作源

`actions.ts` 汇总三类动作：

1. **命令动作**：`ctx.commands.list()` 返回的描述符（名称 + 描述）→ 选中后
   `ctx.commands.execute(agent, line)` 执行，结果按 `CommandResult` 渲染。
2. **导航动作**：本插件自注册的 `Session` 导航（最近活跃会话列表、按名称过滤，
   选中即 `openSession`）。
3. **扩展动作**：公开 `registerPaletteAction(def)` 注入点，供其他插件/本包其他模块
   （如 exporter）注册自定义动作。

### 5.3 UI 与交互

- overlay：ui-primitives Modal + 自绘输入框；列表虚拟滚动（会话多时）。
- 键盘：`Ctrl/Cmd+K` 打开；`↑/↓` 选择；`Enter` 执行；`Esc` 关闭。
  - 快捷键可配置（`shortcut` 配置键），且**注册前检测冲突**——若已有全局监听则
    降级为命令动作 `open command palette`。
- 动作结果显示：命令动作按 `CommandResult` 文本渲染为 toast/行内结果；导航动作直接跳转。

### 5.4 边界

- 不改变 `ctx.commands` 注册表本身；只消费 `list`/`find`/`execute`。
- 未知命令输入仍由适配器拒绝（沿用 dsh-commands 约定），面板只执行已知动作。

> **接口级细化**：本模块的完整接口设计（动作模型、过滤算法、交互状态机、扩展点）
> 见 [command-palette-design.md](./command-palette-design.md)。

---

## 6. 模块设计 — 聊天背景自定义 (`chat-background`)

### 6.1 目标

允许用户自定义**会话/消息区域的背景**：纯色、渐变、图片（URL 或本地文件转 data URL）、
模糊程度、透明度，以及暗色模式下的独立配置。

### 6.2 状态与持久化

- 参照 ui-theme 的 settings 模式：注册 settings namespace `chat-background`（Host 侧
  settings provider 写入 `$DSH_HOME/settings.yaml`）；远程浏览器降级为内存模式。
- `background.ts` 维护不可变快照：`{ mode, color?, gradient?, imageUrl?, blur?, opacity?, dark? }`，
  mode ∈ color | gradient | image；`dark` 为暗色模式下的独立配置。
- 校验：**URL 与本地文件 data URL 均允许**（已确认决策）。图片大小上限（默认 2 MiB，可配置），
  data URL 超限拒绝；URL 需 http(s) 协议。

### 6.3 渲染

- 不直接操作 DOM 样式（遵循 ui-theme 的“DOM-free 服务 + 渲染层应用”分离）。
- 声明 CSS 变量（如 `--dsh-chat-bg-image`、`--dsh-chat-bg-blur`、`--dsh-chat-bg-overlay`），
  在会话滚动容器（`data-conversation-scroll`）层级应用背景层，消息内容保持 `--dsw-*`
  表面 token，确保可读性（背景上叠加 scrim）。
- 暗色模式：跟随 `ThemeSnapshot` 的 dark 位切换 dark 配置。

### 6.4 UI

- 设置条目注册到 ui-settings 的外观分组（与 ui-theme 的 Appearance 行并列）。
- 提供实时预览（在设置面板内渲染迷你会话背景样本）。
- 全部通过 settings API 读写，遵循 host-backed preferences 边界（ui-theme 同款决策）。

### 6.5 边界

- 背景仅作用于会话聊天区域，不作用于全局外壳 chrome（避免与主题冲突）。
- 不新增图片上传 RPC：本地文件仅在本进程内转 data URL（远程浏览器同样适用）。

> **接口级细化**：本模块的完整接口设计（settings 模型、BackgroundRuntime、CSS 变量、设置 UI）
> 见 [chat-background-design.md](./chat-background-design.md)。

---

## 7. 跨模块设计

### 7.1 配置 schema（zod）

```ts
import { z } from 'zod'

export const ExporterConfig = z.object({
  enabled: z.boolean().default(true),
  defaultFormat: z.enum(['markdown', 'html', 'json']).default('markdown'),
  includeToolCalls: z.boolean().default(true),
  includeStats: z.boolean().default(true),
})

export const TrajectoryMapConfig = z.object({
  enabled: z.boolean().default(true),
  defaultCollapsed: z.boolean().default(true),
  showRetries: z.boolean().default(true),
})

export const CommandPaletteConfig = z.object({
  enabled: z.boolean().default(true),
  shortcut: z.string().default('mod+k'),
})

export const ChatBackgroundConfig = z.object({
  enabled: z.boolean().default(true),
  maxImageBytes: z.number().int().positive().default(2 * 1024 * 1024),
})

export const ToolkitConfig = z.object({
  exporter: ExporterConfig.optional(),
  trajectoryMap: TrajectoryMapConfig.optional(),
  commandPalette: CommandPaletteConfig.optional(),
  chatBackground: ChatBackgroundConfig.optional(),
})
```

### 7.2 slot 汇总

| slot | 方向 | 用途 |
|---|---|---|
| `conversation.session.header.utilities` | 贡献 | exporter 按钮 |
| `conversation.view` | 贡献 | trajectory-map 独立视图标签页 |
| `conversation.details.tool` | 消费 | 流程图节点点击打开工具详情 |
| `settings.section` | 贡献 | chat-background 设置行 |

> **v0.1 决策**：命令面板动作注册表（`ctx.palette`）不通过 slot 声明。
> `SlotCore.register` 要求声明槽位的注册组件消费 `renderSlot`，而面板动作不是渲染贡献，
> 且 `ctx.slots.register` 对未声明槽位直接 throw。动作由 exporter / chat-background
> 直接登记进 `ctx.palette`（command-palette 先 apply 提供注册表，`ctx.provide('palette', ...)`，
> 无条件提供，面板 disabled 时为空表）。`toolkit.palette.action` 槽位扩展点留待后续版本。

### 7.3 可扩展性设计

- **模块级开关**：每个模块独立 entry、独立 `enabled`，互不引用 → 用户可裁剪。
- **动作注册表**：命令面板动作公开注册 API，其他包（包括本包未来模块）可贡献。
- **渲染器接口**：exporter 的渲染器实现 `ExporterRenderer<T>` 接口，第三方可注册
  自定义格式（如 PDF）。
- **纯客户端**：不触碰 Host，任何装配（web-app bundle / 其他交互式组合）都能挂载。

---

## 8. 发布与验证路径

### 8.1 构建

- `tsc` 编译到 `lib/`；`files` 只含 `lib/**` + `styles/**` + README/LICENSE。
- 保持 `/client` 子路径导出；客户端 bundle 一律从 `/client` 导入。

### 8.2 本地验证

1. 在 DSH 组合的 `cordis.yml` 中加入本包（指向本地路径或 npm 链接）。
2. 启动 web 开发服务器，打开 `http://127.0.0.1:3080`，逐个模块验证：
   - exporter：打开会话 → 导出按钮 → 三种格式产物内容正确。
   - trajectory-map：切换“轨迹”视图 → 流程图节点/边/重试正确。
   - command-palette：Ctrl/Cmd+K → 过滤执行命令 → 跳转会话。
   - chat-background：设置背景 → 会话区域实时变化 → 刷新后持久。
3. 验证 `enabled: false` 时对应 UI 完全消失（slot 不注册）。

### 8.3 发布

- `npm publish --access public`；peerDependencies 跟随 DSH `0.1.0-rc.6` 线。
- README 说明：安装、组合配置、模块开关、已知限制（导出仅窗口范围等）。

---

## 9. 决策记录与遗留事项

### 9.1 已确认决策

| # | 决策 | 结论 |
|---|---|---|
| 1 | 包名 | `@dsh-community/dsh-toolkit`（已替换全文旧名） |
| 2 | trajectory-map 形态 | **形态 A**：独立视图标签页（`conversation.view`） |
| 3 | exporter 导出范围 | v0.1 仅窗口范围；“整个会话”列入 v1.0 |
| 4 | chat-background 图片来源 | URL 与本地文件 data URL **均允许** |

### 9.2 遗留事项

- 命令面板快捷键 `Ctrl/Cmd+K` 与既有快捷键的冲突检测：设计保留冲突检测与降级逻辑，
  具体冲突需在真实 DSH shell 运行时验证（暂不阻塞实现）。
- 发布前检查 npm 上 `@dsh-community/dsh-toolkit` 名称占用情况。
