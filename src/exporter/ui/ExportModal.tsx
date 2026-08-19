/** 导出预览对话框。v0.1 骨架：Modal 壳 + 只读内容；HTML 用 sandbox iframe 预览。 */
export interface ExportModalProps {
  readonly open: boolean
  readonly format: string
  readonly text: string
  readonly onClose: () => void
  readonly onCopy: () => void
  readonly onDownload: () => void
}

export function ExportModal(props: ExportModalProps): JSX.Element | null {
  const { open, format, text, onClose, onCopy, onDownload } = props
  if (!open) return null

  return (
    <div className="dsh-toolkit-modal-backdrop" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label="导出预览" className="dsh-toolkit-modal"
        onClick={e => e.stopPropagation()}>
        <header>
          <h2>导出预览（{format}）</h2>
          <button type="button" onClick={onClose} aria-label="关闭">×</button>
        </header>
        <div className="dsh-toolkit-modal-body">
          {format === 'html' ? (
            <iframe sandbox="" srcDoc={text} title="导出预览" />
          ) : (
            <pre><code>{text}</code></pre>
          )}
        </div>
        <footer>
          <button type="button" onClick={onCopy}>复制</button>
          <button type="button" onClick={onDownload}>下载</button>
          <button type="button" onClick={onClose}>关闭</button>
        </footer>
      </div>
    </div>
  )
}
