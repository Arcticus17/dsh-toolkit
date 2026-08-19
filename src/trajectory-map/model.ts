import type { ToolCallBlock, ToolResultNode } from '@deepseek-ai/dsh-client-runtime/client'

/** 一次会话窗口的工具调用图（渲染器唯一输入）。 */
export interface ToolGraph {
  /** 根调用（无 parent），按启动顺序。 */
  readonly roots: readonly GraphCall[]
  /** 全部调用平铺（索引：callId → GraphCall）。 */
  readonly byId: ReadonlyMap<string, GraphCall>
  /** 该窗口内出现的重试记录（按事件顺序）。 */
  readonly retries: readonly GraphRetry[]
  /** 窗口是否截断（hasMore）。 */
  readonly truncated: boolean
}

/** 图节点：一次工具调用（运行中或已结算）。 */
export interface GraphCall {
  readonly callId: string
  readonly name: string
  readonly argsRaw: string
  readonly status: 'running' | 'settled' | 'error'
  readonly time: number
  /** 结算耗时（ms）；运行中为 null。 */
  readonly durationMs: number | null
  readonly callTime: number | null
  /** 结果文本（截断至 500 字符用于卡片预览）。 */
  readonly resultPreview: string
  readonly error?: { name: string; code: string } | undefined
  /** 父调用 id；根调用为 null。 */
  readonly parentId: string | null
  /** 子调用（递归），按 dispatch 顺序。 */
  readonly children: readonly GraphCall[]
  /** 关联的重试次数。 */
  readonly retryCount: number
}

/** 重试记录（关联到失败的调用）。 */
export interface GraphRetry {
  readonly callId: string | null
  readonly attempt: number
  readonly maxAttempts: number | null
  readonly state: 'scheduled' | 'started' | 'cancelled'
  readonly delayMs: number | null
  readonly failureMessage: string | null
  readonly time: number
}

/** 节点布局位置（像素坐标，渲染层使用）。 */
export interface GraphLayout {
  readonly width: number
  readonly height: number
  readonly positions: ReadonlyMap<string, { x: number; y: number }>
  /** 每层（同一 y）的节点列表，用于边路径计算。 */
  readonly layers: readonly string[][]
}

export interface LayoutOptions {
  readonly nodeWidth?: number   // 默认 220
  readonly nodeHeight?: number  // 默认 64
  readonly hGap?: number        // 默认 32
  readonly vGap?: number        // 默认 56
}

/** 计算结算耗时：result.time - callTime（callTime 为 null 时 null）。 */
export function callDuration(block: ToolResultNode): number | null {
  if (block.callTime === null || block.callTime === undefined) return null
  return Math.max(0, block.time - block.callTime)
}

/** 判断工具调用是否已结算。 */
export function isSettled(block: ToolCallBlock): block is ToolResultNode {
  return 'kind' in block && block.kind === 'tool-result'
}
