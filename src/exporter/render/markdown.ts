import type { ExportedRow, ExportedSession, ToolRow } from '../model.js'
import type { ExporterRenderer } from './types.js'

export interface MdOptions {
  /** 工具结果文本截断长度。默认 200。 */
  maxResultChars?: number
  /** 换行符。默认 '\n'。 */
  newline?: '\n' | '\r\n'
}

/** 将一行折叠为 Markdown 片段。 */
function renderRow(row: ExportedRow, opts: MdOptions): string {
  const nl = opts.newline ?? '\n'
  const max = opts.maxResultChars ?? 200
  switch (row.kind) {
    case 'user':
      return '### User' + nl + '> ' + textOf(row.content) + nl
    case 'steering':
      return '### Steering' + nl + '> ' + textOf(row.content) + nl
    case 'assistant': {
      const parts: string[] = []
      const body = row.blocks.filter(b => b.kind === 'text').map(b => (b as { text: string }).text).join('\n')
      if (body) parts.push('```text' + nl + body + nl + '```')
      for (const b of row.blocks) {
        if (b.kind === 'reasoning') {
          const text = (b as { text: string }).text
          if (text) parts.push('> 💭 思考过程：' + nl + '> ' + text.split('\n').join(nl + '> '))
        } else if (b.kind === 'image') {
          parts.push('[图片]')
        }
      }
      const toolLines = row.blocks.filter(b => b.kind === 'tool-call')
        .map(b => '[工具调用] ' + (b as { name: string }).name)
        .join(nl)
      if (toolLines) parts.push(toolLines)
      return '### Assistant' + nl + parts.join(nl) + nl
    }
    case 'tool': return renderTool(row, max, nl)
    case 'retry':
      return '[重试 ' + String(row.attempt) + '/' + String(row.maxAttempts ?? '∞') + '] ' + row.state + nl
    case 'turn-error':
      return '> ⚠ ' + row.message + (row.code ? ' (' + row.code + ')' : '') + nl
    case 'max-tokens':
      return '> ⚠ 回答在输出 token 上限处停止，发送「继续」可接着输出。' + nl
    case 'compaction': {
      const n = row.shadowedItemCount
      const t = row.shadowedTokenCount
      const meta = n !== null || t !== null ? '（替换 ' + String(n ?? '?') + ' 项 · ~' + String(t ?? '?') + ' token）' : ''
      return '> ✂ 上下文已压缩' + meta + nl
    }
    case 'command': {
      const name = row.name ? '/' + row.name : '[命令]'
      const args = row.args ?? ''
      const outcome = row.outcome?.text ? ' → ' + row.outcome.text : ''
      return name + ' ' + args.trim() + outcome + nl
    }
    case 'context':
      return '> 📎 ' + (row.provenance?.producer ?? row.provenance?.role ?? '上下文注入') + nl + '> ' + textOf(row.content) + nl
    case 'unknown':
      return '> [未知事件 ' + row.type + ']' + nl
  }
}

function renderTool(row: ToolRow, max: number, nl: string): string {
  const result = row.resultText.length > max ? row.resultText.slice(0, max) + '…' : row.resultText
  const status = row.isError ? '（失败）' : ''
  let out = '[工具] ' + row.name + status + nl
  if (result) out += '  ' + result + nl
  for (const child of row.subCalls) out += '  ' + renderTool(child, max, nl).trimStart()
  return out
}

function textOf(blocks: readonly { readonly type?: string; readonly text?: string }[]): string {
  return blocks.filter(b => b?.type === 'text' && typeof b.text === 'string').map(b => b.text).join(' ')
}

/** Markdown 渲染器。 */
export const markdownRenderer: ExporterRenderer = {
  id: 'markdown',
  label: 'Markdown',
  mime: 'text/markdown',
  extension: '.md',
  render(session: ExportedSession): string {
    const opts: MdOptions = {}
    const nl = opts.newline ?? '\n'
    const lines: string[] = []
    lines.push('# ' + session.title)
    lines.push('')
    lines.push('> 会话 ' + session.sessionId + ' · ' + session.cwd)
    if (session.stats) {
      lines.push('> 轮次 ' + String(session.stats.turns) + ' · 步骤 ' + String(session.stats.steps))
    }
    lines.push('> 导出时间：' + new Date(session.exportedAt).toISOString())
    lines.push('')
    lines.push('---')
    lines.push('')
    for (const row of session.rows) {
      lines.push(renderRow(row, opts).trimEnd())
      lines.push('')
    }
    if (session.truncated) {
      lines.push('')
      lines.push('> ⚠ 会话存在更早历史未导出（仅导出已加载窗口）。')
    }
    return lines.join(nl) + nl
  },
};
