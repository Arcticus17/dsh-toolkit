# 模块细化设计 — 命令面板 (command-palette)

> 所属插件：`@dsh-community/dsh-toolkit` · 版本 0.1.0 · 接口级设计
> 前置文档：[plugin-design.md](./plugin-design.md) §5

---

## 1. 目标与范围

提供类似 VS Code 的全局命令面板：按快捷键弹出 overlay，输入即过滤，可执行：

1. DSH 已注册命令（`ctx.commands` 列表）；
2. 会话导航（打开/切换会话）；
3. 本插件其他模块的动作（如 exporter 导出、主题切换）；
4. 第三方插件经扩展点注册的自定义动作。

范围界定：

- **只消费、不修改** `ctx.commands` 注册表（沿用 dsh-commands 的边界约定）。
- 快捷键冲突检测保留设计，运行时验证（遗留事项，不阻塞实现）。

---

## 2. 动作模型 (PaletteAction)

### 2.1 动作定义

```ts
// src/command-palette/actions.ts
import type { CommandDescriptor, CommandExecution } from '@deepseek-ai/dsh-commands/types'

/** 面板中可执行的一个动作（统一抽象命令/导航/自定义）。 */
export interface PaletteAction {
  /** 稳定 id（插件内唯一）。 */
  readonly id: string;
  /** 显示名称（过滤匹配目标之一）。 */
  readonly label: string;
  /** 附加关键词（过滤匹配，不显示）。 */
  readonly keywords?: readonly string[];
  /** 分组（用于面板分组标题）。 */
  readonly group: PaletteGroup;
  /** 动作类型（决定执行方式与结果呈现）。 */
  readonly kind: 'command' | 'navigation' | 'action';
  /** 描述（次要行）。 */
  readonly description?: string;
  /** 执行；返回结果文本（toast 显示）或 null。 */
  readonly run: (ctx: ActionRunContext) => Promise<string | null> | string | null;
}

export type PaletteGroup = '命令' | '会话' | '工具' | '自定义';

/** 执行上下文：动作运行时需要的会话与命令能力。 */
export interface ActionRunContext {
  /** 当前会话 id（可能为 null —— 无会话时导航类动作仍可用）。 */
  readonly sessionId: string | null;
  /** 命令执行器（包装 ctx.commands.execute）。 */
  readonly executeCommand: (agent: Agent, line: string) => Promise<CommandExecution>;
  /** 打开一个会话（导航动作）。 */
  readonly openSession: (sessionId: string) => void;
}

### 2.2 内建动作源

```ts
// src/command-palette/actions.ts（续）

/** 从 ctx.commands 列表构建命令动作（kind: 'command'）。 */
export function commandsToActions(
  descriptors: readonly CommandDescriptor[],
  execute: ActionRunContext['executeCommand'],
): PaletteAction[]

/** 从会话列表构建导航动作（kind: 'navigation'）。 */
export function sessionsToActions(
  sessions: readonly SessionSummary[],
  openSession: ActionRunContext['openSession'],
): PaletteAction[]

/** 注册扩展动作（kind: 'action'）。 */
export function customAction(
  def: Omit<PaletteAction, 'kind' | 'group'> & { group?: PaletteGroup },
): PaletteAction
```

---

## 3. 过滤与排序

### 3.1 过滤算法

```ts
// src/command-palette/filter.ts

/** 过滤 + 排序：子序列匹配（label 或 keywords），按匹配度排序。 */
export function filterActions(
  actions: readonly PaletteAction[],
  query: string,
  opts?: { limit?: number },   // 默认 20
): readonly PaletteAction[]

/** 子序列匹配（区分大小写；query 为空时全部返回）。 */
export function subsequenceMatch(text: string, query: string): boolean

/** 匹配度打分：完整前缀 > 前缀 > 子序列；命中 label 加权 > keywords。 */
export function scoreAction(action: PaletteAction, query: string): number
```

**规则**：

- 空 query → 按 group 顺序 + 注册顺序显示（最近使用的排前，见 §3.2）。
- 非空 query → `filterActions` 子序列匹配；同分时按 label 字典序。
- 会话动作数量可能很大（数百会话）→ 面板列表虚拟滚动。

### 3.2 最近使用 (MRU)

```ts
// src/command-palette/mru.ts

/** 最近使用记录（内存态，可选持久化到 localStorage）。 */
export class ActionMru {
  /** 记录一次执行。 */
  record(actionId: string): void;
  /** 查询排序权重：actionId → 最近使用序号（越小越新）。 */
  weight(actionId: string): number;
  /** 清空。 */
  clear(): void;
}
```

---

## 4. UI 组件

### 4.1 Palette（overlay 主组件）

```tsx
// src/command-palette/ui/Palette.tsx
export interface PaletteProps {
  readonly actions: readonly PaletteAction[];
  readonly open: boolean;
  readonly onClose: () => void;
  readonly runContext: ActionRunContext;
  readonly mru: ActionMru;
}

export function Palette(props: PaletteProps): JSX.Element | null;
```

### 4.2 交互状态机

```ts
type PaletteState =
  | { phase: 'closed' }
  | { phase: 'open'; query: string; selectedIndex: number; running: boolean }

