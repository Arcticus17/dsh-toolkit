import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildToolGraph, foldCall, collectRetries } from '../lib/trajectory-map/build.js'
import { callDuration, isSettled } from '../lib/trajectory-map/model.js'

function makeSnapshot(nodes: unknown[], hasMore = false) {
  return { sessionId: 's1', hasMore, nodes, chat: { legacy: { nodes: [] } } }
}

test('buildToolGraph: 多根树', () => {
  const snapshot = makeSnapshot([
    { kind: 'tool-result', seq: 1, time: 1000, callId: 'a', call: { name: 'tool_a', argsRaw: '{}' }, callTime: 900, content: [{ type: 'text', text: 'r1' }], isError: false, subCalls: [] },
    { kind: 'tool-result', seq: 2, time: 2000, callId: 'b', call: { name: 'tool_b', argsRaw: '{}' }, callTime: 1900, content: [], isError: false, subCalls: [] },
  ])
  const graph = buildToolGraph(snapshot as never)
  assert.equal(graph.roots.length, 2)
  assert.equal(graph.roots[0]?.name, 'tool_a')
  assert.equal(graph.roots[1]?.name, 'tool_b')
  assert.equal(graph.byId.size, 2)
  assert.equal(graph.truncated, false)
})

test('buildToolGraph: 深树 subCalls 递归', () => {
  const snapshot = makeSnapshot([
    {
      kind: 'tool-result', seq: 1, time: 1000, callId: 'root',
      call: { name: 'bash', argsRaw: '{}' }, callTime: 900,
      content: [], isError: false,
      subCalls: [
        {
          kind: 'tool-result', seq: 2, time: 1200, callId: 'child1',
          call: { name: 'read', argsRaw: '{}' }, callTime: 1100,
          content: [], isError: false,
          subCalls: [
            { kind: 'tool-result', seq: 3, time: 1300, callId: 'grandchild', call: { name: 'grep', argsRaw: '{}' }, callTime: 1250, content: [], isError: false, subCalls: [] },
          ],
        },
      ],
    },
  ])
  const graph = buildToolGraph(snapshot as never)
  assert.equal(graph.roots.length, 1)
  const root = graph.roots[0]!;
  assert.equal(root.name, 'bash')
  assert.equal(root.parentId, null)
  assert.equal(root.children.length, 1)
  const child = root.children[0]!;
  assert.equal(child.name, 'read')
  assert.equal(child.parentId, 'root')
  assert.equal(child.children[0]?.name, 'grep')
  assert.equal(child.children[0]?.parentId, 'child1')
  // byId 索引包含全部
  assert.equal(graph.byId.has('root'), true)
  assert.equal(graph.byId.has('grandchild'), true)
})

test('buildToolGraph: 未结算 RunningToolCall → status running', () => {
  const snapshot = makeSnapshot([
    { kind: 'tool-result', seq: 1, time: 1000, callId: 'settled', call: { name: 'ok', argsRaw: '{}' }, callTime: 900, content: [], isError: false, subCalls: [] },
  ])
  const running = foldCall({ callId: 'r', name: 'fetch', argsRaw: '{}', turn: 1, step: 1, time: 2000, callView: null, subCalls: [] }, null)
  assert.equal(running.status, 'running')
  assert.equal(running.durationMs, null)
  assert.equal(running.resultPreview, '')
  assert.equal(running.parentId, null)
  const settled = graphRoot(snapshot)
  assert.equal(settled.status, 'settled')
})

test('buildToolGraph: 错误调用 status=error 携带错误', () => {
  const snapshot = makeSnapshot([
    { kind: 'tool-result', seq: 1, time: 1000, callId: 'e', call: { name: 'fail', argsRaw: '{}' }, callTime: 900, content: [], isError: true, error: { name: 'Err', code: 'X1' }, subCalls: [] },
  ])
  const call = graphRoot(snapshot)
  assert.equal(call.status, 'error')
  assert.deepEqual(call.error, { name: 'Err', code: 'X1' })
})

test('buildToolGraph: call=null 窗口截断回退 callId', () => {
  const snapshot = makeSnapshot([
    { kind: 'tool-result', seq: 1, time: 1000, callId: 'truncated-call', call: null, callTime: null, content: [{ type: 'text', text: 'x'.repeat(600) }], isError: false, subCalls: [] },
  ])
  const call = graphRoot(snapshot)
  assert.equal(call.name, 'truncated-call')
  assert.equal(call.argsRaw, '{}')
  assert.equal(call.resultPreview.length, 500) // 截断到 500
  assert.equal(call.durationMs, null)
})

test('buildToolGraph: 空图', () => {
  const graph = buildToolGraph(makeSnapshot([]) as never)
  assert.equal(graph.roots.length, 0)
  assert.equal(graph.byId.size, 0)
  assert.equal(graph.retries.length, 0)
})

test('buildToolGraph: truncated 镜像 hasMore', () => {
  const graph = buildToolGraph(makeSnapshot([], true) as never)
  assert.equal(graph.truncated, true)
})

test('collectRetries: normal 与 always 模式', () => {
  const nodes = [
    { kind: 'model-retry', seq: 1, time: 1000, retryState: 'scheduled', retry: 1, maxRetries: 3, delayMs: 100, failure: { message: 'a', code: 'X' }, mode: 'normal' },
    { kind: 'model-retry', seq: 2, time: 2000, retryState: 'started', retry: 2, delayMs: 200, failure: { message: 'b', code: 'Y' }, mode: 'always' },
    { kind: 'user', seq: 3, time: 3000, content: [] },
  ]
  const retries = collectRetries(nodes as never)
  assert.equal(retries.length, 2)
  assert.equal(retries[0]?.attempt, 1)
  assert.equal(retries[0]?.maxAttempts, 3)
  assert.equal(retries[0]?.state, 'scheduled')
  assert.equal(retries[1]?.attempt, 2)
  assert.equal(retries[1]?.maxAttempts, null) // always 无上限
  assert.equal(retries[1]?.failureMessage, 'b')
})

test('callDuration: 正常与缺失 callTime', () => {
  const settled = { kind: 'tool-result', seq: 1, time: 1000, callId: 'c', call: null, callTime: 700, content: [], isError: false, subCalls: [] }
  assert.equal(callDuration(settled), 300)
  const noCallTime = { ...settled, callTime: null }
  assert.equal(callDuration(noCallTime), null)
})

test('isSettled: 判别 ToolCallBlock', () => {
  const settled = { kind: 'tool-result', seq: 1, time: 1, callId: 'c', call: null, callTime: null, content: [], isError: false, subCalls: [] }
  const running = { callId: 'r', name: 'x', argsRaw: '{}', turn: 1, step: 1, time: 1, callView: null, subCalls: [] }
  assert.equal(isSettled(settled), true)
  assert.equal(isSettled(running), false)
})

function graphRoot(snapshot: unknown) {
  const graph = buildToolGraph(snapshot as never)
  return graph.roots[0]!;
}
