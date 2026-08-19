import { test } from 'node:test'
import assert from 'node:assert/strict'
import { validateImageSource, validateColor, clampBackground } from '../lib/chat-background/validate.js'
import { resolveBackground, defaultBackground, MemoryBackgroundRuntime } from '../lib/chat-background/background.js'
import { applyBackground } from '../lib/chat-background/apply.js'

test('validateImageSource: http/https URL 允许', () => {
  assert.deepEqual(validateImageSource('https://example.com/bg.jpg', 1024), { ok: true })
  assert.deepEqual(validateImageSource('http://example.com/bg.png', 1024), { ok: true })
})

test('validateImageSource: 非 http 协议拒绝', () => {
  assert.deepEqual(validateImageSource('ftp://example.com/bg.jpg', 1024), { ok: false, code: 'bad-url' })
  assert.deepEqual(validateImageSource('not-a-url', 1024), { ok: false, code: 'bad-url' })
})

test('validateImageSource: data URL 校验', () => {
  const tiny = 'data:image/png;base64,iVBORw0KGgo='
  assert.deepEqual(validateImageSource(tiny, 1024), { ok: true })
  assert.deepEqual(validateImageSource('data:text/plain;base64,aGVsbG8=', 1024), { ok: false, code: 'not-image' })
  const big = 'data:image/png;base64,' + 'A'.repeat(700)
  const r = validateImageSource(big, 100)
  assert.equal(r.ok, false)
  if (!r.ok) assert.equal(r.code, 'too-large')
})

test('validateColor: hex 与非法值', () => {
  assert.equal(validateColor('#fff'), true)
  assert.equal(validateColor('#1e1e2e'), true)
  assert.equal(validateColor('#12345'), false)
  assert.equal(validateColor('red'), false)
})

test('clampBackground: blur/opacity 夹取', () => {
  const c = clampBackground({ blur: 100, opacity: 2 })
  assert.equal(c.blur, 64)
  assert.equal(c.opacity, 1)
  const c2 = clampBackground({ blur: -5, opacity: -1 })
  assert.equal(c2.blur, 0)
  assert.equal(c2.opacity, 0)
})

test('resolveBackground: 浅色模式用顶层配置', () => {
  const s = { ...defaultBackground, mode: 'color', color: '#ff0000' }
  const r = resolveBackground(s, false)
  assert.equal(r.mode, 'color')
  assert.equal(r.css.backgroundColor, '#ff0000')
})

test('resolveBackground: 暗色模式用 dark 配置', () => {
  const s = {
    ...defaultBackground,
    mode: 'color', color: '#ffffff',
    dark: { mode: 'color', color: '#000000', gradient: '', image: '', blur: 0, opacity: 1 },
  }
  assert.equal(resolveBackground(s, false).css.backgroundColor, '#ffffff')
  assert.equal(resolveBackground(s, true).css.backgroundColor, '#000000')
})

test('resolveBackground: 透明默认不覆盖主题', () => {
  assert.equal(resolveBackground(defaultBackground, false).css.backgroundColor, 'transparent')
})

test('resolveBackground: image 模式生成 url() 与模糊', () => {
  const s = { ...defaultBackground, mode: 'image', image: 'https://x.com/bg.jpg', blur: 12 }
  const r = resolveBackground(s, false)
  assert.equal(r.css.backgroundImage, 'url("https://x.com/bg.jpg")')
  assert.equal(r.css.blur, '12px')
  assert.equal(r.css.overlay, 'rgba(0,0,0,0)')
})

test('resolveBackground: 不透明度产生 scrim', () => {
  const s = { ...defaultBackground, mode: 'image', image: 'https://x.com/bg.jpg', opacity: 0.5 }
  assert.equal(resolveBackground(s, false).css.overlay, 'rgba(0,0,0,0.5)')
})

test('resolveBackground: gradient 模式', () => {
  const s = { ...defaultBackground, mode: 'gradient', gradient: 'linear-gradient(red, blue)' }
  assert.equal(resolveBackground(s, false).css.backgroundImage, 'linear-gradient(red, blue)')
})


test('MemoryBackgroundRuntime: 快照/写入/重置/订阅', async () => {
  const rt = new MemoryBackgroundRuntime(() => false)
  const snap0 = rt.getSnapshot()
  assert.equal(snap0.status, 'ready')
  assert.equal(snap0.writable, false)
  let notified = 0
  const unsub = rt.subscribe(() => notified++)
  await rt.set('color', '#123456')
  assert.equal(rt.getSnapshot().settings.color, '#123456')
  assert.equal(notified, 1)
  await rt.reset()
  assert.equal(rt.getSnapshot().settings.color, 'transparent')
  assert.equal(notified, 2)
  unsub()
  await rt.set('blur', 5)
  assert.equal(notified, 2)
})

test('applyBackground: 容器缺失时跳过不报错', () => {
  const rt = new MemoryBackgroundRuntime(() => false)
  const disposer = applyBackground(rt, () => null)
  assert.equal(typeof disposer, 'function')
  disposer()
})

test('applyBackground: 应用 CSS 变量到容器', async () => {
  const rt = new MemoryBackgroundRuntime(() => false)
  const styles = new Map()
  const el = { style: { setProperty: (k: string, v: string) => styles.set(k, v) } }
  await rt.set('mode', 'image')
  await rt.set('image', 'https://x.com/b.jpg')
  const disposer = applyBackground(rt, () => el as never)
  assert.equal(styles.get('--dsh-chat-bg-image'), 'url("https://x.com/b.jpg")')
  assert.equal(styles.has('--dsh-chat-bg-color'), true)
  assert.equal(styles.has('--dsh-chat-bg-blur'), true)
  disposer()
})
