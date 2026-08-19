# 模块细化设计 — 聊天背景自定义 (chat-background)

> 所属插件：`@dsh-community/dsh-toolkit` · 版本 0.1.0 · 接口级设计
> 前置文档：[plugin-design.md](./plugin-design.md) §6

---

## 1. 目标与范围

允许用户自定义**会话/消息区域的背景**：纯色、渐变、图片（URL 或本地文件转 data URL），
模糊程度、透明度，以及暗色模式下的独立配置（图片来源 URL 与 data URL 均允许，已确认决策）。

设计原则（对齐 ui-theme 的架构）：

- **DOM-free 服务**：背景状态管理不直接操作 DOM 样式；
- **渲染层分离**：CSS 变量在渲染层（会话滚动容器）应用；
- **settings 持久化**：通过 bindSettingsScope 绑定 Host settings namespace。

范围界定：

- 背景仅作用于会话聊天区域（`data-conversation-scroll` 容器），不作用于全局外壳。
- 本地文件仅在本进程内转 data URL（无上传 RPC）。

---

## 2. 设置模型

### 2.1 settings namespace 与 schema

```ts
// src/chat-background/background.ts

/** 聊天背景配置（settings namespace: 'chat-background'）。 */
export interface ChatBackgroundSettings {
  /** 背景模式。 */
  readonly mode: 'color' | 'gradient' | 'image';
  /** 纯色（CSS 颜色，如 '#1e1e2e'）。 */
  readonly color: string;
  /** 渐变（CSS linear-gradient 字符串，仅 gradient 模式）。 */
  readonly gradient: string;
  /** 图片（URL 或 data URL，仅 image 模式）。 */
  readonly image: string;
  /** 背景模糊（px，0 表示无）。 */
  readonly blur: number;
  /** 背景不透明度（0~1）。 */
  readonly opacity: number;
  /** 暗色模式独立配置（覆盖 light 的同名字段）。 */
  readonly dark: DarkBackgroundSettings;
}

export interface DarkBackgroundSettings {
  readonly mode: 'color' | 'gradient' | 'image';
  readonly color: string;
  readonly gradient: string;
  readonly image: string;
  readonly blur: number;
  readonly opacity: number;
}

/** 默认值（跟随主题：浅色 = 白色系，深色 = 深色系）。 */
export const defaultBackground: ChatBackgroundSettings = {
  mode: 'color',
  color: 'transparent',   // 透明 = 不覆盖主题表面
  gradient: '',
  image: '',
  blur: 0,
  opacity: 1,
  dark: { mode: 'color', color: 'transparent', gradient: '', image: '', blur: 0, opacity: 1 },
};

export const backgroundSettingsSpec: SettingsScopeSpec<ChatBackgroundSettings> = {
  namespace: 'chat-background',
  // decode 缺省：按 namespace 自身的 wire schema 校验
};

### 2.2 校验规则

```ts
// src/chat-background/validate.ts

/** 校验图片源：URL（http/https）或 data URL（image/*）；返回错误码或 null。 */
export function validateImageSource(
  source: string,
  maxBytes: number,
): { ok: true } | { ok: false; code: 'bad-url' | 'too-large' | 'not-image' }

/** 校验颜色（CSS 颜色可解析性：/^#([0-9a-f]{3}|[0-9a-f]{6})$/i 或合法命名色）。 */
export function validateColor(color: string): boolean

/** 归一化：blur 夹取 [0, 64]、opacity 夹取 [0, 1]。 */
export function clampBackground(settings: ChatBackgroundSettings): ChatBackgroundSettings
```

---

## 3. 背景服务 (BackgroundRuntime)

### 3.1 服务接口

```ts
// src/chat-background/background.ts（续）

/** 聊天背景运行时：只读快照 + 变更订阅 + 写入。 */
export interface BackgroundRuntime {
  /** 当前快照（不可变；uSES 可读）。 */
  getSnapshot(): BackgroundSnapshot;
  /** 订阅快照替换。 */
  subscribe(listener: () => void): () => void;
  /** 更新字段（写入 settings；快速连续写按 revision 串行）。 */
  set(field: keyof ChatBackgroundSettings, value: unknown): Promise<void>;
  /** 恢复默认（清空 user 层覆盖）。 */
  reset(): Promise<void>;
}

/** 发布给渲染层的快照。 */
export interface BackgroundSnapshot {
  /** settings 同步状态。 */
  readonly status: 'loading' | 'ready' | 'unavailable';
  /** 生效中的背景（已按当前主题解析 dark/light）。 */
  readonly resolved: ResolvedBackground;
  /** 原始 settings（设置 UI 用）。 */
  readonly settings: ChatBackgroundSettings;
  /** 是否可写（memory 模式为 false）。 */
  readonly writable: boolean;
}

/** 已解析背景（渲染层唯一输入）。 */
export interface ResolvedBackground {
  readonly mode: 'color' | 'gradient' | 'image';
  readonly css: {
    readonly backgroundImage: string;      // url(...) 或 linear-gradient(...) 或 none
    readonly backgroundColor: string;
    readonly blur: string;                 // '12px' 或 '0'
    readonly overlay: string;              // scrim rgba()
  };
}

### 3.2 主题联动

```ts
// src/chat-background/background.ts（续）

/**
 * 依据 ThemeSnapshot 解析暗色/浅色配置：
 * - theme.dark === true  → 使用 settings.dark（其字段缺省回退到顶层）；
 * - 否则 → 使用顶层字段。
 * 输出 ResolvedBackground.css（渲染层直接应用的 CSS 值）。
 */
export function resolveBackground(
  settings: ChatBackgroundSettings,
  dark: boolean,
): ResolvedBackground
```

---

## 4. 渲染层

