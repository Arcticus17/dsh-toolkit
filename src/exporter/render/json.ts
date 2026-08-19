import type { ExportedSession } from '../model.js'
import type { ExporterRenderer } from './types.js'

/** 递归净化 unknown 值：BigInt/函数/循环引用 → 可序列化形式。 */
export function safeJson(value: unknown, depth = 0): unknown {
  if (depth > 32) return '[depth-limit]'
  if (value === null || value === undefined) return value
  const t = typeof value
  if (t === 'number' || t === 'boolean') return value
  if (t === 'string') return value
  if (t === 'bigint') return String(value)
  if (t === 'function' || t === 'symbol') return String(value)
  if (Array.isArray(value)) return value.map(v => safeJson(v, depth + 1))
  if (t === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = safeJson(v, depth + 1)
    }
    return out
  }
  return String(value)
}

/** JSON 渲染器：直接序列化中间模型（formatVersion 保证向后兼容）。 */
export const jsonRenderer: ExporterRenderer = {
  id: 'json',
  label: 'JSON',
  mime: 'application/json',
  extension: '.json',
  render(session: ExportedSession): string {
    return JSON.stringify(safeJson(session), null, 2)
  },
}
