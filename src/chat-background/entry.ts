import { Context } from '@deepseek-ai/cordis'
import type { ToolkitConfig } from '../types.js'
import { defaultChatBackgroundConfig } from '../types.js'
import { applyBackground } from './apply.js'
import { MemoryBackgroundRuntime } from './background.js'
import { BackgroundSettings, setBackgroundRuntime } from './ui/BackgroundSettings.js'

export const name = 'chat-background'

/**
 * 聊天背景插件：运行时 + 渲染层应用 + 设置行 + 面板动作。
 * 注册模式：slots.inject('settings.section', () => slots.register({...}, Section))。
 */
export function apply(ctx: Context, config: ToolkitConfig | undefined): void {
  // 真实 web boot 不传 config（见 command-palette entry），按默认值运行。
  const cfg = config?.chatBackground ?? defaultChatBackgroundConfig
  if (!cfg.enabled) return

  // 1. 运行时（v0.1：内存模式；Host-backed 后续接入 attachSettings）
  const dark = () => false
  const runtime = new MemoryBackgroundRuntime(dark)
  setBackgroundRuntime(runtime)

  // 2. 应用背景到滚动容器（effect 注册，fiber 卸载时释放）
  ctx.effect(() => applyBackground(runtime, () =>
    document.querySelector('[data-conversation-scroll]'),
  ))

  // 3. 设置行（ui-settings-general 声明 'settings.section'；root 作用域 list）
  ctx.slots.inject('settings.section', () =>
    ctx.slots.register({
      name: 'settings.section',
      id: 'chat-background',
      order: 50,
      label: () => '聊天背景',
    }, BackgroundSettings),
  )

  // 4. 命令面板动作（command-palette 先 apply 提供 ctx.palette 注册表，直接登记）
  ctx.palette.register({
    id: 'chat-background.reset',
    label: '恢复默认聊天背景',
    group: '工具',
    kind: 'action',
    run: () => {
      void runtime.reset()
      return '已恢复默认背景'
    },
  })

  void cfg
  void dark
}
