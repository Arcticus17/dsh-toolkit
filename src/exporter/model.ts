import type { ConversationNode } from '@deepseek-ai/dsh-client-runtime/client'

/** 导出一份会话窗口的结果模型（渲染器唯一输入）。 */
export interface ExportedSession {
  /** 版本号，用于 JSON 产物向后兼容。 */
  readonly formatVersion: 1
  readonly sessionId: string
  readonly title: string
  readonly cwd: string
  /** Unix epoch ms（源会话事件时间）。 */
  readonly exportedAt: number
  /** 会话统计（来自 sessionStats 投影，缺失时省略）。 */
  readonly stats?: SessionStatsExport
  /** 是否还有更早历史未加载（hasMore 镜像）→ 渲染器输出截断提示。 */
  readonly truncated: boolean
  /** 已排序的导出行。 */
  readonly rows: readonly ExportedRow[]
}

/** 会话统计导出子集（字段名与 sessionStats 投影一致）。 */
export interface SessionStatsExport {
  readonly turns: number
  readonly steps: number
  readonly llmMs?: number
  readonly ttftMs?: number
  readonly decodeMs?: number
  readonly decodeTokens?: number
  readonly toolMs?: number
}

/** 按会话流顺序排列的导出行；kind 与 ConversationNode 对齐，便于溯源。 */
export type ExportedRow =
  | UserRow | AssistantRow | SteeringRow | ContextRow
  | ToolRow | RetryRow | TurnErrorRow | MaxTokensRow
  | CommandRow | CompactionRow | UnknownRow

/** 用户消息。 */
export interface UserRow {
  readonly kind: 'user'
  readonly seq: number
  readonly time: number
  readonly content: readonly ContentBlockExport[]
}

/** 助手消息。blocks 为已分类的 AssistantBlock。 */
export interface AssistantRow {
  readonly kind: 'assistant'
  readonly seq: number
  readonly time: number
  readonly turn: number
  readonly step: number
  readonly blocks: readonly AssistantBlockExport[]
  readonly interrupted?: true
  readonly requestConfig?: { provider: string; model: string } | undefined
  readonly timing?: AssistantTimingExport | undefined
}

/** 运行中的 steering（中途引导）气泡。 */
export interface SteeringRow {
  readonly kind: 'steering'
  readonly seq: number
  readonly time: number
  readonly content: readonly ContentBlockExport[]
}

/** 上下文注入（skill / 工作区指令 / 跨会话召回）。 */
export interface ContextRow {
  readonly kind: 'context'
  readonly seq: number
  readonly time: number
  readonly content: readonly ContentBlockExport[]
  readonly provenance: { role: string; producer?: string } | undefined
  readonly form: string | null
}

/** 工具调用根（递归持有 subCalls）。 */
export interface ToolRow {
  readonly kind: 'tool'
  readonly seq: number
  readonly time: number
  readonly callId: string
  readonly name: string
  readonly argsRaw: string
  readonly isError: boolean
  readonly error?: { name: string; code: string } | undefined
  readonly callTime: number | null
  /** 递归子调用（Code Dispatch 树）。 */
  readonly subCalls: readonly ToolRow[]
  /** 工具结果文本（content 的 text 拼接）。 */
  readonly resultText: string
}

/** 模型重试链。 */
export interface RetryRow {
  readonly kind: 'retry'
  readonly seq: number
  readonly time: number
  readonly attempt: number
  readonly maxAttempts: number | null
  readonly state: 'scheduled' | 'started' | 'cancelled'
  readonly delayMs: number | null
  readonly failureMessage: string | null
}

/** 终态轮次失败（无重试）。 */
export interface TurnErrorRow {
  readonly kind: 'turn-error'
  readonly seq: number
  readonly time: number
  readonly turn: number
  readonly step: number
  readonly message: string
  readonly code?: string
}

/** max-tokens 截断提示。 */
export interface MaxTokensRow {
  readonly kind: 'max-tokens'
  readonly seq: number
  readonly time: number
  readonly turn: number
  readonly step: number
}

/** 斜杠命令生命周期。 */
export interface CommandRow {
  readonly kind: 'command'
  readonly seq: number
  readonly time: number
  readonly name: string | null
  readonly args: string | null
  readonly outcome: { kind: 'success' | 'error'; text?: string } | null
}

/** 压缩检查点。 */
export interface CompactionRow {
  readonly kind: 'compaction'
  readonly seq: number
  readonly time: number
  readonly summary: string | null
  readonly shadowedItemCount: number | null
  readonly shadowedTokenCount: number | null
}

/** 未知 surface 事件（降级行）。 */
export interface UnknownRow {
  readonly kind: 'unknown'
  readonly seq: number
  readonly time: number
  readonly type: string
  readonly data: unknown
}

/** 与 dsh-llm ContentBlock 对齐；image 仅携带可展示引用元数据。 */
export type ContentBlockExport =
  | { type: 'text'; text: string }
  | { type: 'reasoning'; text: string }
  | { type: 'image'; name?: string; mime?: string; bytes?: number }
  | { type: 'tool-call'; id: string; name: string; arguments: string }
  | { type: 'tool-result'; toolCallId: string; isError?: boolean; content: ContentBlockExport[] }
  | { type: 'unknown'; value: unknown }

/** 与 dsh-client-runtime AssistantBlock 对齐。 */
export type AssistantBlockExport =
  | { kind: 'text'; text: string }
  | { kind: 'reasoning'; text: string }
  | { kind: 'image'; name?: string; mime?: string; bytes?: number }
  | { kind: 'tool-call'; callId: string; name: string; argsRaw: string }
  | { kind: 'other'; block: unknown }

export interface AssistantTimingExport {
  readonly stepStartTime: number | null
  readonly firstTokenTime: number | null
  readonly completedTime: number
}

/** 导出格式 id。 */
export type ExporterFormat = 'markdown' | 'html' | 'json'

/** 折叠选项。 */
export interface FoldOptions {
  readonly includeToolCalls: boolean
  readonly includeReasoning: boolean
  readonly includeContext: boolean
  readonly includeCommands: boolean
}

export const defaultFoldOptions: FoldOptions = {
  includeToolCalls: true,
  includeReasoning: false,
  includeContext: true,
  includeCommands: true,
}
