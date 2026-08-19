# 模块细化设计 — 会话导出器 (exporter)

> 所属插件：`@dsh-community/dsh-toolkit` · 版本 0.1.0 · 接口级设计
> 前置文档：[plugin-design.md](./plugin-design.md) §3 · 本稿据此可直接编写实现代码

---

## 1. 目标与范围

把当前会话的已加载窗口导出为 Markdown / HTML / JSON。本稿给出：

- 导出的**中间数据模型**（ExportedSession）—— 与 DSH 运行时节点结构一一对应；
- 三种渲染器的**函数签名与输出约定**；
- 节点到导出行的**折叠/筛选规则**（哪些节点进入导出、如何进入）；
- UI 组件（ExportMenu / ExportModal）的 **props 与交互状态机**；
- 插件 entry 的**注册流程**（slot 挂载 + 命令面板动作）。

范围界定：

- 数据来源为 `ConversationSnapshot.nodes`（`ConversationNode[]` 判别联合）与
  `ConversationSnapshot.chat.legacy`（`nodes`/`partial`/`runningCalls`）——读取**同一份已组装数据**，
  不再自行 fold 事件流。
- 仅导出已加载窗口（v0.1 决策）；`hasMore` 为 true 时在导出产物中标注截断提示。

---

## 2. 导出中间模型 (ExportedSession)

### 2.1 顶层结构

```ts
// src/exporter/model.ts
import type { ConversationNode } from '@deepseek-ai/dsh-client-runtime/client'

/** 导出一份会话窗口的结果模型（渲染器唯一输入）。 */
export interface ExportedSession {
  /** 版本号，用于 JSON 产物向后兼容。 */
  readonly formatVersion: 1;
  readonly sessionId: string;
  readonly title: string;
  readonly cwd: string;
  /** Unix epoch ms（源会话事件时间）。 */
  readonly exportedAt: number;
  /** 会话统计（来自 useProjection('sessionStats')，缺失时省略）。 */
  readonly stats?: SessionStatsExport;
  /** 是否还有更早历史未加载（hasMore 镜像）→ 渲染器输出截断提示。 */
  readonly truncated: boolean;
  /** 已排序的导出行（见 2.2）。 */
  readonly rows: readonly ExportedRow[];
}

/** 会话统计导出子集（字段名与 sessionStats 投影一致）。 */
export interface SessionStatsExport {
  readonly turns: number;
  readonly steps: number;
  readonly llmMs?: number;
  readonly ttftMs?: number;
  readonly decodeMs?: number;
  readonly decodeTokens?: number;
  readonly toolMs?: number;
}
```

### 2.2 导出行 (ExportedRow)

