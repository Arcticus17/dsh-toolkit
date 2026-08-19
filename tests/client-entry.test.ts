import { test } from 'node:test'
import assert from 'node:assert/strict'
import { inject, apply } from '../lib/client/index.js'

/**
 * 回归测试：DSH web boot 的 entry 激活契约。
 * 1. bundle 导出的 inject 必须是【服务名】（slots/sessions），
 *    否则 fiber 永久 pending（"waiting for services: @deepseek-ai/..."）。
 * 2. apply 不得抛错（曾用 slots.register 声明未注册槽位，SlotCore 会 throw）。
 * 3. 各模块在宿主槽位声明后完成注册，面板动作进入 ctx.palette。
 */

interface SlotSpec { kind: string; scope: string }

/** 模拟宿主 slots 服务的核心语义：inject 订阅声明；register 要求已声明；children 声明子槽。 */
class SlotStub {
  declared = new Map<string, SlotSpec>()
  pending = new Map<string, Array<(args: unknown) => void>>()
  registrations: Array<Record<string, unknown>> = []

  inject(key: string, cb: (args: unknown) => void): void {
    if (this.declared.has(key)) { cb(undefined); return }
    const list = this.pending.get(key) ?? []
    list.push(cb)
    this.pending.set(key, list)
  }

  declare(key: string, spec: SlotSpec): void {
    if (this.declared.has(key)) return
    this.declared.set(key, spec)
    this.flush(key)
  }

  register(opts: {
    name: string
    id?: string
    order?: number
    label?: unknown
    children?: Record<string, SlotSpec>
    inject?: (args: unknown) => unknown
  }, component: unknown): () => void {
    if (!this.declared.has(opts.name)) {
      throw new Error(`slot "${opts.name}" is not declared (register requires a live declaration)`)
    }
    for (const [child, spec] of Object.entries(opts.children ?? {})) {
      if (this.declared.has(child)) throw new Error(`slot "${child}" is already declared`)
      this.declared.set(child, spec)
      this.flush(child)
    }
    this.registrations.push({ ...opts, component })
    return () => {}
  }

  private flush(key: string): void {
    const cbs = this.pending.get(key)
    if (!cbs) return
    this.pending.delete(key)
    for (const cb of cbs) cb(undefined)
  }
}

function makeCtx() {
  const slots = new SlotStub()
  const ctx: Record<string, unknown> = {
    slots,
    sessions: {
      binding: () => ({ session: { getSnapshot: () => ({ hasMore: false }), loadOlder: async () => {} } }),
    },
    effect: (fn: () => unknown) => { const d = fn(); return typeof d === 'function' ? d : () => {} },
    provide: (name: string, value: unknown) => { ctx[name] = value },
  }
  return { ctx, slots }
}

test('client entry: bundle inject 使用服务名（slots/sessions），而非包名', () => {
  assert.deepEqual(inject, ['slots', 'sessions'])
})

test('client entry: apply 完成全部注册，无未声明槽位异常', () => {
  const origWindow = (globalThis as { window?: unknown }).window
  const origDocument = (globalThis as { document?: unknown }).document
  ;(globalThis as Record<string, unknown>).window = { addEventListener: () => {}, removeEventListener: () => {} }
  ;(globalThis as Record<string, unknown>).document = { querySelector: () => null }
  try {
    const { ctx, slots } = makeCtx()
    apply(ctx, {})

    // 面板动作直接进入注册表（command-palette 先 apply）
    const palette = ctx.palette as { list: () => Array<{ id: string }> }
    assert.ok(palette, 'ctx.palette 应由 command-palette 提供')
    assert.deepEqual(palette.list().map(a => a.id).sort(), ['chat-background.reset', 'exporter.export'])

    // 宿主槽位声明前不注册任何内容
    assert.equal(slots.registrations.length, 0)

    // 声明宿主槽位 → 各模块注册触发
    slots.declare('conversation.session.header.utilities', { kind: 'list', scope: 'session' })
    slots.declare('conversation.view', { kind: 'list', scope: 'session' })
    slots.declare('settings.section', { kind: 'list', scope: 'root' })
    slots.declare('shell.overlay', { kind: 'list', scope: 'root' })

    const byId = new Map(slots.registrations.map(r => [r.id, r]))
    assert.deepEqual([...byId.keys()].sort(), ['chat-background', 'command-palette', 'dsh-toolkit-export', 'trajectory-map'])

    // shell.overlay 注册的注入面把 palette 注册表交给 overlay
    const overlay = byId.get('command-palette') as { inject?: (args: unknown) => { palette: unknown } }
    assert.equal(typeof overlay.inject, 'function')
    const face = (overlay.inject as (args: unknown) => { palette: unknown })(undefined)
    assert.equal(face.palette, ctx.palette)
  } finally {
    const g = globalThis as Record<string, unknown>
    if (origWindow === undefined) delete g.window; else g.window = origWindow
    if (origDocument === undefined) delete g.document; else g.document = origDocument
  }
})

test('client entry: 部分模块禁用不抛错（palette 无条件提供，动作按配置登记）', () => {
  const origWindow = (globalThis as { window?: unknown }).window
  const origDocument = (globalThis as { document?: unknown }).document
  ;(globalThis as Record<string, unknown>).window = { addEventListener: () => {}, removeEventListener: () => {} }
  ;(globalThis as Record<string, unknown>).document = { querySelector: () => null }
  try {
    const { ctx, slots } = makeCtx()
    apply(ctx, {
      exporter: { enabled: false },
      trajectoryMap: { enabled: false },
      commandPalette: { enabled: false },
    })
    // palette 仍被提供；禁用的模块不登记动作，启用的 chat-background 正常登记
    const palette = ctx.palette as { list: () => Array<{ id: string }> }
    assert.ok(palette)
    assert.deepEqual(palette.list().map(a => a.id), ['chat-background.reset'])
    // 禁用模块的槽位不注册（trajectory-map / command-palette），启用模块按声明注册
    slots.declare('shell.overlay', { kind: 'list', scope: 'root' })
    slots.declare('conversation.view', { kind: 'list', scope: 'session' })
    assert.equal(slots.registrations.length, 0, '禁用的 command-palette / trajectory-map 不注册任何内容')
    slots.declare('settings.section', { kind: 'list', scope: 'root' })
    assert.deepEqual(slots.registrations.map(r => r.id), ['chat-background'])
  } finally {
    const g = globalThis as Record<string, unknown>
    if (origWindow === undefined) delete g.window; else g.window = origWindow
    if (origDocument === undefined) delete g.document; else g.document = origDocument
  }
})
