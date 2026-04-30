import { builtinModules } from 'module'
import { defineConfig } from 'vite'
import path from 'path';
// import commonjs from '@rollup/plugin-commonjs';
import pkgJSON from '../package.json'

export default defineConfig({
	// 整个配置文件的根目录
	root: __dirname,
	build: {
		outDir: '../app/main',
		emptyOutDir: true,
		minify: process.env./* from mode option */NODE_ENV === 'production' || false,
		sourcemap: true,
		lib: {
			entry: '../src/main/index.ts',
			formats: ['cjs'],
			fileName: () => '[name].cjs',
		},
		rolldownOptions: {
			external: [
				'electron',
				...builtinModules,
				// 'utimes',
				// '@mapbox/node-pre-gyp',
				// @ts-ignore
				...Object.keys(pkgJSON.dependencies || {}),
			],
		},
		commonjsOptions: {
			ignoreTryCatch: false,
			// dynamicRequireTargets: [
			// 	// 精确到 node_modules 下的实际文件
			// 	'node_modules/@mapbox/node-pre-gyp/lib/**/*.js'
			// ],
			// dynamicRequireRoot: 'A:/Code/FFBox/node_modules/.pnpm/utimes@5.2.1/node_modules/utimes/dist',
		},
	},
	// plugins: [
	// 	commonjs({
	// 		include: [
	// 			/node_modules\/\.pnpm\/utimes@[^/]+\/node_modules\/utimes\/dist\/.*/
	// 		],
	// 		dynamicRequireTargets: [
	// 			'node_modules/utimes/dist/*.js',
	// 		],
	// 		// ignoreDynamicRequires: true,
	// 		defaultIsModuleExports: true,
	// 	}),
	// ],
	resolve: {
		extensions: ['.ts', '.js'],
		alias: {
			'@common': path.resolve('src/common'),
			'@main': path.resolve('src/main'),
		},
	},
	define: {
		buildInfo: process.env.buildInfo, // 需要在执行 vite 之前通过编译脚本注入 buildInfo
	},
})
