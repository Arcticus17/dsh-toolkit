import { test } from 'node:test'
import assert from 'node:assert/strict'
import { foldNode, foldTool } from '../lib/exporter/fold.js'
import { defaultFoldOptions } from '../lib/exporter/model.js'
import type { FoldOptions } from '../lib/exporter/model.js'

// ---- fixtures（与 dsh-client-runtime 节点结构对齐） ----

const opts: FoldOptions = { ...defaultFoldOptions }

test('foldNode: user', () => {
  const node = { kind: 'user', seq: 1, time: 1000, content: [{ type: 'text', text: 'hi' }], source: null }
  const row = foldNode(node, opts)
  assert.equal(row?.kind, 'user')
  assert.equal(row?.seq, 1)
  assert.equal(row?.time, 1000)
  assert.deepEqual(row?.content, [{ type: 'text', text: 'hi' }])
})

test('foldNode: assistant 含 text/tool-call/reasoning', () => {
  const node = {
    kind: 'assistant', seq: 2, time: 2000, turn: 1, step: 1,
    blocks: [
      { kind: 'text', text: 'hello' },
      { kind: 'reasoning', text: 'think...' },
      { kind: 'tool-call', callId: 'c1', name: 'read', argsRaw: '{}' },
    ],
  }
  // 默认：reasoning 折叠省略
  const row = foldNode(node, opts)
  assert.equal(row?.kind, 'assistant')
  const blocks = row?.blocks
  assert.equal(blocks?.length, 2); // text + tool-call（reasoning 被过滤）
  assert.equal(blocks?.[0]?.kind, 'text')
  assert.equal(blocks?.[1]?.kind, 'tool-call')
})

test('foldNode: assistant includeReasoning=true 保留 reasoning', () => {
  const node = { kind: 'assistant', seq: 2, time: 2000, turn: 1, step: 1, blocks: [{ kind: 'reasoning', text: 'think...' }] }
  const row = foldNode(node, { ...opts, includeReasoning: true })
  assert.equal(row?.kind, 'assistant')
  assert.equal(row?.blocks.length, 1)
  assert.equal(row?.blocks[0]?.kind, 'reasoning')
})

test('foldNode: assistant 携带 timing/interrupted/requestConfig', () => {
  const node = {
    kind: 'assistant', seq: 2, time: 2000, turn: 1, step: 1,
    blocks: [{ kind: 'text', text: 'x' }],
    interrupted: true,
    requestConfig: { provider: 'deepseek', model: 'v4' },
    timing: { stepStartTime: 1900, firstTokenTime: 1950, completedTime: 2000 },
  }
  const row = foldNode(node, opts)
  assert.equal(row?.kind, 'assistant')
  assert.equal(row?.interrupted, true)
  assert.deepEqual(row?.requestConfig, { provider: 'deepseek', model: 'v4' })
  assert.deepEqual(row?.timing, { stepStartTime: 1900, firstTokenTime: 1950, completedTime: 2000 })
})

test('foldNode: steering', () => {
  const node = { kind: 'steering', seq: 3, time: 3000, content: [{ type: 'text', text: 'steer' }], source: null, messageId: 'm1' }
  const row = foldNode(node, opts)
  assert.equal(row?.kind, 'steering')
  assert.equal(row?.seq, 3)
})

test('foldNode: context（provenance.label → producer）', () => {
  const node = {
    kind: 'context', seq: 4, time: 4000,
    content: [{ type: 'text', text: 'ctx' }],
    provenance: { role: 'inject', label: 'workspace-instructions' },
    form: 'instructions',
    source: null,
  }
  const row = foldNode(node, opts)
  assert.equal(row?.kind, 'context')
  assert.deepEqual(row?.provenance, { role: 'inject', producer: 'workspace-instructions' })
  assert.equal(row?.form, 'instructions')
})

test('foldNode: tool-result 完整折叠（含 subCalls）', () => {
  const node = {
    kind: 'tool-result', seq: 5, time: 5000, callId: 'root',
    call: { name: 'bash', argsRaw: '{"cmd":"ls"}' },
    callTime: 4500,
    content: [{ type: 'text', text: 'result-ok' }],
    isError: false,
    subCalls: [
      { kind: 'tool-result', seq: 6, time: 4800, callId: 'child', call: { name: 'read', argsRaw: '{}' }, callTime: 4700, content: [{ type: 'text', text: 'child-ok' }], isError: false, subCalls: [] },
    ],
  }
  const row = foldNode(node, opts)
  assert.equal(row?.kind, 'tool')
  assert.equal(row?.name, 'bash')
  assert.equal(row?.resultText, 'result-ok')
  assert.equal(row?.isError, false)
  assert.equal(row?.callTime, 4500)
  const child = row?.subCalls[0]
  assert.equal(child?.name, 'read')
  assert.equal(child?.resultText, 'child-ok')
})

