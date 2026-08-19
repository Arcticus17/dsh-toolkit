import type { Context } from '@deepseek-ai/cordis'

/**
 * dsh-toolkit 根入口（Host 侧）。
 * 本包是纯客户端插件：host 侧仅提供空 apply 占位（让 loader 树中的行可激活），
 * 真实逻辑全部在 /client 子路径（浏览器端执行）。
 * 遵循 DSH 客户端插件约定：host 入口不依赖任何客户端服务。
 */
export type {
  ToolkitConfig,
  ExporterConfig,
  TrajectoryMapConfig,
  CommandPaletteConfig,
  ChatBackgroundConfig,
} from './types.js'
export { ToolkitConfigSchema } from './shared/config.js'

export const name = 'dsh-toolkit'

/** Host 侧空 apply：客户端能力由浏览器 bundle（exports['./client']）提供。 */
export function apply(_ctx: Context): void {
  // 空实现：不注册任何 host 资源
}
