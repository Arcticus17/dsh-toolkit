import { test } from 'node:test'
import assert from 'node:assert/strict'
import { renderToStaticMarkup } from 'react-dom/server'
import { createElement } from 'react'
import { FlowGraph } from '../lib/trajectory-map/ui/FlowGraph.js'
import { ExportModal } from '../lib/exporter/ui/ExportModal.js'

const emptyGraph = { roots: [], byId: new Map(), retries: [], truncated: false }
const noop = () => {}

test('FlowGraph: 空图渲染空状态', () => {
  const html = renderToStaticMarkup(
    createElement(FlowGraph, { graph: emptyGraph, selectedId: null, onSelect: noop, showRetries: true, openDetails: noop })
  );
  assert.match(html, /本窗口内没有工具调用/)
})

test('FlowGraph: 有根节点时渲染 SVG', () => {
  const call = {
    callId: 'c1', name: 'bash', argsRaw: '{}', status: 'settled' as const,
    time: 1000, durationMs: 50, callTime: 950, resultPreview: '', parentId: null, children: [], retryCount: 0,
  };
  const html = renderToStaticMarkup(
    createElement(FlowGraph, { graph: { roots: [call], byId: new Map([['c1', call]]), retries: [], truncated: false }, selectedId: null, onSelect: noop, showRetries: true, openDetails: noop })
  );
  assert.match(html, /<svg/)
  assert.match(html, /bash/)
})

test('FlowGraph: 错误状态显示错误码', () => {
  const call = {
    callId: 'e1', name: 'fail', argsRaw: '{}', status: 'error' as const,
    time: 1000, durationMs: null, callTime: null, resultPreview: '', parentId: null, children: [], retryCount: 0,
    error: { name: 'Err', code: 'X1' },
  };
  const html = renderToStaticMarkup(
    createElement(FlowGraph, { graph: { roots: [call], byId: new Map([['e1', call]]), retries: [], truncated: false }, selectedId: null, onSelect: noop, showRetries: true, openDetails: noop })
  );
  assert.match(html, /X1/)
})

test('FlowGraph: 重试徽标条件渲染', () => {
  const call = {
    callId: 'r1', name: 'retry-tool', argsRaw: '{}', status: 'settled' as const,
    time: 1000, durationMs: 10, callTime: 990, resultPreview: '', parentId: null, children: [], retryCount: 2,
  };
  const withRetry = renderToStaticMarkup(
    createElement(FlowGraph, { graph: { roots: [call], byId: new Map([['r1', call]]), retries: [], truncated: false }, selectedId: null, onSelect: noop, showRetries: true, openDetails: noop })
  );
  assert.match(withRetry, /×2/)
  const withoutRetry = renderToStaticMarkup(
    createElement(FlowGraph, { graph: { roots: [call], byId: new Map([['r1', call]]), retries: [], truncated: false }, selectedId: null, onSelect: noop, showRetries: false, openDetails: noop })
  );
  assert.doesNotMatch(withoutRetry, /×2/)
})

test('ExportModal: 关闭时渲染空', () => {
  const html = renderToStaticMarkup(
    createElement(ExportModal, { open: false, format: 'markdown', text: 'x', onClose: noop, onCopy: noop, onDownload: noop })
  );
  assert.equal(html, '')
})

test('ExportModal: 打开时渲染对话框', () => {
  const html = renderToStaticMarkup(
    createElement(ExportModal, { open: true, format: 'json', text: '{"a":1}', onClose: noop, onCopy: noop, onDownload: noop })
  );
  assert.match(html, /role="dialog"/)
  assert.match(html, /导出预览/)
  assert.match(html, /{&quot;a&quot;:1}/) // React 转义引号
})

test('ExportModal: HTML 格式用 sandbox iframe', () => {
  const html = renderToStaticMarkup(
    createElement(ExportModal, { open: true, format: 'html', text: '<p>hi</p>', onClose: noop, onCopy: noop, onDownload: noop })
  );
  assert.match(html, /sandbox/)
  assert.match(html, /iframe/)
})
