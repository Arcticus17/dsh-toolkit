import type { ConversationSnapshot } from '@deepseek-ai/dsh-client-runtime/client'
import { buildExportedSession } from '../build.js'
import { markdownRenderer } from '../render/markdown.js'
import { htmlRenderer } from '../render/html.js'
import { jsonRenderer } from '../render/json.js'
import type { ExporterFormat } from '../model.js'

const RENDERERS = {
  markdown: markdownRenderer,
  html: htmlRenderer,
  json: jsonRenderer,
} as const

/** 构建一次导出（对象参数）。 */
export function buildExport(args: {
  sessionId: string
  title: string
  cwd: string
  snapshot: ConversationSnapshot
  includeToolCalls?: boolean
}) {
  return buildExportedSession({
    sessionId: args.sessionId,
    title: args.title,
    cwd: args.cwd,
    snapshot: args.snapshot,
    opts: { includeToolCalls: args.includeToolCalls ?? true },
  })
}

/** 渲染指定格式。 */
export function renderExport(session: ReturnType<typeof buildExportedSession>, format: ExporterFormat): string {
  const renderer = RENDERERS[format]
  return renderer.render(session)
}

/** 触发浏览器下载。 */
export function downloadExport(text: string, filename: string, mime: string): void {
  const blob = new Blob([text], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

/** 复制到剪贴板。 */
export async function copyExport(text: string): Promise<void> {
  await navigator.clipboard.writeText(text)
}
