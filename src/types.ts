import type { z } from 'zod'
import {
  ExporterConfigSchema,
  TrajectoryMapConfigSchema,
  CommandPaletteConfigSchema,
  ChatBackgroundConfigSchema,
} from './shared/config.js'

/** 导出器配置（zod 推导）。 */
export type ExporterConfig = z.infer<typeof ExporterConfigSchema>
/** 流程图配置。 */
export type TrajectoryMapConfig = z.infer<typeof TrajectoryMapConfigSchema>
/** 命令面板配置。 */
export type CommandPaletteConfig = z.infer<typeof CommandPaletteConfigSchema>
/** 聊天背景配置。 */
export type ChatBackgroundConfig = z.infer<typeof ChatBackgroundConfigSchema>

/** 插件整体配置（各模块可选；缺省启用默认行为）。 */
export interface ToolkitConfig {
  readonly exporter?: ExporterConfig
  readonly trajectoryMap?: TrajectoryMapConfig
  readonly commandPalette?: CommandPaletteConfig
  readonly chatBackground?: ChatBackgroundConfig
}

/** 模块默认配置（与 zod default 一致，entry 侧兜底）。 */
export const defaultExporterConfig: ExporterConfig = { enabled: true, defaultFormat: 'markdown', includeToolCalls: true, includeStats: true }
export const defaultTrajectoryMapConfig: TrajectoryMapConfig = { enabled: true, defaultCollapsed: true, showRetries: true }
export const defaultCommandPaletteConfig: CommandPaletteConfig = { enabled: true, shortcut: 'mod+k' }
export const defaultChatBackgroundConfig: ChatBackgroundConfig = { enabled: true, maxImageBytes: 2 * 1024 * 1024 }
