/** 校验图片源：URL（http/https）或 data URL（image/*）；返回错误码或 null。 */
export function validateImageSource(
  source: string,
  maxBytes: number,
): { ok: true } | { ok: false; code: 'bad-url' | 'too-large' | 'not-image' } {
  if (source.startsWith('data:')) {
    // data URL：校验 MIME 与字节上限
    const m = /^data:([^;,]+);base64,/.exec(source)
    if (!m) return { ok: false, code: 'bad-url' }
    const mime = m[1]!
    if (!mime.startsWith('image/')) return { ok: false, code: 'not-image' }
    const bytes = Math.floor((source.length - source.indexOf(',') - 1) * 3 / 4)
    if (bytes > maxBytes) return { ok: false, code: 'too-large' }
    return { ok: true }
  }
  // URL：http(s) 协议
  try {
    const u = new URL(source)
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return { ok: false, code: 'bad-url' }
    return { ok: true }
  } catch {
    return { ok: false, code: 'bad-url' }
  }
}

/** 校验颜色：hex 或合法命名色。 */
export function validateColor(color: string): boolean {
  return /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(color)
}

/** 归一化：blur 夹取 [0, 64]、opacity 夹取 [0, 1]。 */
export function clampBackground<T extends { blur: number; opacity: number }>(settings: T): T {
  return {
    ...settings,
    blur: Math.min(64, Math.max(0, settings.blur)),
    opacity: Math.min(1, Math.max(0, settings.opacity)),
  }
}
