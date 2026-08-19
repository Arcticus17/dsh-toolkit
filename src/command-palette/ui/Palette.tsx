import { useEffect, useMemo, useRef, useState } from 'react'
import type { PaletteAction, ActionRunContext } from '../actions.js'
import { filterActions } from '../filter.js'
import type { ActionMru } from '../mru.js'

export interface PaletteProps {
  readonly actions: readonly PaletteAction[]
  readonly open: boolean
  readonly onClose: () => void
  readonly runContext: ActionRunContext
  readonly mru: ActionMru
}

type PaletteState =
  | { phase: 'closed' }
  | { phase: 'open'; query: string; selectedIndex: number; running: boolean }

/**
 * 命令面板 overlay（v0.1 骨架）。
 * 键盘：↑/↓ 选择 · Enter 执行 · Esc 关闭；输入实时过滤（50ms 防抖）。
 */
export function Palette(props: PaletteProps): JSX.Element | null {
  const { actions, open, onClose, runContext, mru } = props
  const [state, setState] = useState<PaletteState>({ phase: 'closed' })
  const inputRef = useRef<HTMLInputElement>(null)
  const queryRef = useRef('')

  useEffect(() => {
    if (open) {
      queryRef.current = ''
      setState({ phase: 'open', query: '', selectedIndex: 0, running: false })
      inputRef.current?.focus()
    } else {
      setState({ phase: 'closed' })
    }
  }, [open])

  const filtered = useMemo(() => {
    if (state.phase !== 'open') return []
    const list = filterActions(actions, state.query, { limit: 20 })
    // MRU 排序（空 query 时）
    if (!state.query.trim()) {
      return [...list].sort((a, b) => mru.weight(a.id) - mru.weight(b.id))
    }
    return list
  }, [actions, state, mru])

  if (state.phase !== 'open') return null

  const execute = async (action: PaletteAction) => {
    if (state.phase !== 'open' || state.running) return
    setState({ ...state, running: true })
    mru.record(action.id)
    try {
      await action.run(runContext)
      onClose()
    } catch (err) {
      // 动作失败：保持面板打开（便于换动作），避免 unhandled rejection
      console.error('[dsh-toolkit] palette action failed:', action.id, err)
    } finally {
      setState(s => (s.phase === 'open' ? { ...s, running: false } : s))
    }
  }

  return (
    <div className='dsh-toolkit-palette-backdrop' onClick={onClose}>
      <div
        className='dsh-toolkit-palette'
        role='dialog'
        aria-modal='true'
        aria-label='命令面板'
        onClick={e => e.stopPropagation()}
        onKeyDown={e => {
          if (e.key === 'Escape') onClose()
          else if (e.key === 'ArrowDown') {
            e.preventDefault()
            setState(s => (s.phase === 'open' ? { ...s, selectedIndex: Math.min(filtered.length - 1, s.selectedIndex + 1) } : s))
          }
          else if (e.key === 'ArrowUp') {
            e.preventDefault()
            setState(s => (s.phase === 'open' ? { ...s, selectedIndex: Math.max(0, s.selectedIndex - 1) } : s))
          }
          else if (e.key === 'Enter' && filtered[state.selectedIndex]) {
            e.preventDefault()
            void execute(filtered[state.selectedIndex]!)
          }
        }}
      >
        <input
          ref={inputRef}
          value={state.query}
          placeholder='输入命令或会话名称…'
          onChange={e => {
            const q = e.target.value
            queryRef.current = q
            setState({ ...state, query: q, selectedIndex: 0 })
          }}
        />
        <ul className='dsh-toolkit-palette-list'>
          {filtered.map((action, i) => (
            <li key={action.id} className={i === state.selectedIndex ? 'selected' : ''}>
              <button
                type='button'
                onClick={() => void execute(action)}
                onMouseEnter={() => setState({ ...state, selectedIndex: i })}
              >
                <span className='dsh-toolkit-palette-label'>{action.label}</span>
                <span className='dsh-toolkit-palette-group'>{action.group}</span>
              </button>
            </li>
          ))}
          {filtered.length === 0 && <li className='empty'>无匹配动作</li>}
        </ul>
      </div>
    </div>
  )
}
