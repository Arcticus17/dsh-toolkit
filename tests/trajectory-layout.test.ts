import { test } from 'node:test'
import assert from 'node:assert/strict'
import { layoutGraph } from '../lib/trajectory-map/layout.js'
import type { ToolGraph, GraphCall } from '../lib/trajectory-map/model.js'

function call(id: string, time: number, children: GraphCall[] = []): GraphCall {
  return { callId: id, name: id, argsRaw: '{}', status: 'settled', time, durationMs: 10, callTime: time - 10, resultPreview: '', parentId: null, children, retryCount: 0 }
}

function graph(roots: GraphCall[]): ToolGraph {
  const byId = new Map<string, GraphCall>()
  const visit = (c: GraphCall) => { byId.set(c.callId, c); c.children.forEach(visit) }
  roots.forEach(visit)
  return { roots, byId, retries: [], truncated: false }
}

test('layoutGraph: 空图返回零尺寸', () => {
  const layout = layoutGraph(graph([]))
  assert.equal(layout.width, 0)
  assert.equal(layout.height, 0)
  assert.equal(layout.positions.size, 0)
  assert.deepEqual(layout.layers, [])
})

test('layoutGraph: 单节点', () => {
  const layout = layoutGraph(graph([call('a', 1)]))
  assert.equal(layout.width, 220)
  assert.equal(layout.height, 64)
  assert.deepEqual(layout.layers, [['a']])
  const pos = layout.positions.get('a')!;
  assert.deepEqual(pos, { x: 0, y: 0 })
})

test('layoutGraph: 多层链', () => {
  const c = call('c', 3)
  const b = call('b', 2, [c])
  const a = call('a', 1, [b])
  const layout = layoutGraph(graph([a]))
  assert.deepEqual(layout.layers, [['a'], ['b'], ['c']])
  const pa = layout.positions.get('a')!;
  const pb = layout.positions.get('b')!;
  const pc = layout.positions.get('c')!;
  assert.equal(pa.y, 0)
  assert.equal(pb.y, 64 + 56) // nodeHeight + vGap
  assert.equal(pc.y, 2 * (64 + 56))
  // 单节点层水平居中：width = 3*220 + 2*32 = 724，居中起点 = (724-220)/2 = 252
  const centerX = (layout.width - 220) / 2
  assert.equal(pa.x, centerX)
  assert.equal(pb.x, centerX)
  assert.equal(pc.x, centerX)
  assert.equal(layout.height, 3 * 64 + 2 * 56)
  assert.equal(layout.width, 3 * 220 + 2 * 32)
})

test('layoutGraph: 宽树同层多节点', () => {
  const a = call('a', 1, [call('b1', 2), call('b2', 3)])
  const layout = layoutGraph(graph([a]))
  assert.deepEqual(layout.layers, [['a'], ['b1', 'b2']])
  const pa = layout.positions.get('a')!;
  const pb1 = layout.positions.get('b1')!;
  const pb2 = layout.positions.get('b2')!;
  // 第二层两个节点：行宽 220*2 + 32 = 472，居中起点 = (layout.width - 472)/2
  // layout.width = 2*220 + 32 = 472（两层）
  assert.equal(pa.y, 0)
  assert.equal(pb1.y, 120)
  assert.equal(pb2.y, 120)
  assert.equal(pb1.x, 0)
  assert.equal(pb2.x, 220 + 32)
})

test('layoutGraph: 同层节点按启动时间排序', () => {
  const a = call('a', 1, [call('late', 30), call('early', 10)])
  const layout = layoutGraph(graph([a]))
  assert.deepEqual(layout.layers[1], ['early', 'late'])
})

test('layoutGraph: 自定义尺寸选项', () => {
  const layout = layoutGraph(graph([call('a', 1)]), { nodeWidth: 300, nodeHeight: 80, vGap: 100 })
  assert.equal(layout.width, 300)
  assert.equal(layout.height, 80)
})
