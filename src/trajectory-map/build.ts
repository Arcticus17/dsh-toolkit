import type { ConversationNode, ConversationSnapshot, ToolCallBlock } from '@deepseek-ai/dsh-client-runtime/client'
import { contentText, orderedNodes } from '../shared/fold.js'
import { callDuration, isSettled } from './model.js'
import type { GraphCall, GraphRetry, ToolGraph } from './model.js'

/** 从会话快照构建工具调用图（纯函数）。 */
export function buildToolGraph(snapshot: ConversationSnapshot): ToolGraph {
  const nodes = orderedNodes(snapshot)
  const byId = new Map<string, GraphCall>()

  // 第一遍：折叠全部顶层工具调用，递归登记全部节点（含 subCalls）到 byId
  const roots: GraphCall[] = []
  for (const node of nodes) {
    if (node.kind !== 'tool-result') continue
    const call = foldCall(node, null)
    roots.push(call)
    indexCalls(call, byId)
  }

  // 按启动时间排序根
  roots.sort((a, b) => a.time - b.time)

  return {
    roots,
    byId,
    retries: collectRetries(nodes),
    truncated: snapshot.hasMore === true,
  }
}

/** 递归登记整棵调用树到 byId 索引（子调用同样可寻址）。 */
function indexCalls(call: GraphCall, byId: Map<string, GraphCall>): void {
  byId.set(call.callId, call)
  for (const child of call.children) indexCalls(child, byId)
}

/** 单节点折叠（ToolResultNode → GraphCall；RunningToolCall → status 'running'）。 */
export function foldCall(block: ToolCallBlock, parentId: string | null): GraphCall {
  const settled = isSettled(block)
  const children = (block.subCalls ?? []).map(c => foldCall(c, block.callId))

  const base = {
    callId: block.callId,
    name: settled ? (block.call?.name ?? block.callId) : block.name,
    argsRaw: settled ? (block.call?.argsRaw ?? '{}') : block.argsRaw,
    time: block.time,
    callTime: settled ? block.callTime : block.time,
    parentId,
    children,
    // 预留：宿主 llm/retry 事件是 turn 级（无 callId），无法关联到具体工具调用；
    // 工具调用自身的重试次数需宿主在 ToolCallBlock 上暴露后接入。
    retryCount: 0,
  }

  if (settled) {
    return {
      ...base,
      status: block.isError ? 'error' : 'settled',
      durationMs: callDuration(block),
      resultPreview: contentText(block.content).slice(0, 500),
      error: block.error,
    }
  }
  return {
    ...base,
    status: 'running',
    durationMs: null,
    resultPreview: '',
  }
}

/**
 * 收集重试：扫描 nodes 中的 model-retry 节点（模型请求级重试，turn 级事件）。
 * callId 恒为 null：事件载荷不含 callId，无法关联到工具调用；关联需宿主扩展。
 */
export function collectRetries(nodes: readonly ConversationNode[]): GraphRetry[] {
  const retries: GraphRetry[] = []
  for (const node of nodes) {
    if (node.kind !== 'model-retry') continue
    retries.push({
      callId: null,
      attempt: node.retry,
      maxAttempts: node.mode === 'normal' ? node.maxRetries : null,
      state: node.retryState,
      delayMs: node.delayMs,
      failureMessage: node.failure.message,
      time: node.time,
    })
  }
  return retries
}