test('foldNode: includeToolCalls=false 时 tool/model-retry 返回 null', () => {
  const tool = { kind: 'tool-result', seq: 5, time: 5000, callId: 'c', call: null, callTime: null, content: [], isError: false, subCalls: [] }
  const retry = { kind: 'model-retry', seq: 6, time: 6000, retryState: 'scheduled', retry: 1, maxRetries: 3, delayMs: 100, failure: { message: 'x', code: 'y' }, mode: 'normal' }
  assert.equal(foldNode(tool, { ...opts, includeToolCalls: false }), null)
  assert.equal(foldNode(retry, { ...opts, includeToolCalls: false }), null)
  assert.notEqual(foldNode(tool, opts), null)
})

test('foldNode: tool-result call=null（窗口截断）回退 callId', () => {
  const node = { kind: 'tool-result', seq: 5, time: 5000, callId: 'c1', call: null, callTime: null, content: [], isError: true, error: { name: 'E', code: 'X' }, subCalls: [] }
  const row = foldNode(node, opts)
  assert.equal(row?.kind, 'tool')
  assert.equal(row?.name, 'c1'); // 回退到 callId
  assert.equal(row?.argsRaw, '{}'); // 回退默认
  assert.equal(row?.isError, true)
  assert.deepEqual(row?.error, { name: 'E', code: 'X' })
})

test('foldTool: RunningToolCall（未结算）', () => {
  const running = { callId: 'r1', name: 'fetch', argsRaw: '{}', turn: 1, step: 1, time: 7000, callView: null, subCalls: [] }
  const row = foldTool(running)
  assert.equal(row?.kind, 'tool')
  assert.equal(row?.name, 'fetch')
  assert.equal(row?.isError, false)
  assert.equal(row?.resultText, '')
})

test('foldNode: model-retry normal 携带 maxRetries', () => {
  const node = { kind: 'model-retry', seq: 6, time: 6000, retryState: 'started', retry: 2, maxRetries: 3, delayMs: 500, failure: { message: 'timeout', code: 'E1' }, mode: 'normal' }
  const row = foldNode(node, opts)
  assert.equal(row?.kind, 'retry')
  assert.equal(row?.attempt, 2)
  assert.equal(row?.maxAttempts, 3)
  assert.equal(row?.state, 'started')
  assert.equal(row?.delayMs, 500)
  assert.equal(row?.failureMessage, 'timeout')
})

test('foldNode: model-retry always 模式 maxAttempts=null', () => {
  const node = { kind: 'model-retry', seq: 6, time: 6000, retryState: 'cancelled', retry: 1, delayMs: 100, failure: { message: 'x', code: 'y' }, mode: 'always' }
  const row = foldNode(node, opts)
  assert.equal(row?.kind, 'retry')
  assert.equal(row?.maxAttempts, null); // always 无上限
})

test('foldNode: turn-error', () => {
  const node = { kind: 'turn-error', seq: 7, time: 7000, turn: 1, step: 1, message: 'boom', code: 'E9' }
  const row = foldNode(node, opts)
  assert.equal(row?.kind, 'turn-error')
  assert.equal(row?.message, 'boom')
  assert.equal(row?.code, 'E9')
})

test('foldNode: turn-max-tokens', () => {
  const node = { kind: 'turn-max-tokens', seq: 8, time: 8000, turn: 1, step: 1 }
  const row = foldNode(node, opts)
  assert.equal(row?.kind, 'max-tokens')
  assert.equal(row?.turn, 1)
})

test('foldNode: command（done 缺失 → outcome null）', () => {
  const node = { kind: 'command', seq: 9, time: 9000, commandId: 'cmd1', name: 'plan', args: '  fix bugs', outcome: null }
  const row = foldNode(node, opts)
  assert.equal(row?.kind, 'command')
  assert.equal(row?.name, 'plan')
  assert.equal(row?.args, '  fix bugs')
  assert.equal(row?.outcome, null)
})

test('foldNode: command 完成态携带 outcome', () => {
  const node = { kind: 'command', seq: 9, time: 9000, commandId: 'cmd1', name: 'plan', args: '', outcome: { kind: 'success', text: 'done' } }
  const row = foldNode(node, opts)
  assert.equal(row?.kind, 'command')
  assert.deepEqual(row?.outcome, { kind: 'success', text: 'done' })
})

test('foldNode: includeCommands=false 时 command 返回 null', () => {
  const node = { kind: 'command', seq: 9, time: 9000, commandId: 'c', name: 'x', args: '', outcome: null }
  assert.equal(foldNode(node, { ...opts, includeCommands: false }), null)
})

test('foldNode: compaction', () => {
  const node = { kind: 'compaction', seq: 10, time: 10000, summary: 'sum', summaryEventSeq: 9, shadowedItemCount: 5, shadowedTokenCount: 1000 }
  const row = foldNode(node, opts)
  assert.equal(row?.kind, 'compaction')
  assert.equal(row?.shadowedItemCount, 5)
  assert.equal(row?.shadowedTokenCount, 1000)
  assert.equal(row?.summary, 'sum')
})

test('foldNode: unknown 降级行', () => {
  const node = { kind: 'unknown', seq: 11, time: 11000, type: 'future-event', data: { x: 1 } }
  const row = foldNode(node, opts)
  assert.equal(row?.kind, 'unknown')
  assert.equal(row?.type, 'future-event')
  assert.deepEqual(row?.data, { x: 1 })
})
