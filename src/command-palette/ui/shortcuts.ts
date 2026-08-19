export interface ShortcutSpec {
  readonly ctrl: boolean
  readonly meta: boolean
  readonly key: string
}

/** 解析 'mod+k' → { ctrl/meta, key }；'mod' 按平台解析（mac → meta，其余 → ctrl）。 */
export function parseShortcut(combo: string): ShortcutSpec {
  const parts = combo.toLowerCase().split('+').filter(Boolean)
  const isMac = typeof navigator !== 'undefined' && /mac/i.test(navigator.platform)
  let ctrl = false
  let meta = false
  let key = ''
  for (const p of parts) {
    if (p === 'mod') {
      if (isMac) meta = true
      else ctrl = true
    } else if (p === 'ctrl') ctrl = true
    else if (p === 'cmd' || p === 'meta') meta = true
    else if (p === 'alt' || p === 'shift' || p === 'option') { /* 修饰键暂不支持组合 */ }
    else key = p
  }
  if (!key) throw new Error('Invalid shortcut (no key): ' + combo)
  return { ctrl, meta, key }
}

/**
 * 注册全局快捷键。
 * - 注册前检测 window 上是否已有同组合键监听（冲突检测）：有则跳过（返回 no-op disposer）；
 * - 忽略输入框/文本域内的触发。
 */
export function registerShortcut(
  combo: string,
  onTrigger: () => void,
  opts?: { ignoreWhenTyping?: boolean },
): () => void {
  const ignoreWhenTyping = opts?.ignoreWhenTyping ?? true
  let spec: ShortcutSpec
  try {
    spec = parseShortcut(combo)
  } catch {
    return () => {}
  }

  // 冲突检测：combo 已在全局注册表中
  if (GLOBAL_SHORTCUTS.has(combo)) {
    console.warn('[dsh-toolkit] shortcut conflict, skipped:', combo)
    return () => {}
  }
  GLOBAL_SHORTCUTS.add(combo)

  const handler = (e: KeyboardEvent) => {
    if (ignoreWhenTyping && isTypingTarget(e.target)) return
    const modOk = spec.ctrl === e.ctrlKey && spec.meta === e.metaKey
    if (!modOk) return
    if (e.key.toLowerCase() !== spec.key) return
    e.preventDefault()
    onTrigger()
  }
  window.addEventListener('keydown', handler)
  return () => {
    window.removeEventListener('keydown', handler)
    GLOBAL_SHORTCUTS.delete(combo)
  }
}

const GLOBAL_SHORTCUTS = new Set<string>()

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  const tag = target.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || target.isContentEditable
}
