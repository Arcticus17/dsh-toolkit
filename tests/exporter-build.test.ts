import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildExportedSession } from '../lib/exporter/build.js'
import { orderedNodes } from '../lib/shared/fold.js'

// 构造一个最小 ConversationSnapshot（按真实结构）
function makeSnapshot(nodes: unknown[], opts?: { hasMore?: boolean; legacy?: unknown[] }) {
  return {
    sessionId: 's1',
    hasMore: opts?.hasMore ?? false,
    nodes,
    chat: { legacy: { nodes: opts?.legacy ?? [] } },
  }
}

test('buildExportedSession: 基本构建', () => {
  const snapshot = makeSnapshot([
    { kind: 'user', seq: 1, time: 1000, content: [{ type: 'text', text: 'hi' }] },
    { kind: 'assistant', seq: 2, time: 2000, turn: 1, step: 1, blocks: [{ kind: 'text', text: 'yo' }] },
  ])
  const session = buildExportedSession({
    sessionId: 's1',
    title: 'T',
    cwd: 'C:/w',
    snapshot: snapshot as never,
    stats: { turns: 1, steps: 1 },
  })
  assert.equal(session.formatVersion, 1)
  assert.equal(session.sessionId, 's1')
  assert.equal(session.title, 'T')
  assert.equal(session.cwd, 'C:/w')
  assert.equal(session.truncated, false)
  assert.equal(session.rows.length, 2)
  assert.deepEqual(session.stats, { turns: 1, steps: 1 })
  assert.equal(typeof session.exportedAt, 'number')
})

test('buildExportedSession: truncated 镜像 hasMore', () => {
  const snapshot = makeSnapshot([], { hasMore: true })
  const session = buildExportedSession({ sessionId: 's', title: 'T', cwd: 'C', snapshot: snapshot as never })
  assert.equal(session.truncated, true)
})

test('buildExportedSession: stats 缺省省略', () => {
  const snapshot = makeSnapshot([])
  const session = buildExportedSession({ sessionId: 's', title: 'T', cwd: 'C', snapshot: snapshot as never })
  assert.equal(session.stats, undefined)
})

test('buildExportedSession: opts 合并覆盖默认', () => {
  const snapshot = makeSnapshot([
    { kind: 'tool-result', seq: 3, time: 3000, callId: 'c', call: { name: 'x', argsRaw: '{}' }, callTime: 2500, content: [], isError: false, subCalls: [] },
  ])
  const withTools = buildExportedSession({ sessionId: 's', title: 'T', cwd: 'C', snapshot: snapshot as never })
  assert.equal(withTools.rows.length, 1)
  const withoutTools = buildExportedSession({
    sessionId: 's', title: 'T', cwd: 'C', snapshot: snapshot as never,
    opts: { includeToolCalls: false },
  })
  assert.equal(withoutTools.rows.length, 0)
})

test('orderedNodes: 优先 chat.legacy.nodes', () => {
  const snapshot = makeSnapshot([{ kind: 'user', seq: 1, time: 1, content: [] }], {
    legacy: [{ kind: 'user', seq: 2, time: 2, content: [] }],
  })
  const nodes = orderedNodes(snapshot as never)
  assert.equal(nodes.length, 1)
  assert.equal(nodes[0]?.seq, 2)
})

test('orderedNodes: legacy 为空时回退顶层 nodes', () => {
  const snapshot = makeSnapshot([{ kind: 'user', seq: 1, time: 1, content: [] }])
  const nodes = orderedNodes(snapshot as never)
  assert.equal(nodes.length, 1)
  assert.equal(nodes[0]?.seq, 1)
})

test('orderedNodes: 两者都空返回空数组', () => {
  const snapshot = makeSnapshot([])
  const nodes = orderedNodes(snapshot as never)
  assert.deepEqual(nodes, [])
})
