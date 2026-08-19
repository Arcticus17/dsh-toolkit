import { useMemo } from 'react'
import type { ToolCallBlock } from '@deepseek-ai/dsh-client-runtime/client'
import { layoutGraph } from '../layout.js'
import type { GraphCall, GraphLayout, ToolGraph } from '../model.js'

export interface FlowGraphProps {
  readonly graph: ToolGraph
  readonly selectedId: string | null
  readonly onSelect: (callId: string | null) => void
  readonly showRetries: boolean
  /** 打开工具详情壳层。 */
  readonly openDetails: (block: ToolCallBlock) => void
}

/** 状态色映射。 */
const STATUS_COLOR: Record<GraphCall['status'], string> = {
  running: '#4078c0',
  settled: '#2da44e',
  error: '#cf222e',
};

const NODE_W = 220
const NODE_H = 64

/** 计算一条父子边的贝塞尔路径。 */
function edgePath(x1: number, y1: number, x2: number, y2: number): string {
  const midY = (y1 + y2) / 2
  return 'M' + x1 + ' ' + y1 + ' C ' + x1 + ' ' + midY + ', ' + x2 + ' ' + midY + ', ' + x2 + ' ' + y2
}

/**
 * SVG 流程图：节点卡片 + 贝塞尔边 + 缩放/平移（v0.1 骨架）。
 * 完整交互（缩放/平移/适应窗口）由 useViewport 接入（见 use-viewport.ts）。
 */
export function FlowGraph(props: FlowGraphProps): JSX.Element {
  const { graph, selectedId, onSelect, showRetries, openDetails } = props
  const layout: GraphLayout = useMemo(() => layoutGraph(graph), [graph])

  // 收集边（父 → 子）
  const edges = useMemo(() => {
    const out: { from: GraphCall; to: GraphCall }[] = []
    const visit = (call: GraphCall) => {
      for (const child of call.children) {
        out.push({ from: call, to: child })
        visit(child)
      }
    };
    for (const root of graph.roots) visit(root)
    return out
  }, [graph])

  if (graph.roots.length === 0) {
    return <div className='dsh-toolkit-flow-empty'>本窗口内没有工具调用</div>
  }

  return (
    <svg
      className='dsh-toolkit-flow'
      width={layout.width}
      height={layout.height}
      role='img'
      aria-label='工具调用流程图'
      onClick={() => onSelect(null)}
    >
      {/* 边 */}
      {edges.map(({ from, to }) => {
        const a = layout.positions.get(from.callId)
        const b = layout.positions.get(to.callId)
        if (!a || !b) return null
        return (
          <path
            key={'edge-' + from.callId + '-' + to.callId}
            d={edgePath(a.x + NODE_W, a.y + NODE_H / 2, b.x, b.y + NODE_H / 2)}
            fill='none'
            stroke='#d0d7de'
            strokeWidth={1.5}
          />
        );
      })}
      {/* 节点 */}
      {graph.roots.map(root => (
        <NodeItem
          key={root.callId}
          call={root}
          layout={layout}
          selectedId={selectedId}
          showRetries={showRetries}
          onSelect={onSelect}
        />
      ))}
    </svg>
  );
}

function NodeItem(props: {
  call: GraphCall
  layout: GraphLayout
  selectedId: string | null
  showRetries: boolean
  onSelect: (callId: string | null) => void
}): JSX.Element {
  const { call, layout, selectedId, showRetries, onSelect } = props
  const selected = selectedId === call.callId
  const pos = layout.positions.get(call.callId)
  if (!pos) return <g />

  const color = STATUS_COLOR[call.status]
  return (
    <g
      transform={'translate(' + pos.x + ',' + pos.y + ')'}
      onClick={e => {
        e.stopPropagation()
        onSelect(call.callId)
      }}
      className={'dsh-toolkit-flow-node' + (selected ? ' selected' : '')}
    >
      <rect width={NODE_W} height={NODE_H} rx={8} fill='var(--dsw-alias-surface-bg, #fff)'
        stroke={color} strokeWidth={selected ? 2 : 1} />
      <text x={12} y={22} fontSize={13} fontWeight={600} fill={color}>{call.name}</text>
      {call.durationMs !== null && (
        <text x={12} y={42} fontSize={11} fill='var(--dsw-alias-text-muted, #6e7781)'>
          {call.durationMs}ms
        </text>
      )}
      {showRetries && call.retryCount > 0 && (
        <text x={NODE_W - 12} y={22} fontSize={11} textAnchor='end' fill='#bf8700'>
          ×{call.retryCount}
        </text>
      )}
      {call.status === 'error' && (
        <text x={12} y={56} fontSize={10} fill={color}>{call.error?.code ?? '失败'}</text>
      )}
      {/* 递归渲染子节点（同层放置由 layout 保证，这里仅透传） */}
      {call.children.map(child => (
        <NodeItem
          key={child.callId}
          call={child}
          layout={layout}
          selectedId={selectedId}
          showRetries={showRetries}
          onSelect={onSelect}
        />
      ))}
    </g>
  );
}
