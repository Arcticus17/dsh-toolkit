import type { GraphCall, GraphLayout, LayoutOptions, ToolGraph } from './model.js'

const DEFAULTS = { nodeWidth: 220, nodeHeight: 64, hGap: 32, vGap: 56 } as const

/**
 * 计算 DAG 分层布局（自顶向下）。
 * 算法：从根开始 BFS 分层（按树深）；同层内按启动时间排序。
 */
export function layoutGraph(graph: ToolGraph, opts?: LayoutOptions): GraphLayout {
  const { nodeWidth, nodeHeight, hGap, vGap } = { ...DEFAULTS, ...opts }

  // BFS 分层
  const layerOf = new Map<string, number>()
  const queue: { call: GraphCall; depth: number }[] = graph.roots.map(call => ({ call, depth: 0 }))
  for (const item of queue) layerOf.set(item.call.callId, item.depth)
  for (let i = 0; i < queue.length; i++) {
    const { call, depth } = queue[i]!
    for (const child of call.children) {
      if (!layerOf.has(child.callId)) {
        layerOf.set(child.callId, depth + 1)
        queue.push({ call: child, depth: depth + 1 })
      }
    }
  }

  // 按层分组
  const layersMap = new Map<number, GraphCall[]>()
  for (const { call, depth } of queue) {
    const list = layersMap.get(depth) ?? []
    list.push(call)
    layersMap.set(depth, list)
  }
  const maxDepth = layersMap.size > 0 ? Math.max(...layersMap.keys()) : -1
  const layers: string[][] = []
  for (let d = 0; d <= maxDepth; d++) {
    const list = (layersMap.get(d) ?? []).slice().sort((a, b) => a.time - b.time)
    layers.push(list.map(c => c.callId))
  }

  // 计算位置：每层节点居中分配
  const positions = new Map<string, { x: number; y: number }>()
  const width = maxDepth >= 0 ? (maxDepth + 1) * nodeWidth + maxDepth * hGap : 0
  let height = 0
  for (let d = 0; d < layers.length; d++) {
    const ids = layers[d]!
    const count = ids.length
    const rowWidth = count * nodeWidth + (count - 1) * hGap
    const startX = Math.max(0, (width - rowWidth) / 2)
    for (let i = 0; i < count; i++) {
      positions.set(ids[i]!, { x: startX + i * (nodeWidth + hGap), y: d * (nodeHeight + vGap) })
    }
    height = (d + 1) * nodeHeight + d * vGap
  }

  return { width, height, positions, layers }
}
