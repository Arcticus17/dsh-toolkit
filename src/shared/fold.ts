import type { ConversationNode, ConversationSnapshot } from '@deepseek-ai/dsh-client-runtime/client'

/**
 * 提取已排序节点：优先 chat.legacy.nodes，回退顶层 snapshot.nodes。
 * 二者是同一份镜像（Session 从 Chat Definition 镜像），读取其一即可；
 * 显式走 chat.legacy.nodes 不依赖兼容层，缺席时回退。
 */
export function orderedNodes(snapshot: ConversationSnapshot): readonly ConversationNode[] {
  const legacy = snapshot.chat?.legacy?.nodes
  if (legacy && legacy.length > 0) return legacy
  return snapshot.nodes ?? []
}

/** 工具结果文本提取（content 中 text 块的拼接）。 */
export function contentText(blocks: readonly { readonly type?: string; readonly text?: string }[] | undefined): string {
  if (!blocks) return ''
  return blocks
    .filter((b): b is { type: string; text: string } => b?.type === 'text' && typeof b.text === 'string')
    .map(b => b.text)
    .join('')
}