// 键盘事件
// - Ctrl/Cmd+K:      closed → open（query 清空，focus 输入框）
// - Esc:              open → closed（丢弃 query）
// - ArrowUp/Down:     selectedIndex ±1（循环）
// - Enter:            执行选中动作（running=true；完成后关闭）
// - Backspace 空 query: 回到 MRU 排序
// - 输入:             实时过滤（防抖 50ms）
```

### 4.3 结果呈现

- 命令动作执行 → `CommandExecution.result` → `kind: 'success' | 'error'` → toast 显示 `text`。
- 导航动作 → `openSession(sessionId)` → 直接关闭面板。
- 自定义动作 → 返回的文本 toast 显示；返回 null 则静默关闭。

### 4.4 快捷键

```ts
// src/command-palette/ui/shortcuts.ts

/**
 * 注册全局快捷键。
 * - 解析 config.shortcut（如 'mod+k'）为 keydown 匹配；
 * - 注册前检测 window 上是否已有同组合键监听（冲突检测）：有则降级为
 *   在面板内提供「打开命令面板」按钮（或经 ctx.commands 注册 /palette 命令）；
 * - 忽略输入框/文本域内的触发（避免与打字冲突）。
 */
export function registerShortcut(
  combo: string,
  onTrigger: () => void,
  opts?: { ignoreWhenTyping?: boolean },   // 默认 true
): () => void;   // disposer

/** 解析 'mod+k' → { ctrl: boolean; meta: boolean; key: 'k' }。 */
export function parseShortcut(combo: string): ShortcutSpec;
```

---

## 5. 扩展点

### 5.1 动作注册服务

```ts
// src/command-palette/service.ts
import { Context } from '@deepseek-ai/cordis'

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** 命令面板动作注册表（本插件提供）。 */
    palette: PaletteRegistry;
  }
}

export interface PaletteRegistry {
  /** 注册一个动作；同 id 重复注册抛错。 */
  register(def: PaletteAction): () => void;
  /** 注销（disposer 内部调用）。 */
  unregister(id: string): void;
  /** 列出全部动作（与内建合并顺序）。 */
  list(): readonly PaletteAction[];
  /** 订阅动作集合变更（面板刷新）。 */
  subscribe(listener: () => void): () => void;
}
```

### 5.2 动作登记（v0.1：直接注册表，非 slot）

```ts
// 其他模块（含本包 exporter / chat-background）直接登记动作：
// ctx.palette.register({ id, label, keywords, group, kind, run })
// v0.1 不声明 'toolkit.palette.action' 槽位：SlotCore.register 要求声明槽位的
// 注册组件消费 renderSlot，面板动作不是渲染贡献；且未声明槽位 register 直接 throw。
// 槽位扩展点留待后续版本（届时随声明生命周期注册/折叠）。
```

### 5.3 本插件内部动作

- `exporter.export`：导出当前会话（调 exporter 的默认格式下载）。
- `theme.toggle`：切换明暗主题（读 ThemeRuntime，切换偏好）。
- `background.random`：随机应用一个预设聊天背景（chat-background 模块注册）。

---

## 6. 注册流程 (entry.ts)

```ts
// src/command-palette/entry.ts
import { Context, h } from '@deepseek-ai/cordis'

export const name = 'command-palette'

export function apply(ctx: Context, config: ToolkitConfig): void {
  const cfg = config.commandPalette ?? defaultCommandPaletteConfig;
  if (!cfg.enabled) return;

  // 1. 提供 palette 服务（v0.1：ctx.provide，无条件提供，面板 disabled 时为空表；
  //    cordis Context 是 Proxy，直接赋值会报 cannot set property without provide）
  const registry = new PaletteRegistryImpl();
  ctx.provide('palette', registry);

  // 2. 注册全局快捷键
  const disposer = registerShortcut(cfg.shortcut, () => openPalette());
  ctx.on('dispose', disposer);

  // 3. （v0.1 无槽位声明；动作由本模块与 exporter / chat-background 直接登记进 ctx.palette）

  // 4. 内建动作：命令 + 会话导航
  refreshActions();   // 订阅 commands/change 与会话列表变更
  ctx.on('commands/change', refreshActions);
}
```

---

## 7. 依赖注入清单

| 服务 | 用途 | 来源 |
|---|---|---|
| `ctx.commands` | list/find/execute | `@deepseek-ai/dsh-commands`（Host 服务，Remote 消费） |
| `ctx.slots` | 声明/消费 slot | dsh-client-runtime |
| `useSessions` | 会话导航列表 | dsh-client-runtime |
| ui-primitives Modal | overlay 壳 | `@deepseek-ai/dsh-client-ui-primitives` |
| ThemeRuntime | 主题切换动作 | `@deepseek-ai/dsh-client-ui-theme` |

---

## 8. 测试要点

- **filterActions**：子序列匹配、keywords 命中、空 query、limit。
- **scoreAction**：前缀 > 子序列、label > keywords。
- **ActionMru**：记录/权重/清空、相同动作重复执行更新顺序。
- **Palette 状态机**：open/close/选择/执行/防抖。
- **快捷键**：组合键解析、输入框内不触发、冲突降级。

---

## 9. 与主文档的差异核对

- 主文档 §5.2 的三类动作源与本稿 §2.2 一致（命令/导航/扩展）；`PaletteAction` 统一抽象三类。
- 主文档 §5.3 的冲突降级方案在本稿 §4.4 具体化为 `registerShortcut` 的检测逻辑。
- 新增 MRU（最近使用）排序 —— 主文档未提，属 UX 增强，成本低（内存态）。