```ts
// src/exporter/model.ts（续）

/** 按会话流顺序排列的导出行；kind 与 ConversationNode 对齐，便于溯源。 */
export type ExportedRow =
  | UserRow | AssistantRow | SteeringRow | ContextRow
  | ToolRow | RetryRow | TurnErrorRow | MaxTokensRow
  | CommandRow | CompactionRow | UnknownRow;

/** 用户消息。content 为 ContentBlock[]，含 image 附件引用。 */
export interface UserRow {
  readonly kind: 'user';
  readonly seq: number;
  readonly time: number;
  readonly content: readonly ContentBlockExport[];
}

/** 助手消息。blocks 为已分类的 AssistantBlock（text/reasoning/image/tool-call/other）。 */
export interface AssistantRow {
  readonly kind: 'assistant';
  readonly seq: number;
  readonly time: number;
  readonly turn: number;
  readonly step: number;
  readonly blocks: readonly AssistantBlockExport[];
  readonly interrupted?: true;
  readonly requestConfig?: { provider: string; model: string } | undefined;
  readonly timing?: AssistantTimingExport | undefined;
}

/** 运行中的 steering（中途引导）气泡。 */
export interface SteeringRow {
  readonly kind: 'steering';
  readonly seq: number;
  readonly time: number;
  readonly content: readonly ContentBlockExport[];
}

/** 上下文注入（skill / 工作区指令 / 跨会话召回）。 */
export interface ContextRow {
  readonly kind: 'context';
  readonly seq: number;
  readonly time: number;
  readonly content: readonly ContentBlockExport[];
  readonly provenance: { role: string; producer?: string } | undefined;
  readonly form: string | null;
}

/** 工具调用根（递归持有 subCalls）。 */
export interface ToolRow {
  readonly kind: 'tool';
  readonly seq: number;
  readonly time: number;
  readonly callId: string;
  readonly name: string;
  readonly argsRaw: string;
  readonly isError: boolean;
  readonly error?: { name: string; code: string } | undefined;
  readonly callTime: number | null;
  /** 递归子调用（Code Dispatch 树）。 */
  readonly subCalls: readonly ToolRow[];
  /** 工具结果文本（content 的 text 拼接，供 Markdown 渲染）。 */
  readonly resultText: string;
}

/** 模型重试链（正常模式显示有限上限；always 显示 ∞）。 */
export interface RetryRow {
  readonly kind: 'retry';
  readonly seq: number;
  readonly time: number;
  readonly attempt: number;
  readonly maxAttempts: number | null;
  readonly state: 'scheduled' | 'started' | 'cancelled';
  readonly delayMs: number | null;
  readonly failureMessage: string | null;
}

/** 终态轮次失败（无重试）。 */
export interface TurnErrorRow {
  readonly kind: 'turn-error';
  readonly seq: number;
  readonly time: number;
  readonly turn: number;
  readonly step: number;
  readonly message: string;
  readonly code?: string;
}

/** max-tokens 截断提示。 */
export interface MaxTokensRow {
  readonly kind: 'max-tokens';
  readonly seq: number;
  readonly time: number;
  readonly turn: number;
  readonly step: number;
}

/** 斜杠命令生命周期（run/done 配对折叠）。 */
export interface CommandRow {
  readonly kind: 'command';
  readonly seq: number;
  readonly time: number;
  readonly name: string | null;
  readonly args: string | null;
  readonly outcome: { kind: 'success' | 'error'; text?: string } | null;
}

/** 压缩检查点。 */
export interface CompactionRow {
  readonly kind: 'compaction';
  readonly seq: number;
  readonly time: number;
  readonly summary: string | null;
  readonly shadowedItemCount: number | null;
  readonly shadowedTokenCount: number | null;
}

/** 未知 surface 事件（降级行）。 */
export interface UnknownRow {
  readonly kind: 'unknown';
  readonly seq: number;
  readonly time: number;
  readonly type: string;
  readonly data: unknown;
}

### 2.3 内容块导出 (ContentBlockExport / AssistantBlockExport)

```ts
// src/exporter/model.ts（续）

/** 与 dsh-llm ContentBlock 对齐；image 仅携带可展示引用元数据。 */
export type ContentBlockExport =
  | { type: 'text'; text: string }
  | { type: 'reasoning'; text: string }
  | { type: 'image'; name?: string; mime?: string; bytes?: number }
  | { type: 'tool-call'; id: string; name: string; arguments: string }
  | { type: 'tool-result'; toolCallId: string; isError?: boolean; content: ContentBlockExport[] }
  | { type: 'unknown'; value: unknown };

/** 与 dsh-client-runtime AssistantBlock 对齐；tool-call 归并为展示卡片。 */
export type AssistantBlockExport =
  | { kind: 'text'; text: string }
  | { kind: 'reasoning'; text: string }
  | { kind: 'image'; name?: string; mime?: string; bytes?: number }
  | { kind: 'tool-call'; callId: string; name: string; argsRaw: string }
  | { kind: 'other'; block: unknown };

export interface AssistantTimingExport {
  readonly stepStartTime: number | null;
  readonly firstTokenTime: number | null;
  readonly completedTime: number;
}

### 2.4 从 ConversationNode 折叠（折叠函数）

