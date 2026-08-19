import { test } from 'node:test'
import assert from 'node:assert/strict'
import { filterActions, subsequenceMatch, scoreAction } from '../lib/command-palette/filter.js'
import { ActionMru } from '../lib/command-palette/mru.js'
import { commandsToActions, sessionsToActions, customAction } from '../lib/command-palette/actions.js'
import { PaletteRegistryImpl } from '../lib/command-palette/service.js'
import { parseShortcut } from '../lib/command-palette/ui/shortcuts.js'
import type { PaletteAction } from '../lib/command-palette/actions.js'

// ---- filter ----

function makeAction(id: string, label: string, keywords?: string[]): PaletteAction {
  return { id, label, group: '工具', kind: 'action', keywords, run: () => null }
}

test('subsequenceMatch: 子序列匹配', () => {
  assert.equal(subsequenceMatch('导出会话', '出会'), true)
  assert.equal(subsequenceMatch('导出会话', '会出'), false) // 顺序敏感
  assert.equal(subsequenceMatch('export session', 'exse'), true)
  assert.equal(subsequenceMatch('', 'a'), false)
  assert.equal(subsequenceMatch('abc', ''), true) // 空 query 匹配一切
})

test('scoreAction: 前缀 > 子序列 > keywords', () => {
  const exact = makeAction('a', '导出')
  const prefix = makeAction('b', '导出会话')
  const subseq = makeAction('c', '我先导出再记录') // '导出' 是子序列（出在中间）→ 60 分
  const kw = makeAction('d', '保存', ['导出'])
  assert.ok(scoreAction(exact, '导出') > scoreAction(prefix, '导出'))
  assert.ok(scoreAction(prefix, '导出') > scoreAction(subseq, '导出'))
  assert.ok(scoreAction(subseq, '导出') > scoreAction(kw, '导出'))
  assert.equal(scoreAction(subseq, '导出'), 60)
  assert.equal(scoreAction(kw, '导出'), 40)
  assert.equal(scoreAction(makeAction('e', 'xxx'), 'nope'), 0)
})

test('filterActions: 空 query 返回前 limit 个', () => {
  const actions = Array.from({ length: 30 }, (_, i) => makeAction('a' + i, '动作' + i))
  const all = filterActions(actions, '')
  assert.equal(all.length, 20) // 默认 limit
  const ten = filterActions(actions, '', { limit: 10 })
  assert.equal(ten.length, 10)
})

test('filterActions: 过滤 + 排序', () => {
  const actions = [
    makeAction('a', '导出会话', ['export']),
    makeAction('b', '打开设置'),
    makeAction('c', '导出全部'),
  ]
  const r = filterActions(actions, '导出')
  assert.equal(r.length, 2)
  assert.equal(r[0]?.id, 'a')
  assert.equal(r[1]?.id, 'c')
  // keywords 命中
  const r2 = filterActions(actions, 'export')
  assert.equal(r2.length, 1)
  assert.equal(r2[0]?.id, 'a')
})

test('filterActions: limit 作用于过滤结果', () => {
  const actions = Array.from({ length: 30 }, (_, i) => makeAction('a' + i, '导出' + i))
  const r = filterActions(actions, '导出', { limit: 5 })
  assert.equal(r.length, 5)
})

// ---- MRU ----

test('ActionMru: 记录/权重/清空', () => {
  const mru = new ActionMru()
  assert.equal(mru.weight('a'), Infinity) // 未使用
  mru.record('a')
  mru.record('b')
  assert.equal(mru.weight('a'), 1)
  assert.equal(mru.weight('b'), 0)
  mru.clear()
  assert.equal(mru.weight('a'), Infinity)
})

test('ActionMru: 重复执行更新顺序', () => {
  const mru = new ActionMru()
  mru.record('a')
  mru.record('b')
  mru.record('a') // a 再次执行 → 排到最前
  assert.equal(mru.weight('a'), 0)
  assert.equal(mru.weight('b'), 1)
})

test('ActionMru: 上限 50', () => {
  const mru = new ActionMru()
  for (let i = 0; i < 60; i++) mru.record('x' + i)
  assert.equal(mru.weight('x59'), 0)
  assert.equal(mru.weight('x0'), Infinity) // 超出被淘汰
})

// ---- actions ----

test('commandsToActions: 构建命令动作', () => {
  const execute = async () => ({ commandId: 'c1', result: { kind: 'success', text: 'ok' } as const })
  const actions = commandsToActions([
    { name: 'plan', description: '计划模式' },
    { name: 'compact', description: '压缩上下文' },
  ], execute as never)
  assert.equal(actions.length, 2)
  assert.equal(actions[0]?.id, 'command.plan')
  assert.equal(actions[0]?.label, '/plan')
  assert.equal(actions[0]?.kind, 'command')
  assert.equal(actions[0]?.group, '命令')
  assert.deepEqual(actions[0]?.keywords, ['计划模式'])
})

test('sessionsToActions: 构建导航动作', () => {
  let opened: string | null = null
  const actions = sessionsToActions([
    { id: 's1', title: '修复 bug' },
    { id: 's2', title: '' },
  ], id => { opened = id })
  assert.equal(actions.length, 2)
  assert.equal(actions[0]?.label, '修复 bug')
  assert.equal(actions[1]?.label, 's2') // 无标题回退 id
  assert.equal(actions[0]?.kind, 'navigation')
  void actions[0]?.run({ sessionId: null, executeCommand: (() => null) as never, openSession: id => { opened = id } })
  assert.equal(opened, 's1')
})

test('customAction: 默认分组自定义', () => {
  const a = customAction({ id: 'x', label: 'X', run: () => null })
  assert.equal(a.kind, 'action')
  assert.equal(a.group, '自定义')
  const b = customAction({ id: 'y', label: 'Y', group: '工具', run: () => null })
  assert.equal(b.group, '工具')
})

// ---- PaletteRegistry ----

test('PaletteRegistryImpl: 注册/注销/重复注册', () => {
  const reg = new PaletteRegistryImpl()
  const d = reg.register(makeAction('a', 'A'))
  assert.equal(reg.list().length, 1)
  assert.throws(() => reg.register(makeAction('a', 'A2')), /already registered/)
  d()
  assert.equal(reg.list().length, 0)
  reg.register(makeAction('a', 'A3')) // 注销后可重注册
  assert.equal(reg.list().length, 1)
})

test('PaletteRegistryImpl: 订阅通知', () => {
  const reg = new PaletteRegistryImpl()
  let count = 0
  const unsub = reg.subscribe(() => count++)
  reg.register(makeAction('a', 'A'))
  assert.equal(count, 1)
  unsub()
  reg.register(makeAction('b', 'B'))
  assert.equal(count, 1) // 退订后不再通知
})

// ---- shortcuts ----

test('parseShortcut: 解析组合键', () => {
  const mac = parseShortcut('mod+k')
  // 平台相关：Windows 上 mod → ctrl
  if (/mac/i.test(process.platform)) {
    assert.equal(mac.meta, true)
  } else {
    assert.equal(mac.ctrl, true)
  }
  assert.equal(mac.key, 'k')
  const ctrlShift = parseShortcut('ctrl+shift+e')
  assert.equal(ctrlShift.ctrl, true)
  assert.equal(ctrlShift.key, 'e')
  assert.throws(() => parseShortcut('ctrl+'), /no key/)
})
