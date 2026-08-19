import { useState } from 'react'
import type { BackgroundRuntime } from '../background.js'
import { validateImageSource } from '../validate.js'

/** 模块级 runtime 单例（entry 写入；settings.section 组件不接收自定义 props）。 */
let runtimeSingleton: BackgroundRuntime | null = null

export function setBackgroundRuntime(runtime: BackgroundRuntime): void {
  runtimeSingleton = runtime
}

export function getBackgroundRuntime(): BackgroundRuntime | null {
  return runtimeSingleton
}

export interface BackgroundSettingsProps {
  readonly maxImageBytes?: number
}

/**
 * 聊天背景设置行（注册到 settings.section）。
 * 模式选择 + 颜色/渐变/图片 + 模糊/透明度滑块 + 恢复默认。
 */
export function BackgroundSettings(props: BackgroundSettingsProps): JSX.Element {
  const maxImageBytes = props.maxImageBytes ?? 2 * 1024 * 1024
  // hooks 必须无条件调用（React 规则）；runtime 理论上在注册前已注入，此分支为防御
  const [error, setError] = useState<string | null>(null)
  const runtime = runtimeSingleton
  if (!runtime) return <div className='dsh-toolkit-bg-settings' />
  const snap = runtime.getSnapshot()
  const settings = snap.settings

  const setMode = (mode: 'color' | 'gradient' | 'image') => {
    void runtime.set('mode', mode)
  }

  const handleImage = (source: string) => {
    const v = validateImageSource(source, maxImageBytes)
    if (!v.ok) {
      setError(v.code === 'too-large' ? '图片超过大小上限' : '无效的图片地址');
      return
    }
    setError(null)
    void runtime.set('image', source)
  }

  const handleFile = (file: File | undefined) => {
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result === 'string') handleImage(reader.result)
    };
    reader.readAsDataURL(file)
  }

  return (
    <div className='dsh-toolkit-bg-settings'>
      <div role='group' aria-label='背景模式'>
        {(['color', 'gradient', 'image'] as const).map(m => (
          <button
            key={m}
            type='button'
            className={settings.mode === m ? 'active' : ''}
            onClick={() => setMode(m)}
          >
            {m === 'color' ? '纯色' : m === 'gradient' ? '渐变' : '图片'}
          </button>
        ))}
      </div>

      {settings.mode === 'color' && (
        <input
          type='color'
          value={settings.color === 'transparent' ? '#ffffff' : settings.color}
          onChange={e => void runtime.set('color', e.target.value)}
        />
      )}

      {settings.mode === 'gradient' && (
        <input
          type='text'
          value={settings.gradient}
          placeholder='linear-gradient(135deg, #1e1e2e, #313244)'
          onChange={e => void runtime.set('gradient', e.target.value)}
        />
      )}

      {settings.mode === 'image' && (
        <div>
          <input
            type='text'
            value={settings.image.startsWith('data:') ? '(本地图片)' : settings.image}
            placeholder='https://example.com/bg.jpg 或选择本地文件'
            onChange={e => handleImage(e.target.value)}
          />
          <input
            type='file'
            accept='image/*'
            onChange={e => handleFile(e.target.files?.[0])}
          />
          {error && <span role='alert'>{error}</span>}
        </div>
      )}

      <label>
        模糊 {settings.blur}px
        <input
          type='range'
          min={0}
          max={64}
          value={settings.blur}
          onChange={e => void runtime.set('blur', Number(e.target.value))}
        />
      </label>

      <label>
        不透明度 {Math.round(settings.opacity * 100)}%
        <input
          type='range'
          min={0}
          max={100}
          value={Math.round(settings.opacity * 100)}
          onChange={e => void runtime.set('opacity', Number(e.target.value) / 100)}
        />
      </label>

      <button type='button' onClick={() => void runtime.reset()}>恢复默认</button>
    </div>
  )
}