### 4.1 CSS 变量清单

```css
/* src/chat-background/styles.css —— 随包发布 */
/* 会话滚动容器（data-conversation-scroll）绑定变量： */
:root {
  --dsh-chat-bg-image: none;
  --dsh-chat-bg-color: transparent;
  --dsh-chat-bg-blur: 0;
  --dsh-chat-bg-overlay: rgba(0, 0, 0, 0);
}

[data-conversation-scroll] {
  background-image: var(--dsh-chat-bg-image);
  background-color: var(--dsh-chat-bg-color);
  position: relative;
}

[data-conversation-scroll]::before {
  /* scrim 层：背景模糊 + 遮罩，保证消息可读性 */
  content: '';
  position: absolute; inset: 0;
  backdrop-filter: blur(var(--dsh-chat-bg-blur));
  background: var(--dsh-chat-bg-overlay);
  pointer-events: none;
  z-index: 0;
}

[data-conversation-scroll] > * { position: relative; z-index: 1; }
```

### 4.2 变量写入

```ts
// src/chat-background/apply.ts

/**
 * 将 ResolvedBackground 应用到滚动容器元素（渲染层）。
 * 订阅 BackgroundRuntime；快照变化时 setProperty 更新 4 个变量。
 * 容器不存在（无会话）时跳过；元素出现时补应用。
 * @returns disposer
 */
export function applyBackground(
  runtime: BackgroundRuntime,
  scrollContainer: () => HTMLElement | null,
): () => void;
```

---

## 5. 设置 UI

### 5.1 BackgroundSettings 行

```tsx
// src/chat-background/ui/BackgroundSettings.tsx
export interface BackgroundSettingsProps {
  readonly runtime: BackgroundRuntime;
  /** 主题快照（暗色模式联动）。 */
  readonly theme: ThemeSnapshot;
  readonly maxImageBytes: number;
}

export function BackgroundSettings(props: BackgroundSettingsProps): JSX.Element;
```

**UI 结构**（注册到 ui-settings 外观分组）：

- 模式选择：纯色 / 渐变 / 图片（SegmentedControl）。
- 纯色：颜色选择器（input type=color + 预设色板）。
- 渐变：渐变预设列表（6 个预设 CSS linear-gradient）+ 自定义输入。
- 图片：URL 输入框 + 本地文件选择（`<input type=file accept=image/*>` → FileReader → data URL）；
  校验失败显示错误码文案。
- 模糊滑块（0~64px）+ 不透明度滑块（0~100%）。
- 「暗色模式使用单独背景」开关 → 展开 dark 子配置（同结构，收起状态）。
- 实时预览：迷你会话背景样本（复用 ResolvedBackground 的 css 值）。
- 「恢复默认」按钮 → `runtime.reset()`。

### 5.2 注册方式

```ts
// src/chat-background/entry.ts
import { Context, h } from '@deepseek-ai/cordis'

export const name = 'chat-background'

export function apply(ctx: Context, config: ToolkitConfig): void {
  const cfg = config.chatBackground ?? defaultChatBackgroundConfig;
  if (!cfg.enabled) return;

  // 1. 绑定 settings scope（namespace 'chat-background'）
  const scope = ctx.attachSettings(backgroundSettingsSpec);
  const runtime = new BackgroundRuntimeImpl(scope, ctx.theme);

  // 2. 贡献设置行（ui-settings 外观分组）
  ctx.slots.inject('ui-settings.appearance', () =>
    h(BackgroundSettings, { runtime, theme: useTheme(), maxImageBytes: cfg.maxImageBytes })
  );

  // 3. 应用背景到滚动容器（订阅运行时 + DOM 应用）
  const disposer = applyBackground(runtime, () =>
    document.querySelector('[data-conversation-scroll]')
  );
  ctx.on('dispose', disposer);

  // 4. 注册命令面板动作（背景预设；v0.1 直接登记进 ctx.palette，见 plugin-design §7.2）
  ctx.palette.register({
      id: 'chat-background.reset',
      label: '恢复默认聊天背景',
      group: '工具',
      kind: 'action',
      run: () => { runtime.reset(); return '已恢复默认背景'; },
    })
  );
}
```

---

## 6. 依赖注入清单

| 服务 | 用途 | 来源 |
|---|---|---|
| `ctx.attachSettings` | settings namespace 绑定 | `@deepseek-ai/dsh-client-ui-settings`（经 runtime 导出） |
| `ctx.theme` | 明暗模式联动 | `@deepseek-ai/dsh-client-ui-theme`（ThemeRuntime） |
| `ctx.slots` | 设置行 / 面板动作注入 | dsh-client-runtime |

---

## 7. 测试要点

- **resolveBackground**：dark 字段缺省回退、透明默认不覆盖主题、blur/opacity 夹取。
- **validateImageSource**：URL 协议白名单、data URL 大小上限、非图片 MIME 拒绝。
- **applyBackground**：容器存在/缺失、快照变化更新变量、disposer 清理。
- **设置 UI**：模式切换、图片上传校验错误、暗色子配置开关、恢复默认。

---

## 8. 与主文档的差异核对

- 主文档 §6.2 的 settings namespace `chat-background` 与本稿 §2.1 一致。
- 主文档 §6.3 的 CSS 变量名（`--dsh-chat-bg-image/blur/overlay`）与本稿 §4.1 对齐，补充了 `--dsh-chat-bg-color`。
- 主文档 §6.3 的 scrim 层在本稿 §4.1 用 `::before` + `backdrop-filter` 具体化；
  补充了滚动容器内内容 `z-index` 提升（保证可读性）。
- 新增 `BackgroundRuntime` 服务接口（主文档未细化服务层）与命令面板动作注册。
