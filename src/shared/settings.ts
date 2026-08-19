import type { SettingsScope, SettingsScopeSpec } from '@deepseek-ai/dsh-client-runtime/client'

/**
 * 通用 settings namespace 绑定（bindSettingsScope 的领域封装）。
 * 领域包只需提供 spec；返回的 scope 提供快照/订阅/写入。
 * 本函数是纯类型层：实际绑定由 ui-settings 的 attachSettings 提供，
 * entry 侧注入对应的 scope 实例。
 */
export function createSettingsScope<T>(
  spec: SettingsScopeSpec<T>,
  attach: (spec: SettingsScopeSpec<T>) => SettingsScope<T>,
): SettingsScope<T> {
  return attach(spec)
}
