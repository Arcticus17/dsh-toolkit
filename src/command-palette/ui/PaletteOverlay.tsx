import { useEffect, useMemo, useState } from 'react'
import { Palette } from './Palette.js'
import { paletteStore } from '../entry.js'
import { ActionMru } from '../mru.js'
import type { ActionRunContext, PaletteAction } from '../actions.js'

// 模块级 MRU 实例（跨渲染持久）
const mruInstance = new ActionMru()

/**
 * shell.overlay 挂载：监听 paletteStore 开关状态渲染 Palette。
 * 动作源：ctx.palette 注册表（经 entry 的 registry 传入）。
 */
export interface PaletteFace {
  list(): readonly PaletteAction[]
  subscribe(listener: () => void): () => void
}

export function PaletteOverlay(props: {
  readonly palette?: PaletteFace
  readonly runContext?: ActionRunContext
}): JSX.Element | null {
  const [open, setOpen] = useState(paletteStore.isOpen())
  const [actions, setActions] = useState<readonly PaletteAction[]>(() => props.palette?.list() ?? [])

  useEffect(() => {
    const unsub = paletteStore.subscribe(() => setOpen(paletteStore.isOpen()))
    return unsub
  }, [])

  useEffect(() => {
    if (!props.palette) return
    // 订阅动作注册表变更
    const unsub = props.palette.subscribe?.(() => setActions(props.palette!.list()))
    return unsub
  }, [props.palette])

  const runContext: ActionRunContext = useMemo(() => props.runContext ?? {
    sessionId: null,
    executeCommand: async () => { throw new Error('commands 未接线') },
    openSession: () => {},
  }, [props.runContext])

  return (
    <Palette
      actions={actions}
      open={open}
      onClose={() => paletteStore.close()}
      runContext={runContext}
      mru={mruInstance}
    />
  )
}
