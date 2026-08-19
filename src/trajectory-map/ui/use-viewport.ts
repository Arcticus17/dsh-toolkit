import { useCallback, useState } from 'react'

/** 视图视口状态：缩放比例 + 平移偏移。 */
export interface Viewport {
  readonly scale: number   // 0.25 ~ 3
  readonly dx: number
  readonly dy: number
}

const MIN_SCALE = 0.25
const MAX_SCALE = 3
const ZOOM_STEP = 1.2

/** 缩放/平移/适应窗口的视口状态管理（v0.1 骨架）。 */
export function useViewport(initial?: Viewport): {
  viewport: Viewport
  zoomIn: () => void
  zoomOut: () => void
  reset: () => void
  fit: (bounds: { width: number; height: number }) => void
  setPan: (dx: number, dy: number) => void
} {
  const [viewport, setViewport] = useState<Viewport>(initial ?? { scale: 1, dx: 0, dy: 0 })

  const clamp = (s: number) => Math.min(MAX_SCALE, Math.max(MIN_SCALE, s))

  const zoomIn = useCallback(() => {
    setViewport(v => ({ ...v, scale: clamp(v.scale * ZOOM_STEP) }))
  }, [])

  const zoomOut = useCallback(() => {
    setViewport(v => ({ ...v, scale: clamp(v.scale / ZOOM_STEP) }))
  }, [])

  const reset = useCallback(() => {
    setViewport({ scale: 1, dx: 0, dy: 0 })
  }, [])

  const fit = useCallback((bounds: { width: number; height: number }) => {
    // v0.1：仅支持以 scale 适配宽度（容器尺寸由调用方提供）
    const containerW = typeof window !== 'undefined' ? window.innerWidth : 1200
    const scale = clamp((containerW - 80) / Math.max(1, bounds.width))
    setViewport(v => ({ ...v, scale }))
  }, [])

  const setPan = useCallback((dx: number, dy: number) => {
    setViewport(v => ({ ...v, dx, dy }))
  }, [])

  return { viewport, zoomIn, zoomOut, reset, fit, setPan }
}
