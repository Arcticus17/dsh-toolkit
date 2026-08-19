import type { BackgroundRuntime } from './background.js'

/**
 * 将 ResolvedBackground 应用到滚动容器元素（渲染层）。
 * 订阅运行时；快照变化时 setProperty 更新 CSS 变量。
 * 容器不存在时跳过；返回 disposer。
 */
export function applyBackground(
  runtime: BackgroundRuntime,
  scrollContainer: () => HTMLElement | null,
): () => void {
  const applyOnce = () => {
    const el = scrollContainer()
    if (!el) return
    const snap = runtime.getSnapshot()
    const css = snap.resolved.css
    el.style.setProperty('--dsh-chat-bg-image', css.backgroundImage)
    el.style.setProperty('--dsh-chat-bg-color', css.backgroundColor)
    el.style.setProperty('--dsh-chat-bg-blur', css.blur)
    el.style.setProperty('--dsh-chat-bg-overlay', css.overlay)
  }

  applyOnce()
  const disposer = runtime.subscribe(() => applyOnce())
  return disposer
}
