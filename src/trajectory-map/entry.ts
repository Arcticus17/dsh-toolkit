import { Context } from '@deepseek-ai/cordis'
import type { SessionId } from '@deepseek-ai/dsh-client-connection/client'
import type { ToolkitConfig } from '../types.js'
import { defaultTrajectoryMapConfig } from '../types.js'
import { TrajectoryMapView } from './ui/TrajectoryMapView.js'

export const name = 'trajectory-map'

/**
 * 流程图插件：注册 conversation.view 标签页（形态 A，已确认决策）。
 * 注册模式对齐 ui-trajectory：slots.inject('conversation.view', () => slots.register({...}, View))。
 */
export function apply(ctx: Context, config: ToolkitConfig): void {
  const cfg = config.trajectoryMap ?? defaultTrajectoryMapConfig
  if (!cfg.enabled) return

  ctx.slots.inject('conversation.view', () =>
    ctx.slots.register({
      name: 'conversation.view',
      id: 'trajectory-map',
      order: 20, // 排在 Chat(0) / ui-trajectory(10) 之后
      label: () => '流程图',
      inject: (sessionId: SessionId) => {
        const session = ctx.sessions.binding(sessionId)?.session
        if (!session) throw new Error('dsh-toolkit: session unavailable: ' + sessionId)
        return {
          loadOlder: async () => {
            const before = session.getSnapshot().hasMore
            await session.loadOlder()
            return session.getSnapshot().hasMore !== before
          },
        }
      },
    }, TrajectoryMapView),
  )

  void cfg
}
