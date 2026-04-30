import { builtinModules } from 'module'
import { defineConfig } from 'vite'
// import resolve from '@rollup/plugin-node-resolve';
// import commonjs from '@rollup/plugin-commonjs';
import path from 'path';
import pkgJSON from '../package.json'

export default defineConfig({
	// 整个配置文件的根目录
	root: __dirname,
	build: {
		// ssr: true, // 使 vite 调节为为 node 应用打包
		// target: 'node18',
		outDir: '../app/backend',
		emptyOutDir: true,
		minify: process.env./* from mode option */NODE_ENV === 'production',
		sourcemap: true,
		lib: {
			entry: '../src/backend/index.ts',
			formats: ['cjs'],
			fileName: () => '[name].cjs',
		},
		rolldownOptions: {
			external: [
				'electron',
				...builtinModules,
				// @ts-ignore
				...Object.keys(pkgJSON.dependencies || {}),
				// "@khanacademy/simple-markdown",
				// "conf",
				// "crypto-js",
				// "events",
				// "koa",
				// "koa-body",
				// "koa-mount",
				// "koa-router",
				// "koa-static",
				// "parse-path",
				// "path-browserify",
				// "pinia",
				// "vue",
				// "ws",
			],
			// 用于强行使输出文件为 cjs。不设置 ssr: true 的情况下不需要设置此项
			// output: {
			// 	format: 'cjs', // 设置输出格式为 CommonJS
			// 	entryFileNames: '[name].cjs', // 设置文件名为 .cjs
			// 	sourcemap: true,
			// },
			plugins: [
				// resolve(), // 确保可以解析 node_modules 中的 ESM 模块
				// commonjs({
				//   include: /(node_modules)/, // 将 ESM 转换为 CommonJS
				// }),
			],
		},
	},
	// 不设置 ssr: true 的情况下不需要设置此项
	// ssr: {
	// 	noExternal: ['conf', 'ws'],
	// },
	server: {
		base: '../src/backend/index.ts'
	},
	resolve: {
		// conditions: ['module', 'development|production'],	// 相比于默认值去除了"browser"
		extensions: ['.ts', '.js'],
		alias: { '@common': path.resolve('src/common') },
	},
	define: {
		buildInfo: process.env.buildInfo, // 需要在执行 vite 之前通过编译脚本注入 buildInfo
	},
})
