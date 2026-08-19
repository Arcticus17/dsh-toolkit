import type { ConversationSnapshot } from '@deepseek-ai/dsh-client-runtime/client'
import { orderedNodes } from '../shared/fold.js'
import { foldNode } from './fold.js'
import type { ExportedSession, FoldOptions, SessionStatsExport } from './model.js'
import { defaultFoldOptions } from './model.js'

/** 从会话快照构建导出模型（纯函数，可测试）。 */
export function buildExportedSession(args: {
  readonly sessionId: string
  readonly title: string
  readonly cwd: string
  readonly snapshot: ConversationSnapshot
  readonly stats?: SessionStatsExport
  readonly opts?: Partial<FoldOptions>
}): ExportedSession {
  const { sessionId, title, cwd, snapshot, stats } = args
  const opts: FoldOptions = { ...defaultFoldOptions, ...args.opts }
  const nodes = orderedNodes(snapshot)
  const rows = nodes
    .map(n => foldNode(n, opts))
    .filter((r): r is NonNullable<typeof r> => r !== null)

  const session: ExportedSession = {
    formatVersion: 1,
    sessionId,
    title,
    cwd,
    exportedAt: Date.now(),
    truncated: snapshot.hasMore === true,
    rows,
    ...(stats ? { stats } : {}),
  }
  return session
}
