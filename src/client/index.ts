/**
 * dsh-toolkit 客户端入口：四个独立模块的组装点。
 * 每个模块是独立插件 entry，经 cordis.yml 组合；本文件为 loader 的客户端装配入口。
 */
import { Context } from '@deepseek-ai/cordis'
import type { ToolkitConfig } from '../types.js'
import * as exporter from '../exporter/entry.js'
import * as trajectoryMap from '../trajectory-map/entry.js'
import * as commandPalette from '../command-palette/entry.js'
import * as chatBackground from '../chat-background/entry.js'

/**
 * 客户端插件依赖的既有服务 —— 注意这里是【服务名】，不是包名。
 *
 * loader 的 fiber 按本列表等待服务就绪后才 apply；等待名单与包名（package.json
 * dsh.client.inject，仅作 manifest 依赖边元数据）是两回事。宿主官方客户端插件
 * （如 dsh-client-ui-trajectory）的 bundle inject 即采用短服务名。
 *
 * - slots:    slot 注册/注入（四个模块全部使用）
 * - sessions: trajectory-map 在 conversation.view 注入面内做会话绑定
 */
export const inject: string[] = [
  'slots',
  'sessions',
]

/**
 * 客户端插件体：按配置启用各模块（各模块内部自行判断 enabled）。
 * apply 顺序有讲究：command-palette 先提供 ctx.palette 注册表，
 * 之后 exporter / chat-background 直接向注册表登记面板动作。
 */
export function apply(ctx: Context, config: unknown): void {
  // 真实 web boot：config 恒为 undefined（manifest 行不携带 config），
  // 各模块入口自行回退默认配置。
  const cfg = config as ToolkitConfig | undefined
  commandPalette.apply(ctx, cfg)
  exporter.apply(ctx, cfg)
  trajectoryMap.apply(ctx, cfg)
  chatBackground.apply(ctx, cfg)
}