```ts
// src/exporter/fold.ts
import type { ConversationNode, ToolCallBlock, ToolResultNode } from '@deepseek-ai/dsh-client-runtime/client'
import type { ExportedRow, ToolRow } from './model.ts'

/** 单节点 → 导出行；无法映射的节点返回 null（不进入导出）。 */
export function foldNode(node: ConversationNode, opts: FoldOptions): ExportedRow | null

/** 工具调用块递归折叠（ToolCallBlock = RunningToolCall | ToolResultNode）。 */
export function foldTool(block: ToolCallBlock): ToolRow

/** 工具结果文本提取（content 中 text 块的拼接）。 */
export function toolResultText(result: ToolResultNode): string

export interface FoldOptions {
  /** 是否包含工具调用行（tool / retry）。默认 true。 */
  readonly includeToolCalls: boolean;
  /** 是否包含 reasoning 块。默认 false（折叠省略，与 Chat 默认折叠一致）。 */
  readonly includeReasoning: boolean;
  /** 是否包含上下文注入行（context）。默认 true。 */
  readonly includeContext: boolean;
  /** 是否包含命令行。默认 true。 */
  readonly includeCommands: boolean;
}

export const defaultFoldOptions: FoldOptions = {
  includeToolCalls: true,
  includeReasoning: false,
  includeContext: true,
  includeCommands: true,
};

---

## 3. 渲染器接口

### 3.1 通用渲染器接口

```ts
// src/exporter/render/types.ts
import type { ExportedSession } from '../model.ts'

/** 渲染器契约：输入中间模型，输出目标格式文本。 */
export interface ExporterRenderer {
  /** 稳定格式 id（markdown | html | json）。 */
  readonly id: ExporterFormat;
  /** 人类可读名称（用于菜单）。 */
  readonly label: string;
  /** 输出 MIME（用于下载）。 */
  readonly mime: string;
  /** 文件扩展名（含点）。 */
  readonly extension: string;
  /** 渲染入口；同步返回完整文本。 */
  render(session: ExportedSession): string;
}

export type ExporterFormat = 'markdown' | 'html' | 'json';

/** 注册的自定义渲染器（扩展点，见 §7）。 */
export interface RegisteredRenderer extends ExporterRenderer {
  readonly register: 'builtin' | 'plugin';
}

---

## 4. 三种渲染器规格

### 4.1 Markdown 渲染器 (render/markdown.ts)

**签名**：`renderMarkdown(session: ExportedSession, opts?: MdOptions): string`

**输出约定**：

```markdown
# {title}

> 会话 {sessionId} · {cwd}
> 导出时间：{ISO} · 轮次 {turns} · 步骤 {steps}

---

### User
> {text 内容，引用块}

### Assistant
```text
{text 内容}
```

[工具调用] {name} → {resultText 截断 200 字符}

> ⚠ 会话存在更早历史未导出（truncated）
```

**规则**：

- `UserRow` / `SteeringRow` → `### User/Steering` 标题 + 引用块；多 text 块拼接；image 块渲染为 `![{name}]({attachment-ref})` 占位。
- `AssistantRow` → 标题 + fenced code block（防 Markdown 注入，原样输出）；`reasoning` 仅在 `includeReasoning` 时输出为折叠 `<details>`。
- `ToolRow` → `[工具] {name}` 行 + 结果文本（截断至 `maxResultChars`，默认 200）；subCalls 递归缩进。
- `RetryRow` → `[重试 {attempt}/{max}] {state}` 行。
- `TurnErrorRow` / `MaxTokensRow` → `> ⚠ {message}` 引用行。
- `CompactionRow` → `> ✂ 上下文已压缩（替换 {n} 项 · ~{tokens} token）`。
- `CommandRow` → `[/{name}] {args}` + 结果行。
- `truncated: true` → 产物末尾追加截断提示行。

**MdOptions**：`{ maxResultChars?: number; newline?: '\n' | '\r\n' }`

### 4.2 HTML 渲染器 (render/html.ts)

**签名**：`renderHtml(session: ExportedSession, opts?: HtmlOptions): string`

**输出约定**：单文件自包含（内联 CSS），无外部依赖；语义化结构：

