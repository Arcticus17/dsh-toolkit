# 模块细化设计 — 思考过程流程图 (trajectory-map)

> 所属插件：`@dsh-community/dsh-toolkit` · 版本 0.1.0 · 接口级设计
> 前置文档：[plugin-design.md](./plugin-design.md) §4 · 形态 A（独立视图标签页）已确认

---

## 1. 目标与范围

把模型在会话中的思考过程——工具调用链（root/child `subCalls` 递归树）、重试、分支、
请求/响应——可视化为可读的**流程图**，注册为 `conversation.view` 列表中的独立标签页
（形态 A，已确认决策）。

参考实现：`@deepseek-ai/dsh-client-ui-trajectory`（同样注册一个 view 标签页）。本模块与它的
区别在于**呈现形态**：ui-trajectory 是表格/时间线式请求流，本模块是**图（DAG）**式工具调用
链，突出调用之间的父子关系与重试/失败路径。

范围界定：

- **零新增数据组装**：不注册第二个 Conversation Definition（ui-trajectory 已注册自己的
  Definition；本模块复用其已组装的 Trajectory 数据，或直接从 Chat 节点读取工具调用树）。
- 呈现层：SVG DAG 流程图 + 交互（缩放/平移/点击详情）。
- 仅会话窗口内的数据（与窗口分页一致）。

---

## 2. 数据来源决策

两条候选数据通路，设计**优先路径 A**，路径 B 作为回退：

### 2.1 路径 A：复用 Chat 已组装的 ToolCallBlock 树（推荐）

`ConversationSnapshot.chat.legacy.nodes` 已包含 `ToolResultNode`（kind: 'tool-result'），
每个节点递归持有 `subCalls: readonly ToolCallBlock[]`（Code Dispatch 树）。直接折叠即可，
**不依赖 ui-trajectory 是否挂载**，与 exporter 共享同一份折叠逻辑（折叠函数可复用）。

```ts
// 数据来源（与 exporter 相同入口）
const nodes = orderedNodes(snapshot);            // readonly ConversationNode[]
const tools = nodes.filter(n => n.kind === 'tool-result');
```

### 2.2 路径 B：消费 ui-trajectory 的视图快照

若部署中已挂载 `dsh-client-ui-trajectory`，可经 `views.get('trajectory')` 读取其快照
（若其快照类型已注册到 `ConversationViewSnapshotMap`）。依赖 ui-trajectory 存在，
因此仅作为可选增强；本模块 v0.1 不实现，写入 README 已知限制。

---

## 3. 图数据模型

### 3.1 顶层模型

```ts
// src/trajectory-map/model.ts
import type { ToolCallBlock, ToolResultNode, TurnLocation } from '@deepseek-ai/dsh-client-runtime/client'

/** 一次会话窗口的工具调用图（渲染器唯一输入）。 */
export interface ToolGraph {
  /** 根调用（无 parent），按启动顺序。 */
  readonly roots: readonly GraphCall[];
  /** 全部调用平铺（索引：callId → GraphCall）。 */
  readonly byId: ReadonlyMap<string, GraphCall>;
  /** 该窗口内出现的重试记录（按事件顺序）。 */
  readonly retries: readonly GraphRetry[];
  /** 窗口是否截断（hasMore）。 */
  readonly truncated: boolean;
}

/** 图节点：一次工具调用（运行中或已结算）。 */
export interface GraphCall {
  readonly callId: string;
  readonly name: string;
  readonly argsRaw: string;
  readonly status: 'running' | 'settled' | 'error';
  readonly time: number;
  /** 结算耗时（ms）；运行中为 null。 */
  readonly durationMs: number | null;
  readonly callTime: number | null;
  /** 结果文本（text 块拼接，截断至 500 字符用于卡片预览）。 */
  readonly resultPreview: string;
  readonly error?: { name: string; code: string } | undefined;
  /** 父调用 id；根调用为 null。 */
  readonly parentId: string | null;
  /** 子调用（递归），按 dispatch 顺序。 */
  readonly children: readonly GraphCall[];
  /** 关联的重试次数（该调用的 llm/retry 记录数）。 */
  readonly retryCount: number;
}

/** 重试记录（关联到失败的调用）。 */
export interface GraphRetry {
  readonly callId: string | null;   // 关联调用；null = 未关联
  readonly attempt: number;
  readonly maxAttempts: number | null;
  readonly state: 'scheduled' | 'started' | 'cancelled';
  readonly delayMs: number | null;
  readonly failureMessage: string | null;
  readonly time: number;
}

### 3.2 从节点折叠

```ts
// src/trajectory-map/build.ts
import type { ConversationSnapshot, ConversationNode } from '@deepseek-ai/dsh-client-runtime/client'
import type { ToolGraph, GraphCall } from './model.ts'

