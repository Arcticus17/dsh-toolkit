/**
 * 本包 slot 类型扩展。
 *
 * 从 ui-conversation / ui-settings / ui-layout 的 client 入口 import 类型，
 * 触发它们对 SlotMap 的 declaration merging（lexical merge 要求
 * 在导入该模块的程序中生效）。
 *
 * 注意：本包不声明自有 slot。命令面板动作注册表（ctx.palette）是包内扩展点，
 * 直接登记即可；SlotCore 要求声明槽位的注册组件消费 renderSlot，而面板动作
 * 不是渲染贡献，v0.1 不声明 'toolkit.palette.action' 槽位。
 */
import '@deepseek-ai/dsh-client-ui-conversation/client'
import '@deepseek-ai/dsh-client-ui-settings/client'
import '@deepseek-ai/dsh-client-ui-layout/client'
