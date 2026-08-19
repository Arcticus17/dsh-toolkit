import { Context } from '@deepseek-ai/cordis'
import type { ToolkitConfig } from '../types.js'
import { defaultExporterConfig } from '../types.js'
import { ExportMenu } from './ui/ExportMenu.js'

export const name = 'exporter'

/**
 * 导出器插件：注册会话页头导出按钮 + 命令面板动作。
 *
 * 注册模式（对齐 ui-jobs / ui-trajectory）：
 * ctx.slots.inject(key, cb) 在声明存在时同步执行；cb 内再调
 * ctx.slots.register(options, Component) 注册组件，随 plugin 卸载自动移除。
 */
export function apply(ctx: Context, config: ToolkitConfig): void {
  const cfg = config.exporter ?? defaultExporterConfig
  if (!cfg.enabled) return
  void cfg // config 当前仅用于 enabled 开关；后续版本接入 defaultFormat 等

  // 1. 会话页头工具按钮（ui-conversation 声明 'conversation.session.header.utilities'）
  //    组件直接收框架标准套件（sessionId/useSessions/t），无需 inject 面（ui-jobs 模式）
  ctx.slots.inject('conversation.session.header.utilities', () =>
    ctx.slots.register({
      name: 'conversation.session.header.utilities',
      id: 'dsh-toolkit-export',
      order: 10,
    }, ExportMenu),
  )

  // 2. 命令面板动作（command-palette 先 apply 提供 ctx.palette 注册表，直接登记）
  ctx.palette.register({
    id: 'exporter.export',
    label: '导出当前会话',
    keywords: ['export', '导出'],
    group: '工具',
    kind: 'action',
    run: () => '导出功能已触发（v0.1 骨架）',
  })
}
