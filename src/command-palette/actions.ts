import type { Agent } from '@deepseek-ai/dsh-agent'
import type { CommandDescriptor, CommandExecution } from '@deepseek-ai/dsh-commands/types'

/** 面板中可执行的一个动作（统一抽象命令/导航/自定义）。 */
export interface PaletteAction {
  /** 稳定 id（插件内唯一）。 */
  readonly id: string
  /** 显示名称（过滤匹配目标之一）。 */
  readonly label: string
  /** 附加关键词（过滤匹配，不显示）。 */
  readonly keywords?: readonly string[]
  /** 分组（用于面板分组标题）。 */
  readonly group: PaletteGroup
  /** 动作类型（决定执行方式与结果呈现）。 */
  readonly kind: 'command' | 'navigation' | 'action'
  /** 描述（次要行）。 */
  readonly description?: string
  /** 执行；返回结果文本（toast 显示）或 null。 */
  readonly run: (ctx: ActionRunContext) => Promise<string | null> | string | null
}

export type PaletteGroup = '命令' | '会话' | '工具' | '自定义'

/** 执行上下文：动作运行时需要的会话与命令能力。 */
export interface ActionRunContext {
  /** 当前会话 id（可能为 null）。 */
  readonly sessionId: string | null
  /** 命令执行器（包装 ctx.commands.execute）。 */
  readonly executeCommand: (agent: Agent, line: string) => Promise<CommandExecution>
  /** 打开一个会话（导航动作）。 */
  readonly openSession: (sessionId: string) => void
}

/** 从 ctx.commands 列表构建命令动作（kind: 'command'）。 */
export function commandsToActions(
  descriptors: readonly CommandDescriptor[],
  execute: ActionRunContext['executeCommand'],
): PaletteAction[] {
  return descriptors.map(d => ({
    id: 'command.' + d.name,
    label: '/' + d.name,
    keywords: [d.description],
    group: '命令',
    kind: 'command',
    description: d.description,
    run: (ctx: ActionRunContext) => {
      const line = '/' + d.name
      return ctx.executeCommand(ctx.sessionId as unknown as Agent, line).then(ex => {
        const result = ex.result
        return result.kind === 'success' ? (result.text ?? null) : result.text
      })
    },
  }))
}

/** 从会话列表构建导航动作（kind: 'navigation'）。 */
export function sessionsToActions(
  sessions: readonly { id: string; title: string }[],
  openSession: ActionRunContext['openSession'],
): PaletteAction[] {
  return sessions.map(s => ({
    id: 'session.' + s.id,
    label: s.title || s.id,
    group: '会话',
    kind: 'navigation',
    run: () => {
      openSession(s.id)
      return null
    },
  }))
}

/** 注册扩展动作（kind: 'action'）。 */
export function customAction(
  def: Omit<PaletteAction, 'kind' | 'group'> & { group?: PaletteGroup },
): PaletteAction {
  return { ...def, kind: 'action', group: def.group ?? '自定义' }
}
