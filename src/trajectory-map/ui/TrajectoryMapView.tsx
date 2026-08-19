import { useMemo, useState } from 'react'
import type { ConversationSnapshot } from '@deepseek-ai/dsh-client-runtime/client'
import { buildToolGraph } from '../build.js'
import { FlowGraph } from './FlowGraph.js'
import { useViewport } from './use-viewport.js'

/**
 * 流程图视图（conversation.view 标签页，形态 A）。
 * 组件收到框架标准套件（ui-trajectory 同款）：
 * sessionId + useSession(selector) + 注入面 loadOlder。
 */
export function TrajectoryMapView(props: {
  readonly sessionId: string
  readonly useSession: <T>(selector: (s: ConversationSnapshot) => T) => T
  readonly loadOlder: () => Promise<boolean>
}): JSX.Element {
  const { useSession, loadOlder } = props
  const snapshot = useSession((s) => s)
  const graph = useMemo(() => buildToolGraph(snapshot), [snapshot])
  const { viewport, zoomIn, zoomOut, reset, fit } = useViewport()
  const [selectedId, setSelectedId] = useState<string | null>(null)

  return (
    <div className='dsh-toolkit-trajectory-view'>
      <div className='dsh-toolkit-flow-toolbar'>
        <button type='button' onClick={zoomIn}>+</button>
        <button type='button' onClick={zoomOut}>−</button>
        <button type='button' onClick={reset}>重置</button>
        <button type='button' onClick={() => fit({ width: 800, height: 400 })}>适应</button>
        <span className='dsh-toolkit-flow-scale'>{Math.round(viewport.scale * 100)}%</span>
      </div>
      <div
        className='dsh-toolkit-flow-scroll'
        onScroll={e => {
          const el = e.currentTarget
          if (el.scrollTop + el.clientHeight >= el.scrollHeight - 40) {
            loadOlder().catch(() => {})
          }
        }}
      >
        <div
          style={{
            transform: 'scale(' + viewport.scale + ') translate(' + viewport.dx + 'px,' + viewport.dy + 'px)',
            transformOrigin: 'top left',
          }}
        >
          <FlowGraph
            graph={graph}
            selectedId={selectedId}
            onSelect={setSelectedId}
            showRetries={true}
            openDetails={() => {}}
          />
        </div>
      </div>
    </div>
  )
}
