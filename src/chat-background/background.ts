import type { SettingsScope, SettingsScopeSpec } from '@deepseek-ai/dsh-client-runtime/client'

/** 聊天背景配置（settings namespace: 'chat-background'）。 */
export interface ChatBackgroundSettings {
  readonly mode: 'color' | 'gradient' | 'image'
  readonly color: string
  readonly gradient: string
  readonly image: string
  readonly blur: number
  readonly opacity: number
  /** 暗色模式独立配置。 */
  readonly dark: DarkBackgroundSettings
}

export interface DarkBackgroundSettings {
  readonly mode: 'color' | 'gradient' | 'image'
  readonly color: string
  readonly gradient: string
  readonly image: string
  readonly blur: number
  readonly opacity: number
}

/** 默认值（透明 = 不覆盖主题表面）。 */
export const defaultBackground: ChatBackgroundSettings = {
  mode: 'color',
  color: 'transparent',
  gradient: '',
  image: '',
  blur: 0,
  opacity: 1,
  dark: { mode: 'color', color: 'transparent', gradient: '', image: '', blur: 0, opacity: 1 },
}

export const backgroundSettingsSpec: SettingsScopeSpec<ChatBackgroundSettings> = {
  namespace: 'chat-background',
  // decode 缺省：按 namespace 自身的 wire schema 校验
}

/** 已解析背景（渲染层唯一输入）。 */
export interface ResolvedBackground {
  readonly mode: 'color' | 'gradient' | 'image'
  readonly css: {
    readonly backgroundImage: string
    readonly backgroundColor: string
    readonly blur: string
    readonly overlay: string
  }
}

/** 发布给渲染层的快照。 */
export interface BackgroundSnapshot {
  readonly status: 'loading' | 'ready' | 'unavailable'
  readonly resolved: ResolvedBackground
  readonly settings: ChatBackgroundSettings
  readonly writable: boolean
}

/** 聊天背景运行时。 */
export interface BackgroundRuntime {
  getSnapshot(): BackgroundSnapshot
  subscribe(listener: () => void): () => void
  set(field: keyof ChatBackgroundSettings, value: unknown): Promise<void>
  reset(): Promise<void>
}

/**
 * 依据暗色位解析配置：dark → settings.dark（字段缺省回退顶层）；否则顶层。
 * 输出 ResolvedBackground.css（渲染层直接应用的 CSS 值）。
 */
export function resolveBackground(settings: ChatBackgroundSettings, dark: boolean): ResolvedBackground {
  const s = dark ? { ...settings, ...settings.dark } : settings
  const opacity = Math.min(1, Math.max(0, s.opacity))
  switch (s.mode) {
    case 'color':
      return {
        mode: 'color',
        css: {
          backgroundImage: 'none',
          backgroundColor: s.color,
          blur: s.blur > 0 ? s.blur + 'px' : '0',
          overlay: 'rgba(0,0,0,' + (0) + ')',
        },
      }
    case 'gradient':
      return {
        mode: 'gradient',
        css: {
          backgroundImage: s.gradient || 'none',
          backgroundColor: 'transparent',
          blur: s.blur > 0 ? s.blur + 'px' : '0',
          overlay: 'rgba(0,0,0,' + (1 - opacity) + ')',
        },
      }
    case 'image':
      return {
        mode: 'image',
        css: {
          backgroundImage: s.image ? 'url("' + s.image + '")' : 'none',
          backgroundColor: 'transparent',
          blur: s.blur > 0 ? s.blur + 'px' : '0',
          overlay: 'rgba(0,0,0,' + (1 - opacity) + ')',
        },
      }
  }
}

/** 内存模式运行时（远程浏览器降级；Host settings 由 entry 注入 scope）。 */
export class MemoryBackgroundRuntime implements BackgroundRuntime {
  private settings: ChatBackgroundSettings = defaultBackground
  private readonly listeners = new Set<() => void>()

  constructor(private readonly dark: () => boolean) {}

  getSnapshot(): BackgroundSnapshot {
    return {
      status: 'ready',
      resolved: resolveBackground(this.settings, this.dark()),
      settings: this.settings,
      writable: false,
    }
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  async set(field: keyof ChatBackgroundSettings, value: unknown): Promise<void> {
    this.settings = { ...this.settings, [field]: value }
    for (const l of this.listeners) l()
  }

  async reset(): Promise<void> {
    this.settings = defaultBackground
    for (const l of this.listeners) l()
  }
}

/** Host-backed 运行时（entry 注入 scope 时使用；v0.1 骨架）。 */
export class ScopedBackgroundRuntime implements BackgroundRuntime {
  private readonly scope: SettingsScope<ChatBackgroundSettings>

  constructor(scope: SettingsScope<ChatBackgroundSettings>, private readonly dark: () => boolean) {
    this.scope = scope
  }

  getSnapshot(): BackgroundSnapshot {
    const snap = this.scope.getSnapshot()
    const settings = snap.value ?? defaultBackground
    return {
      status: snap.status,
      resolved: resolveBackground(settings, this.dark()),
      settings,
      writable: snap.writable,
    }
  }

  subscribe(listener: () => void): () => void {
    return this.scope.subscribe(listener)
  }

  async set(field: keyof ChatBackgroundSettings, value: unknown): Promise<void> {
    await this.scope.set(field, value)
  }

  async reset(): Promise<void> {
    for (const key of Object.keys(defaultBackground) as (keyof ChatBackgroundSettings)[]) {
      if (key !== 'dark') await this.scope.unset(key)
    }
  }
}
