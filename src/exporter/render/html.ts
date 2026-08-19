import type { ExportedRow, ExportedSession, ToolRow } from '../model.js'
import type { ExporterRenderer } from './types.js'

export interface HtmlOptions {
  /** 主题。默认 light。 */
  theme?: 'light' | 'dark'
  /** 是否包含完整 HTML 壳（含 CSS）。默认 true；false 时仅输出 body 片段。 */
  includeCss?: boolean
}

/** 基于 --dsw-* token 的编译期静态取值（导出产物不依赖运行时主题）。 */
const PALETTE = {
  light: { surface: '#ffffff', text: '#1f2328', muted: '#6e7781', accent: '#4078c0', error: '#cf222e' },
  dark: { surface: '#0d1117', text: '#e6edf3', muted: '#8b949e', accent: '#58a6ff', error: '#f85149' },
} as const

function esc(s: string | undefined): string {
  if (s === undefined) return ''
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function rowHtml(row: ExportedRow, p: (typeof PALETTE)['light']): string {
  switch (row.kind) {
    case 'user': return '<section class="message user"><h2>User</h2>' + blocksHtml(row.content) + '</section>'
    case 'steering': return '<section class="message steering"><h2>Steering</h2>' + blocksHtml(row.content) + '</section>'
    case 'assistant': {
      const body = row.blocks.filter(b => b.kind === 'text').map(b => '<p>' + esc((b as { text: string }).text) + '</p>').join('')
      const reasoning = row.blocks.filter(b => b.kind === 'reasoning')
        .map(b => '<details class="reasoning"><summary>💭 思考过程</summary><p>' + esc((b as { text: string }).text) + '</p></details>')
        .join('')
      const images = row.blocks.filter(b => b.kind === 'image').map(() => '<p class="image">[图片]</p>').join('')
      const tools = row.blocks.filter(b => b.kind === 'tool-call')
        .map(b => '<details><summary>[工具] ' + esc((b as { name: string }).name) + '</summary><pre>' + esc((b as { argsRaw: string }).argsRaw) + '</pre></details>')
        .join('')
      return '<section class="message assistant"><h2>Assistant</h2>' + body + reasoning + images + tools + '</section>'
    }
    case 'tool': return '<section class="tool">' + toolHtml(row, p) + '</section>'
    case 'retry': return '<section class="retry">⚠ 重试 ' + String(row.attempt) + '/' + String(row.maxAttempts ?? '∞') + ' · ' + row.state + '</section>'
    case 'turn-error': return '<section class="error">⚠ ' + esc(row.message) + (row.code ? ' (' + esc(row.code) + ')' : '') + '</section>'
    case 'max-tokens': return '<section class="error">⚠ 回答在输出 token 上限处停止。</section>'
    case 'compaction': return '<section class="compaction">✂ 上下文已压缩</section>'
    case 'command': {
      const name = row.name ? '/' + row.name : '[命令]'
      return '<section class="command"><code>' + esc(name) + '</code>' + (row.args ? ' ' + esc(row.args.trim()) : '') + (row.outcome?.text ? ' → ' + esc(row.outcome.text) : '') + '</section>'
    }
    case 'context': return '<section class="context">📎 ' + esc(row.provenance?.producer ?? '上下文注入') + blocksHtml(row.content) + '</section>'
    case 'unknown': return '<section class="unknown">[未知事件 ' + esc(row.type) + ']</section>'
  }
}

function toolHtml(row: ToolRow, p: (typeof PALETTE)['light']): string {
  const status = row.isError ? ' (失败)' : ''
  let out = '<details class="tool"><summary>[工具] ' + esc(row.name) + status + '</summary>'
  out += '<pre>' + esc(row.argsRaw) + '</pre>'
  if (row.resultText) out += '<pre>' + esc(row.resultText) + '</pre>'
  out += '</details>'
  for (const child of row.subCalls) out += toolHtml(child, p)
  return out
}

function blocksHtml(blocks: readonly { readonly type?: string; readonly text?: string }[]): string {
  return blocks.filter(b => b?.type === 'text' && typeof b.text === 'string').map(b => '<p>' + esc(b.text) + '</p>').join('')
}

/** HTML 渲染器：单文件自包含（内联 CSS）。 */
export const htmlRenderer: ExporterRenderer = {
  id: 'html',
  label: 'HTML',
  mime: 'text/html',
  extension: '.html',
  render(session: ExportedSession): string {
    const theme: 'light' | 'dark' = 'light'
    const p = PALETTE[theme]
    const body = '<main class="session">'
      + '<header><h1>' + esc(session.title) + '</h1><dl>'
      + '<dt>会话</dt><dd>' + esc(session.sessionId) + '</dd>'
      + '<dt>工作目录</dt><dd>' + esc(session.cwd) + '</dd>'
      + (session.stats ? '<dt>轮次</dt><dd>' + String(session.stats.turns) + '</dd><dt>步骤</dt><dd>' + String(session.stats.steps) + '</dd>' : '')
      + '</dl></header>'
      + session.rows.map(r => rowHtml(r, p)).join('')
      + (session.truncated ? '<footer class="truncated">⚠ 会话存在更早历史未导出</footer>' : '')
      + '</main>'
    const css = 'body{font-family:system-ui,sans-serif;margin:0;background:' + p.surface + ';color:' + p.text
      + '}main{max-width:820px;margin:0 auto;padding:24px}.message{border-left:3px solid ' + p.accent + ';padding:4px 12px;margin:12px 0}'
      + '.message.user{border-color:' + p.muted + '}.error{color:' + p.error + '}.truncated{color:' + p.muted + ';font-style:italic}'
      + 'pre{background:#f6f8fa;padding:8px;border-radius:6px;overflow:auto;white-space:pre-wrap}'
      + 'code{font-family:ui-monospace,monospace}'
    return '<!doctype html><html lang="zh"><head><meta charset="utf-8"><title>' + esc(session.title)
      + '</title><style>' + css + '</style></head><body>' + body + '</body></html>'
  },
}
