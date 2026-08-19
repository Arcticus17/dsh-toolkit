import { Context } from '@deepseek-ai/cordis'
import type { ToolkitConfig } from '../types.js'
import { defaultCommandPaletteConfig } from '../types.js'
import { PaletteRegistryImpl } from './service.js'
import { registerShortcut } from './ui/shortcuts.js'
import { PaletteOverlay } from './ui/PaletteOverlay.js'

export const name = 'command-palette'

/**
 * 命令面板插件：palette 服务 + 快捷键 + shell.overlay 挂载。
 * 注册模式：slots.inject('shell.overlay', () => slots.register({...}, Overlay))。
 */
export function apply(ctx: Context, config: ToolkitConfig): void {
  const cfg = config.commandPalette ?? defaultCommandPaletteConfig

  // 1. 提供 palette 服务（动作注册表）。cordis Context 是 Proxy：未声明属性
  //    不能直接赋值（cannot set property without provide），必须 ctx.provide。
  //    注册表无条件提供（面板 disabled 时为空表）：exporter / chat-background
  //    登记动作时永远拿得到 ctx.palette，不会因配置组合而抛错。
  const registry = new PaletteRegistryImpl()
  ctx.provide('palette', registry)

  if (!cfg.enabled) return

  // 2. 快捷键 → 打开面板（通过共享 store 状态控制 overlay 可见性）
  ctx.effect(() => registerShortcut(cfg.shortcut, () => {
    paletteStore.openPalette()
  }))

  // 3. shell.overlay 挂载面板（ui-layout 声明；root 作用域列表）。
  //    注入面把本模块提供的 palette 注册表交给 overlay，组件订阅动作变更。
  //    注：动作注册表（ctx.palette）是本包内部扩展点，v0.1 不通过 slot 声明
  //    （SlotCore 要求声明槽位的组件消费 renderSlot，面板动作不是渲染贡献）。
  ctx.slots.inject('shell.overlay', () =>
    ctx.slots.register({
      name: 'shell.overlay',
      id: 'command-palette',
      order: 100,
      inject: () => ({ palette: registry }),
    }, PaletteOverlay),
  )

  void registry
}

/** 面板开关共享状态（overlay 组件与快捷键共用）。 */
export const paletteStore = {
  _listeners: new Set<() => void>(),
  _open: false,
  openPalette(): void {
    this._open = true
    this._emit()
  },
  close(): void {
    this._open = false
    this._emit()
  },
  isOpen(): boolean {
    return this._open
  },
  subscribe(fn: () => void): () => void {
    this._listeners.add(fn)
    return () => this._listeners.delete(fn)
  },
  _emit(): void {
    for (const fn of this._listeners) fn()
  },
}
