import type {
  AssistantMessageNode,
  CommandNode,
  CompactionSummaryNode,
  ConversationNode,
  ModelRetryNode,
  ToolCallBlock,
  ToolResultNode,
  UserMessageNode,
} from '@deepseek-ai/dsh-client-runtime/client'
import { contentText } from '../shared/fold.js'
import type {
  AssistantBlockExport,
  AssistantRow,
  CommandRow,
  CompactionRow,
  ContentBlockExport,
  ExportedRow,
  FoldOptions,
  RetryRow,
  ToolRow,
} from './model.js'

/** 单节点 → 导出行；无法映射的节点返回 null（不进入导出）。 */
export function foldNode(node: ConversationNode, opts: FoldOptions): ExportedRow | null {
  switch (node.kind) {
    case 'user': return foldUser(node, opts)
    case 'assistant': return foldAssistant(node, opts)
    case 'steering':
      return { kind: 'steering', seq: node.seq, time: node.time, content: node.content as unknown as ContentBlockExport[] }
    case 'context':
      return {
        kind: 'context',
        seq: node.seq,
        time: node.time,
        content: node.content as unknown as ContentBlockExport[],
        provenance: { role: node.provenance.role, producer: node.provenance.label ?? undefined },
        form: node.form as string | null,
      }
    case 'tool-result': return opts.includeToolCalls ? foldTool(node) : null
    case 'model-retry': return opts.includeToolCalls ? foldRetry(node) : null
    case 'turn-error':
      return { kind: 'turn-error', seq: node.seq, time: node.time, turn: node.turn, step: node.step, message: node.message, code: node.code }
    case 'turn-max-tokens':
      return { kind: 'max-tokens', seq: node.seq, time: node.time, turn: node.turn, step: node.step }
    case 'command': return opts.includeCommands ? foldCommand(node) : null
    case 'compaction': return foldCompaction(node)
    case 'unknown': return { kind: 'unknown', seq: node.seq, time: node.time, type: node.type, data: node.data }
    default: return null
  }
}

function foldUser(node: UserMessageNode, _opts: FoldOptions): ExportedRow {
  return { kind: 'user', seq: node.seq, time: node.time, content: node.content as unknown as ContentBlockExport[] }
}

function foldAssistant(node: AssistantMessageNode, opts: FoldOptions): AssistantRow {
  const blocks: AssistantBlockExport[] = (node.blocks ?? []).map(b => {
    switch (b.kind) {
      case 'text': return { kind: 'text', text: b.text }
      case 'reasoning': return opts.includeReasoning ? { kind: 'reasoning', text: b.text } : { kind: 'text', text: '' }
      case 'image': return { kind: 'image' }
      case 'tool-call': return { kind: 'tool-call', callId: b.callId, name: b.name, argsRaw: b.argsRaw }
      default: return { kind: 'other', block: b.block }
    }
  })
  const row: AssistantRow = {
    kind: 'assistant',
    seq: node.seq,
    time: node.time,
    turn: node.turn,
    step: node.step,
    blocks: blocks.filter(b => !(b.kind === 'text' && b.text === '')),
  }
  return {
    ...row,
    ...(node.interrupted ? { interrupted: true } : {}),
    ...(node.requestConfig ? { requestConfig: { provider: node.requestConfig.provider, model: node.requestConfig.model } } : {}),
    ...(node.timing ? { timing: { stepStartTime: node.timing.stepStartTime, firstTokenTime: node.timing.firstTokenTime, completedTime: node.timing.completedTime } } : {}),
  }
}

/** 工具调用块递归折叠（ToolCallBlock = RunningToolCall | ToolResultNode）。 */
export function foldTool(block: ToolCallBlock): ToolRow {
  if ('kind' in block) {
    const result: ToolResultNode = block
    return {
      kind: 'tool',
      seq: result.seq,
      time: result.time,
      callId: result.callId,
      name: result.call?.name ?? result.callId,
      argsRaw: result.call?.argsRaw ?? '{}',
      isError: result.isError,
      error: result.error,
      callTime: result.callTime,
      subCalls: (result.subCalls ?? []).map(c => foldTool(c)),
      resultText: contentText(result.content),
    }
  }
  const running = block
  return {
    kind: 'tool',
    seq: running.time,
    time: running.time,
    callId: running.callId,
    name: running.name,
    argsRaw: running.argsRaw,
    isError: false,
    callTime: running.time,
    subCalls: (running.subCalls ?? []).map(c => foldTool(c)),
    resultText: '',
  }
}

function foldRetry(node: ModelRetryNode): RetryRow {
  return {
    kind: 'retry',
    seq: node.seq,
    time: node.time,
    attempt: node.retry,
    maxAttempts: node.mode === 'normal' ? node.maxRetries : null,
    state: node.retryState,
    delayMs: node.delayMs,
    failureMessage: node.failure.message,
  }
}

function foldCommand(node: CommandNode): CommandRow {
  return {
    kind: 'command',
    seq: node.seq,
    time: node.time,
    name: node.name,
    args: node.args,
    outcome: node.outcome ? { kind: node.outcome.kind, text: node.outcome.text } : null,
  }
}

function foldCompaction(node: CompactionSummaryNode): CompactionRow {
  return {
    kind: 'compaction',
    seq: node.seq,
    time: node.time,
    summary: node.summary,
    shadowedItemCount: node.shadowedItemCount,
    shadowedTokenCount: node.shadowedTokenCount,
  }
}
