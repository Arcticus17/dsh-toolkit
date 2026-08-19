# dsh-toolkit

> DeepSeek Harness 客户端 UI 增强工具包：会话导出器、思考过程流程图、命令面板、聊天背景。
> 纯客户端实现，零后端改动；可独立发布、可扩展。

## 功能模块

| 模块 | 功能 | 状态 |
|---|---|---|
| `exporter` | 会话导出（Markdown / HTML / JSON） | 核心逻辑完成，UI 接线待续 |
| `trajectory-map` | 思考过程流程图（工具调用 DAG） | 核心逻辑完成，视图注册待续 |
| `command-palette` | 全局命令面板（命令/导航/自定义动作） | 服务+过滤完成，面板挂载待续 |
| `chat-background` | 聊天背景自定义（颜色/渐变/图片/模糊） | 运行时+CSS 完成，设置 UI 待续 |

## 安装

```bash
npm install @dsh-community/dsh-toolkit
```

## 组合（cordis.yml）

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
      maxImageBytes: 2097152
```

每个子配置可缺省（缺省启用默认行为）；`enabled: false` 的模块不注册任何内容。

## 开发

```bash
npm run build        # tsc 编译到 lib/
npm run typecheck    # 类型检查
npm test             # 运行全部单元测试（pretest 自动构建）
npm run clean        # 清理 lib/
```

## 测试

- 框架：Node 内置 `node:test`（`--test-isolation=none`，沙箱下禁止子进程隔离）。
- 测试直接导入 `lib/` 编译产物（标准 ESM，无 TS 解析问题）。
- 覆盖：exporter（折叠/构建/三渲染器快照）、trajectory-map（图构建/布局）、
  command-palette（过滤/MRU/注册表/快捷键）、chat-background（校验/背景解析/运行时/DOM 应用）、
  组件冒烟（FlowGraph/ExportModal 经 react-dom/server 渲染）。
- 新增测试文件放置于 `tests/*.test.ts` 即可被自动发现。

## 架构约定

- 客户端 bundle 必须从 `/client` 子路径导入本包（避免 loader externals 内联第二个模块实例）。
- 模块间不互相依赖；共享折叠逻辑位于 `src/shared/`。
- 命令面板动作注册表 `ctx.palette` 是本包内部扩展点（v0.1 由模块内直接登记；
  不声明自有 slot——SlotCore 要求声明槽位的组件消费 renderSlot，动作注册不是渲染贡献）。

## 文档

- [设计总稿](docs/plugin-design.md)
- [exporter 细化设计](docs/exporter-design.md)
- [trajectory-map 细化设计](docs/trajectory-map-design.md)
- [command-palette 细化设计](docs/command-palette-design.md)
- [chat-background 细化设计](docs/chat-background-design.md)

## 已知限制（v0.1）

- 导出仅覆盖已加载窗口（`truncated` 标注）；整个会话导出列入 v1.0。
- 流程图的工具调用重试徽标暂无数据源（宿主 `llm/retry` 事件为 turn 级、不携带
  callId），`retryCount` 预留为 0，待宿主在 ToolCallBlock 暴露调用级重试后接入。
- 各模块 UI 挂载点（页头按钮/视图标签页/面板 overlay/设置行）为骨架占位，待宿主接线。
- 聊天背景使用内存模式（Host settings 持久化后续接入）。

## License

MIT
## 客户端 bundle 打包

DSH 客户端插件要求 `exports['./client']` 指向**单一自包含 bundle**（`window.__ModuleLoader__.load` 格式），
依赖通过 factory 的 `require` 解析（裸模块名），不支持多文件 ESM。构建流程：

```bash
npm run build        # tsc 编译 + esbuild 打包 client bundle
```

- `tsc` 产出 `lib/`（类型 + 多文件 ESM，供类型消费方与 dev 参考）。
- `bundle.mjs` 用 esbuild 把 `src/client/index.ts` 打包为 CJS 并包裹成
  `window.__ModuleLoader__.load({ id, factory })` 写入 `lib/client.js`（最终发布产物）。
- 依赖全部 external（react、@deepseek-ai/*），浏览器端由模块表解析。

## DSH 挂载要点（boot 契约）

在 `$DSH_HOME/profiles/web/` 挂载（junction 安装 + `cordis.patch.yml` insert 行）时：

1. `__DSH_BOOT__.entries` 中的行由 package.json 的 `dsh.client` 生成；其中
   `dsh.client.inject` 只是 manifest 依赖边元数据（包名），**不参与 boot 等待**。
2. boot 真正等待的是 **bundle 导出的 `inject`（服务名）**：本包为
   `['slots', 'sessions']`。曾误把 8 个 `@deepseek-ai/*` 包名写进 bundle inject，
   导致 entry 永久 pending（`waiting for services: @deepseek-ai/dsh-client-runtime, ...`），
   已修复并由 tests/client-entry.test.ts 覆盖。
3. host 入口 `lib/index.js` 的 apply 必须为空（纯客户端插件约定），
   否则 host loader 会因等待客户端服务而卡在 pending。
