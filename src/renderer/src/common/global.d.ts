/// <reference types="vite/client" />
// 上面这句当时写下的目的是使 typescript 识别整个项目的 .vue 文件，不过目前好像去掉都没影响
import { JSBridge } from '@preload/index';

// export {} // 使 ts 认为这个文件是一个 module 而不是 script，否则不能 extend global

declare global {
	interface Element {
		focus(): void;
		readonly offsetLeft: number;
		readonly offsetTop: number;
		readonly offsetWidth: number;
		readonly offsetHeight: number;
	}
	interface EventTarget {
		focus(): void;
		readonly offsetLeft: number;
		readonly offsetTop: number;
		readonly offsetWidth: number;
		readonly offsetHeight: number;
		getBoundingClientRect(): DOMRect;
		className: string;
		parentElement?: Element;
		selectionStart: number;
		selectionEnd: number;
		value: any;
	}
	interface Window {
		jsb: JSBridge,
		frontendSettings?: {
			useIEC?: boolean;
			colorTheme?: string;
			colorThemeMode?: string;
		}
	}
}

export {};