/** 从会话快照构建工具调用图（纯函数）。 */
export function buildToolGraph(snapshot: ConversationSnapshot): ToolGraph

/** 单节点折叠（ToolResultNode → GraphCall；RunningToolCall → status 'running'）。 */
export function foldCall(block: ToolCallBlock, parentId: string | null): GraphCall

/** 收集重试：扫描 nodes 中的 model-retry 节点。 */
export function collectRetries(nodes: readonly ConversationNode[]): GraphRetry[]

/** 计算结算耗时：result.time - callTime（callTime 为 null 时 null）。 */
export function callDuration(block: ToolResultNode): number | null
```

### 3.3 布局算法

```ts
// src/trajectory-map/layout.ts

/** 节点布局位置（像素坐标，渲染层使用）。 */
export interface GraphLayout {
  readonly width: number;
  readonly height: number;
  readonly positions: ReadonlyMap<string, { x: number; y: number }>;
  /** 每层（同一 y）的节点列表，用于边路径计算。 */
  readonly layers: readonly string[][];
}

/**
 * 计算 DAG 分层布局（自顶向下）。
 * 算法：BFS 分层（按树深），同层内按启动时间排序；
 * 子节点向下层对齐（children 全部落位后层号 = max(child 层)+1 或按深度）。
 * 层高 = 节点高 + VGap；节点宽 = max(内容宽, MinW)，列位置 = 层内居中分配。
 */
export function layoutGraph(graph: ToolGraph, opts?: LayoutOptions): GraphLayout

export interface LayoutOptions {
  readonly nodeWidth?: number;   // 默认 220
  readonly nodeHeight?: number;  // 默认 64
  readonly hGap?: number;        // 默认 32
  readonly vGap?: number;        // 默认 56
}
```

---

## 4. View 标签页注册

### 4.1 注册方式（对照 ui-trajectory）

ui-trajectory 的注册模式：插件 body 通过 slot service 的 effect wrapper 注册 view tab，
卸载时自动移除。本模块沿用同一模式：

```ts
// src/trajectory-map/entry.ts
import { Context, h } from '@deepseek-ai/cordis'
import type { ConvViewOwnerProps } from '@deepseek-ai/dsh-client-ui-conversation/client'

export const name = 'trajectory-map'

export function apply(ctx: Context, config: ToolkitConfig): void {
  const cfg = config.trajectoryMap ?? defaultTrajectoryMapConfig
  if (!cfg.enabled) return;

  ctx.slots.register('conversation.view', {
    id: 'trajectory-map',
    order: 20,               // 排在 Chat(0) / ui-trajectory(10) 之后
    label: '流程图',
    render: (props: ConvViewOwnerProps & FrameworkViewProps) =>
      h(TrajectoryMapView, { ...props }),
  });
}
```

### 4.2 框架 props（view 组件收到的标准套件）

```ts
// 由 conversation.view slot 注入的框架标准 props（ui-trajectory 同款）
export interface FrameworkViewProps {
  /** 当前会话 id。 */
  readonly sessionId: string;
  /** 会话快照 hook（uSES 订阅）。 */
  readonly useSession: () => ConversationSnapshot;
  /** 加载更早历史（分页），返回是否还有更多。 */
  readonly loadOlder: () => Promise<boolean>;
  /** 本地化函数（locale 命名空间 'trajectory-map'）。 */
  readonly t: (key: string) => string;
}

---

## 5. UI 组件

### 5.1 TrajectoryMapView（视图根）