```html
<!doctype html><html lang="zh"><head><meta charset="utf-8">
<title>{title}</title><style>/* 内联样式，基于 --dsw-* 派生静态值 */</style></head>
<body><main class="session">
  <header><h1>{title}</h1><dl>…元信息…</dl></header>
  <section class="message user">…</section>
  <section class="message assistant">…</section>
  <section class="tool">…</section>
  <footer class="truncated">⚠ 会话存在更早历史未导出</footer>
</main></body></html>
```

**规则**：

- 文本块 → `<p>`（保留换行 `white-space: pre-wrap`）；代码块 → `<pre><code>`。
- tool-call 块 → `<details><summary>[工具] {name}</summary><pre>{argsRaw}</pre><pre>{result}</pre></details>`。
- reasoning 块 → `<details class="reasoning"><summary>思考</summary><p>{text}</p></details>`。
- 行内样式全部来自 `--dsw-*` token 的**编译期静态取值**（如 `--dsw-alias-surface-bg` 等），导出产物不依赖运行时主题。

**HtmlOptions**：`{ theme?: 'light' | 'dark'; includeCss?: boolean }`（默认 light；includeCss=false 时仅输出 body 片段）。

### 4.3 JSON 渲染器 (render/json.ts)

**签名**：`renderJson(session: ExportedSession): string`

**输出约定**：`JSON.stringify(session, null, 2)` 直接序列化中间模型（`formatVersion: 1` 保证向后兼容）；
内容块中的 `unknown` 值经 `safeJson` 递归净化（BigInt/函数/循环引用 → 字符串或省略）。

```ts
// render/json.ts
export function safeJson(value: unknown, depth?: number): unknown
```

---

## 5. 数据接入层

### 5.1 从 Snapshot 构建 ExportedSession

```ts
// src/exporter/build.ts
import type { ConversationSnapshot, SessionSummary } from '@deepseek-ai/dsh-client-runtime/client'

/** 从会话快照构建导出模型（纯函数，可测试）。 */
export function buildExportedSession(args: {
  readonly sessionId: string;
  readonly title: string;
  readonly cwd: string;
  readonly snapshot: ConversationSnapshot;
  readonly stats?: SessionStatsExport;
  readonly opts?: Partial<FoldOptions>;
}): ExportedSession

/** 提取已排序节点：优先 chat.legacy.nodes，回退 snapshot.nodes。 */
export function orderedNodes(snapshot: ConversationSnapshot): readonly ConversationNode[]
```

**说明**：`snapshot.chat.legacy.nodes` 与顶层 `snapshot.nodes` 是同一份镜像（README 明示顶层字段
由 Session 从 Chat Definition 镜像），二者选一即可；`orderedNodes` 默认读 `chat.legacy.nodes`
（显式、不依赖兼容层），并在其缺席时回退。

---

## 6. UI 组件

### 6.1 ExportMenu（页头入口）

```tsx
// src/exporter/ui/ExportMenu.tsx
export interface ExportMenuProps {
  readonly session: { id: string; title: string; cwd: string };
  readonly snapshot: ConversationSnapshot;
  readonly stats?: SessionStatsExport;
  readonly config: ExporterConfig;
}

/** 下拉菜单动作项：格式选择 / 内容开关 / 复制 / 下载 / 预览。 */
export function ExportMenu(props: ExportMenuProps): JSX.Element
```

**交互状态机**：

```ts
type ExportMenuState =
  | { phase: 'idle' }
  | { phase: 'building' }                    // 正在折叠/渲染
  | { phase: 'ready'; format: ExporterFormat; text: string }
  | { phase: 'error'; message: string }
```

**行为**：

- 打开菜单时按 `defaultFormat` 预构建（`buildExportedSession` + 对应渲染器），进入 `ready`。
- 切换格式 → 重新渲染（无需重新折叠，中间模型已构建）。
- 切换内容开关 → 重新折叠 + 渲染。
- 复制 → `navigator.clipboard.writeText(text)`；下载 → Blob + `URL.createObjectURL` + `<a download>`。
- 预览 → 打开 ExportModal。

