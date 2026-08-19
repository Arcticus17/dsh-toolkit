import { Context } from '@deepseek-ai/cordis'
import type { PaletteAction } from './actions.js'

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** 命令面板动作注册表（本插件提供）。 */
    palette: PaletteRegistry
  }
}

export interface PaletteRegistry {
  /** 注册一个动作；同 id 重复注册抛错。 */
  register(def: PaletteAction): () => void
  /** 注销（disposer 内部调用）。 */
  unregister(id: string): void
  /** 列出全部动作（与内建合并顺序）。 */
  list(): readonly PaletteAction[]
  /** 订阅动作集合变更（面板刷新）。 */
  subscribe(listener: () => void): () => void
}

/** 内存实现：动作 Map + 订阅者列表。 */
export class PaletteRegistryImpl implements PaletteRegistry {
  private readonly actions = new Map<string, PaletteAction>()
  private readonly listeners = new Set<() => void>()
  private readonly disposers = new Map<string, () => void>()

  register(def: PaletteAction): () => void {
    if (this.actions.has(def.id)) {
      throw new Error('Palette action already registered: ' + def.id)
    }
    this.actions.set(def.id, def)
    this.emit()
    const disposer = () => {
      this.unregister(def.id)
      this.disposers.delete(def.id)
    }
    this.disposers.set(def.id, disposer)
    return disposer
  }

  unregister(id: string): void {
    if (this.actions.delete(id)) this.emit()
  }

  list(): readonly PaletteAction[] {
    return [...this.actions.values()]
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  private emit(): void {
    for (const l of this.listeners) {
      try { l() } catch { /* 观察者失败不阻塞 */ }
    }
  }
}
