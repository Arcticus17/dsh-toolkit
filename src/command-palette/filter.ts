import type { PaletteAction } from './actions.js'

/** 过滤 + 排序：子序列匹配（label 或 keywords），按匹配度排序。 */
export function filterActions(
  actions: readonly PaletteAction[],
  query: string,
  opts?: { limit?: number },
): readonly PaletteAction[] {
  const limit = opts?.limit ?? 20
  const q = query.trim()
  if (!q) return actions.slice(0, limit)
  const scored = actions
    .map(a => ({ action: a, score: scoreAction(a, q) }))
    .filter(x => x.score > 0)
    .sort((a, b) => b.score - a.score || a.action.label.localeCompare(b.action.label))
  return scored.slice(0, limit).map(x => x.action)
}

/** 子序列匹配（区分大小写）。 */
export function subsequenceMatch(text: string, query: string): boolean {
  if (!query) return true
  let i = 0
  for (const ch of text) {
    if (ch === query[i]) i++
    if (i === query.length) return true
  }
  return i === query.length
}

/** 匹配度打分：完整前缀 > 前缀 > 子序列；命中 label 加权 > keywords。 */
export function scoreAction(action: PaletteAction, query: string): number {
  const label = action.label.toLowerCase()
  const q = query.toLowerCase()
  if (label === q) return 100
  if (label.startsWith(q)) return 80
  if (subsequenceMatch(label, q)) return 60
  const kw = (action.keywords ?? []).some(k => subsequenceMatch(k.toLowerCase(), q))
  if (kw) return 40
  return 0
}