### 6.2 ExportModal（预览对话框）

```tsx
// src/exporter/ui/ExportModal.tsx
export interface ExportModalProps {
  readonly open: boolean;
  readonly format: ExporterFormat;
  readonly text: string;
  readonly onClose: () => void;
  readonly onCopy: () => void;
  readonly onDownload: () => void;
}

export function ExportModal(props: ExportModalProps): JSX.Element | null;
```

**呈现**：Modal 壳 + 只读 `<pre>`/`<code>`（JSON/Markdown 用等宽字体；HTML 用 iframe 沙箱预览，`sandbox=""` 防脚本）。

---

## 7. 插件 Entry 与扩展点

### 7.1 entry.ts 注册流程

```ts
// src/exporter/entry.ts
import { Context, h } from '@deepseek-ai/cordis'
import type { ToolkitConfig } from '../types.ts'

export const name = 'exporter'

export function apply(ctx: Context, config: ToolkitConfig): void {
  const cfg = config.exporter ?? defaultExporterConfig
  if (!cfg.enabled) return; // fiber 挂起，不注册任何内容

  // 1. 注册内建渲染器（可被插件覆盖）
  ctx.exporterRenderers.register('markdown', renderMarkdown);
  ctx.exporterRenderers.register('html', renderHtml);
  ctx.exporterRenderers.register('json', renderJson);

  // 2. 贡献会话页头工具按钮
  ctx.slots.inject('conversation.session.header.utilities', () =>
    h(ExportMenuSlot, { config: cfg })
  );

  // 3. 注册命令面板动作（v0.1：直接登记进 ctx.palette，command-palette 先 apply 提供注册表；
  //    原 'toolkit.palette.action' 槽位方案因 SlotCore 声明约束留待后续版本）
  ctx.palette.register({
    id: 'exporter.export',
    label: '导出当前会话',
    keywords: ['export', '导出'],
    run: (session) => { /* 打开 ExportMenu 下拉或直接下载 defaultFormat */ },
  });
}
```

### 7.2 扩展点：自定义渲染器

```ts
// src/exporter/service.ts（本包内部服务）
export interface ExporterRendererRegistry {
  /** 注册渲染器；同 id 重复注册抛错（防静默覆盖）。 */
  register(id: ExporterFormat, renderer: ExporterRenderer): Disposer;
  /** 按 id 取渲染器。 */
  get(id: string): ExporterRenderer | undefined;
  /** 列出全部（菜单顺序）。 */
  list(): readonly ExporterRenderer[];
}

/** 插件可扩展格式（如 PDF）——声明注入点。 */
export interface ExporterRendererMap {
  'markdown': ExporterRenderer;
  'html': ExporterRenderer;
  'json': ExporterRenderer;
}

---

## 8. 测试要点

- **foldNode 单元测试**：对每种 `ConversationNode` kind 各给一条 fixture，断言折叠结果与 FoldOptions 开关；
  特别覆盖 `ToolResultNode`（call 为 null 的窗口截断分支）、`RunningToolCall`、`CommandNode`（done 缺失）。
- **渲染器快照测试**：三格式各一 fixture，输出逐字节快照；`truncated` 分支单独快照。
- **buildExportedSession 测试**：`orderedNodes` 回退路径、stats 缺失路径。
- **UI 测试**：ExportMenu 状态机（idle→building→ready/error）、复制/下载调用。

---

## 9. 与主文档的差异核对

- 主文档 §3.2 提到读取顶层 `nodes`/`partial`/`runningCalls`；本稿明确统一走 `chat.legacy.nodes`（同一份镜像，回退顶层），
  `partial`/`runningCalls` 为运行态字段，导出静态窗口时不需要。
- 主文档 §3.3 JSON schema 示例与本稿 `ExportedSession` 对齐（字段名 `messages` → `rows`，更贴近节点语义）。
- 新增 `exporterRenderers` 服务与 `ExporterRendererMap` 扩展点（主文档 §7.3 渲染器接口的具体化）。