```tsx
// src/trajectory-map/ui/TrajectoryMapView.tsx
export interface TrajectoryMapViewProps
  extends ConvViewOwnerProps, FrameworkViewProps, TrajectoryMapInjected {}

export interface TrajectoryMapInjected {
  readonly hooks: {
    /** 是否显示重试徽标（设置开关）。 */
    showRetries: SnapshotStore<boolean>;
  };
}

export function TrajectoryMapView(props: TrajectoryMapViewProps): JSX.Element
```

**行为**：

- 从 `useSession()` 快照构建 `ToolGraph`（`useMemo` 依赖快照引用）。
- 空图（无任何工具调用）→ 渲染空状态文案（“本窗口内没有工具调用”）。
- 窗口滚动到底部时调用 `loadOlder()` 加载更早历史（与 ui-trajectory 的分页行为一致）。
- 接收 `inspect`（其他视图的检查请求，如 Chat 的 Inspect 按钮）→ 定位到指定 callId 并高亮。

### 5.2 FlowGraph（SVG 渲染）

```tsx
// src/trajectory-map/ui/FlowGraph.tsx
export interface FlowGraphProps {
  readonly graph: ToolGraph;
  readonly layout: GraphLayout;
  readonly selectedId: string | null;
  readonly onSelect: (callId: string | null) => void;
  readonly showRetries: boolean;
  /** 打开工具详情壳层（conversation.details.tool 的消费方）。 */
  readonly openDetails: (block: ToolCallBlock) => void;
}

export function FlowGraph(props: FlowGraphProps): JSX.Element;
```

**渲染**：

- SVG `<g>` 按 layout.positions 放置节点卡片（`<foreignObject>` 内嵌 HTML 卡片，或纯 SVG rect+text）。
- 边：父 → 子 的贝塞尔曲线（`<path>`，二次贝塞尔，控制点取层间中点）。
- 节点卡片：名称、状态色（running=蓝 / settled=绿 / error=红）、耗时徽标、重试徽标（×N）。
- 交互：点击节点 → `onSelect` + `openDetails(block)`；空白处点击 → 取消选择。
- 工具栏：缩放（+/-/重置）、适应窗口（fit）。

### 5.3 缩放与平移

```ts
// src/trajectory-map/ui/use-viewport.ts

/** 视图视口状态：缩放比例 + 平移偏移。 */
export interface Viewport {
  readonly scale: number;   // 0.25 ~ 3
  readonly dx: number;
  readonly dy: number;
}

export function useViewport(initial?: Viewport): {
  viewport: Viewport;
  zoomIn: () => void;
  zoomOut: () => void;
  reset: () => void;
  fit: (bounds: { width: number; height: number }) => void;
  setPan: (dx: number, dy: number) => void;
}
```

---

## 6. 与既有视图的关系

- **与 Chat 视图**：并行标签页，互不干扰；Chat 的 Inspect 按钮经 `inspect`/`onInspectDone`
  与流程图联动（选中同一工具调用）。
- **与 ui-trajectory**：各自独立注册 view tab；本模块 order 排在 ui-trajectory 之后。
  若用户同时启用两者，标签页并列显示；本模块 v0.1 不消费 ui-trajectory 数据（路径 B 未实现）。
- **与 exporter**：共享 `foldCall`/`orderedNodes` 折叠逻辑（同一工具树入口），提取为 shared 模块。

---

## 7. 测试要点

- **buildToolGraph**：root 多棵树、单棵深树、RunningToolCall（未结算）、subCalls 窗口截断
  （ToolResultNode.call 为 null）。
- **layoutGraph**：单节点、多层链、宽树（同层多节点换行）、空图。
- **FlowGraph**：节点/边数量、状态色、重试徽标条件渲染、点击回调。
- **注册**：`conversation.view` 中出现 id='trajectory-map' 的条目；`enabled: false` 时不出现。

---

## 8. 与主文档的差异核对

- 主文档 §4.2 建议“注册独立 Definition”；本稿改为**复用 Chat 已组装节点**（路径 A），
  不新增 Definition——减少事件折叠开销，且与 exporter 共享代码。此变更在 §2.1 有论证。
- 主文档 §4.3 的 FlowGraph 交互项（缩放/平移/重置/详情壳层）与本稿 §5.2/§5.3 对齐。
