import { z } from 'zod'

export const ExporterConfigSchema = z.object({
  enabled: z.boolean().default(true),
  defaultFormat: z.enum(['markdown', 'html', 'json']).default('markdown'),
  includeToolCalls: z.boolean().default(true),
  includeStats: z.boolean().default(true),
})

export const TrajectoryMapConfigSchema = z.object({
  enabled: z.boolean().default(true),
  defaultCollapsed: z.boolean().default(true),
  showRetries: z.boolean().default(true),
})

export const CommandPaletteConfigSchema = z.object({
  enabled: z.boolean().default(true),
  shortcut: z.string().default('mod+k'),
})

export const ChatBackgroundConfigSchema = z.object({
  enabled: z.boolean().default(true),
  maxImageBytes: z.number().int().positive().default(2 * 1024 * 1024),
})

/** 整体配置（各子配置可选；用于组合端做整体解析）。 */
export const ToolkitConfigSchema = z.object({
  exporter: ExporterConfigSchema.optional(),
  trajectoryMap: TrajectoryMapConfigSchema.optional(),
  commandPalette: CommandPaletteConfigSchema.optional(),
  chatBackground: ChatBackgroundConfigSchema.optional(),
})
