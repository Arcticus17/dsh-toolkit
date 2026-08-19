import type { ExportedSession, ExporterFormat } from '../model.js'

/** 渲染器契约：输入中间模型，输出目标格式文本。 */
export interface ExporterRenderer {
  /** 稳定格式 id。 */
  readonly id: ExporterFormat
  /** 人类可读名称（用于菜单）。 */
  readonly label: string
  /** 输出 MIME（用于下载）。 */
  readonly mime: string
  /** 文件扩展名（含点）。 */
  readonly extension: string
  /** 渲染入口；同步返回完整文本。 */
  render(session: ExportedSession): string
}

/** 注册的自定义渲染器（扩展点）。 */
export interface RegisteredRenderer extends ExporterRenderer {
  readonly register: 'builtin' | 'plugin'
}
