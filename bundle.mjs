
import { build } from 'esbuild'
import { readFileSync, writeFileSync } from 'node:fs'

// 1. esbuild 打包 client 入口为 CJS（依赖 external）
const result = await build({
  entryPoints: ['src/client/index.ts'],
  bundle: true,
  format: 'cjs',
  platform: 'browser',
  outfile: 'lib/client.bundle.js',
  external: [
    'react',
    'react-dom',
    'react/jsx-runtime',
    '@deepseek-ai/cordis',
    '@deepseek-ai/dsh-client-runtime',
    '@deepseek-ai/dsh-client-runtime/client',
    '@deepseek-ai/dsh-client-ui-layout',
    '@deepseek-ai/dsh-client-ui-conversation',
    '@deepseek-ai/dsh-client-ui-conversation/client',
    '@deepseek-ai/dsh-client-ui-theme',
    '@deepseek-ai/dsh-client-ui-settings',
    '@deepseek-ai/dsh-client-ui-primitives',
    '@deepseek-ai/dsh-commands',
    '@deepseek-ai/dsh-commands/types',
    '@deepseek-ai/dsh-api-remotes',
    '@deepseek-ai/dsh-api-remotes/client',
  ],
  jsx: 'automatic',
  logLevel: 'silent',
})

const bundle = readFileSync('lib/client.bundle.js', 'utf8')

// 2. 包裹成 __ModuleLoader__.load 格式
const wrapped = `window.__ModuleLoader__.load({
	id: "@dsh-community/dsh-toolkit",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
${bundle}
		return module.exports;
	}
});
`

writeFileSync('lib/client.js', wrapped)
console.log('bundle written:', wrapped.length, 'bytes')
