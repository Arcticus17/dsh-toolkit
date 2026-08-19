import { useCallback, useMemo, useState } from 'react'
import type { ConversationSnapshot } from '@deepseek-ai/dsh-client-runtime/client'
import { buildExport, renderExport, downloadExport, copyExport } from './export-core.js'
import type { ExporterFormat } from '../model.js'

/**
 * 会话页头导出按钮（注册到 conversation.session.header.utilities，session scope）。
 * 组件收到框架标准套件：sessionId + useSession（严格会话 slot 的标准注入）。
 */
export function ExportMenu(props: {
  readonly sessionId: string
  readonly useSession: <T>(selector: (s: ConversationSnapshot) => T) => T
}): JSX.Element {
  const { sessionId, useSession } = props
  const [format, setFormat] = useState<ExporterFormat>('markdown')
  const [ready, setReady] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  // 会话快照（框架标准 useSession hook；selector 取全量）
  const snapshot = useSession((s) => s)

  const exported = useMemo(() => {
    if (!snapshot) return null
    return buildExport({
      sessionId,
      title: '会话 ' + sessionId,
      cwd: '',
      snapshot,
    })
  }, [snapshot, sessionId])

  const handleExport = useCallback(() => {
    if (!exported) { setError('会话未就绪'); return }
    try {
      setReady(renderExport(exported, format))
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }, [exported, format])

  const handleDownload = useCallback(() => {
    if (!ready) return
    const ext = format === 'json' ? '.json' : format === 'html' ? '.html' : '.md'
    const mime = format === 'json' ? 'application/json' : format === 'html' ? 'text/html' : 'text/markdown'
    downloadExport(ready, 'session-' + sessionId + ext, mime)
  }, [ready, format, sessionId])

  const handleCopy = useCallback(() => {
    if (ready) void copyExport(ready)
  }, [ready])

  if (!snapshot) return <span className='dsh-toolkit-export' />

  return (
    <span className='dsh-toolkit-export' role='group' aria-label='导出会话'>
      <select
        aria-label='导出格式'
        value={format}
        onChange={e => setFormat(e.target.value as ExporterFormat)}
      >
        <option value='markdown'>Markdown</option>
        <option value='html'>HTML</option>
        <option value='json'>JSON</option>
      </select>
      <button type='button' onClick={handleExport}>导出</button>
      {ready && (<><button type='button' onClick={handleCopy}>复制</button><button type='button' onClick={handleDownload}>下载</button></>)}
      {error && <span role='alert'>{error}</span>}
    </span>
  )
}
