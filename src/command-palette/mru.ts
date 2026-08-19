/** 最近使用记录（内存态，可选持久化到 localStorage）。 */
export class ActionMru {
  private readonly order: string[] = []

  /** 记录一次执行。 */
  record(actionId: string): void {
    const i = this.order.indexOf(actionId)
    if (i >= 0) this.order.splice(i, 1)
    this.order.unshift(actionId)
    if (this.order.length > 50) this.order.length = 50
  }

  /** 查询排序权重：actionId → 最近使用序号（越小越新）；未使用返回 Infinity。 */
  weight(actionId: string): number {
    const i = this.order.indexOf(actionId)
    return i < 0 ? Infinity : i
  }

  /** 清空。 */
  clear(): void {
    this.order.length = 0
  }
}
