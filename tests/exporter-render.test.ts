import { test } from 'node:test'
import assert from 'node:assert/strict'
import { markdownRenderer } from '../lib/exporter/render/markdown.js'
import { htmlRenderer } from '../lib/exporter/render/html.js'
import { jsonRenderer, safeJson } from '../lib/exporter/render/json.js'
import type { ExportedSession } from '../lib/exporter/model.js'

function makeSession(truncated = false): ExportedSession {
  return {
    formatVersion: 1,
    sessionId: 's1',
    title: '测试会话',
    cwd: 'C:/workspace',
    exportedAt: 1755180000000,
    stats: { turns: 2, steps: 3, llmMs: 5000 },
    truncated,
    rows: [
      { kind: 'user', seq: 1, time: 1000, content: [{ type: 'text', text: '你好世界' }] },
      { kind: 'assistant', seq: 2, time: 2000, turn: 1, step: 1, blocks: [{ kind: 'text', text: '回答内容' }] },
      { kind: 'tool', seq: 3, time: 3000, callId: 'c1', name: 'read_file', argsRaw: '{}', isError: false, callTime: 2500, subCalls: [], resultText: '文件内容' },
      { kind: 'retry', seq: 4, time: 4000, attempt: 1, maxAttempts: 3, state: 'started', delayMs: 500, failureMessage: 'timeout' },
      { kind: 'turn-error', seq: 5, time: 5000, turn: 2, step: 1, message: 'API 错误', code: 'E1' },
      { kind: 'max-tokens', seq: 6, time: 6000, turn: 2, step: 2 },
      { kind: 'command', seq: 7, time: 7000, name: 'plan', args: ' 任务', outcome: { kind: 'success', text: '已规划' } },
      { kind: 'compaction', seq: 8, time: 8000, summary: 's', shadowedItemCount: 3, shadowedTokenCount: 500 },
      { kind: 'context', seq: 9, time: 9000, content: [{ type: 'text', text: '上下文' }], provenance: { role: 'inject', producer: 'skill-x' }, form: 'instructions' },
    ],
  }
}

test('markdown: 完整渲染含标题/元信息/各节点', () => {
  const md = markdownRenderer.render(makeSession())
  assert.match(md, /^# 测试会话/)
  assert.match(md, /> 会话 s1 · C:\/workspace/)
  assert.match(md, /> 轮次 2 · 步骤 3/)
  assert.match(md, /### User/)
  assert.match(md, /> 你好世界/)
  assert.match(md, /### Assistant/)
  assert.match(md, /```text\n回答内容\n```/)
  assert.match(md, /\[工具\] read_file/)
  assert.match(md, /文件内容/)
  assert.match(md, /\[重试 1\/3\] started/)
  assert.match(md, /API 错误 \(E1\)/)
  assert.match(md, /上限处停止/)
  assert.match(md, /\/plan/)
  assert.match(md, /已规划/)
  assert.match(md, /上下文已压缩/)
  assert.match(md, /skill-x/)
})

test('markdown: truncated 追加截断提示', () => {
  const md = markdownRenderer.render(makeSession(true))
  assert.match(md, /更早历史未导出/)
  const md2 = markdownRenderer.render(makeSession(false))
  assert.doesNotMatch(md2, /更早历史未导出/)
})

test('markdown: 工具结果超长截断', () => {
  const session = makeSession()
  const longTool = { ...session.rows[2], resultText: 'x'.repeat(500) }
  const md = markdownRenderer.render({ ...session, rows: [longTool] })
  assert.ok(md.length < 600)
  assert.match(md, /x{200}…/)
})

test('html: 自包含文档结构', () => {
  const html = htmlRenderer.render(makeSession())
  assert.match(html, /^<!doctype html>/)
  assert.match(html, /<title>测试会话<\/title>/)
  assert.match(html, /<style>/)
  assert.match(html, /class="message user"/)
  assert.match(html, /class="message assistant"/)
  assert.match(html, /class="tool"/)
  assert.match(html, /<h1>测试会话<\/h1>/)
})

test('html: XSS 转义', () => {
  const evil = { ...makeSession(), rows: [{ kind: 'user', seq: 1, time: 1, content: [{ type: 'text', text: '<script>alert(1)</script>' }] }] }
  const evilHtml = htmlRenderer.render(evil as never)
  assert.ok(!evilHtml.includes('<script>alert'))
  assert.match(evilHtml, /&lt;script&gt;/)
})

test('html: truncated 页脚', () => {
  const html = htmlRenderer.render(makeSession(true))
  assert.match(html, /class="truncated"/)
})

test('json: 序列化完整模型且可解析', () => {
  const json = jsonRenderer.render(makeSession())
  const parsed = JSON.parse(json) as ExportedSession
  assert.equal(parsed.formatVersion, 1)
  assert.equal(parsed.sessionId, 's1')
  assert.equal(parsed.rows.length, 9)
  assert.equal(parsed.rows[0]?.kind, 'user')
  assert.equal(parsed.truncated, false)
  assert.match(json, /\n  "formatVersion"/)
})

test('safeJson: 净化 BigInt/函数/符号', () => {
  const clean = safeJson({ a: 1n, b: () => 1, c: null, d: [1, 2n], e: Symbol('x') })
  assert.equal(clean?.a, '1')
  assert.equal(typeof clean?.b, 'string')
  assert.equal(clean?.c, null)
  assert.deepEqual(clean?.d, [1, '2'])
})

test('safeJson: 循环引用不崩溃', () => {
  const cyclic: Record<string, unknown> = {}
  cyclic.self = cyclic
  const out = safeJson(cyclic)
  assert.ok(typeof out === 'object')
})

test('safeJson: 深度上限', () => {
  let deep: unknown = 'leaf'
  for (let i = 0; i < 40; i++) deep = { next: deep }
  const out = safeJson(deep, 0) as Record<string, unknown>
  let cur: unknown = out
  let depth = 0
  while (cur && typeof cur === 'object' && depth < 50) {
    cur = (cur as Record<string, unknown>).next
    depth++
  }
  assert.equal(cur, '[depth-limit]')
})
test('markdown: reasoning / image 块进入导出', () => {
  const session = makeSession()
  const row = {
    kind: 'assistant' as const, seq: 2, time: 2000, turn: 1, step: 1,
    blocks: [
      { kind: 'reasoning' as const, text: '先想一下再回答' },
      { kind: 'text' as const, text: '回答内容' },
      { kind: 'image' as const },
    ],
  }
  const md = markdownRenderer.render({ ...session, rows: [row] })
  assert.match(md, /💭 思考过程/)
  assert.match(md, /先想一下再回答/)
  assert.match(md, /回答内容/)
  assert.match(md, /\[图片\]/)
})

test('html: reasoning / image 块进入导出且转义', () => {
  const session = makeSession()
  const row = {
    kind: 'assistant' as const, seq: 2, time: 2000, turn: 1, step: 1,
    blocks: [
      { kind: 'reasoning' as const, text: '<b>思考</b>' },
      { kind: 'image' as const },
    ],
  }
  const html = htmlRenderer.render({ ...session, rows: [row] })
  assert.match(html, /class="reasoning"/)
  assert.match(html, /&lt;b&gt;思考&lt;\/b&gt;/)
  assert.match(html, /class="image">\[图片\]/)
})
