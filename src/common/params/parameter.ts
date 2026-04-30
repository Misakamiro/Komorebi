import { NarrowedMenuItem } from "@common/menu";

export type strict2 = { strict2?: true };
export interface TextOptions {
	type?: 'int' | 'float' | 'color' | 'duration' | 'image_size' | 'rational';
	default?: string;
}
export interface ComboOptions {
	items: NarrowedMenuItem[];
	default?: any;
}
export interface SliderOptions {
	min?: number;	// 不填为 0
	max?: number;	// 不填为 1
	tags?: Map<number, string>;
	sliderMode?: 'number' | 'string';	// 决定了 onChange 返回时的值类型、tags 是否用于列表选项
	arrowKeyStep?: number;	// 键盘步进的步长，默认 1
	default?: number | string; // 值可以是数字或字符串。为字符串时将尝试通过 tags 转换为数字提供给滑块内部使用，否则不显示滑块
	adsorption?: 'int' | 'tags' | ((value: number) => number);	// 鼠标或触屏调整时吸附值，不指定时自动选择 tags
	valueToDisplay?: { base?: number, type?: 'bitrate' | 'integer' | 'revertInteger' } | ((value: number | string) => string);	// 显示在滑杆旁边的文字，可以是指示值域的对象、转换函数
	valueToParam?: (value: number | string) => string | number;	// 输出到 ffmpeg 参数的文字
}
export interface BasicParameter {
	parameter: string;	// 实际传给 ffmpeg 的参数
	display: string;	// 显示于表单标题
	description?: string;
	optional?: true;	// 通过扫描 ffmpeg 编码列表得到的参数都应允许关闭
}
export type Parameter = BasicParameter & (
	({ mode: 'switch' } & { default: boolean }) |
	({ mode: 'text' } & TextOptions) |
	({ mode: 'combo' } & ComboOptions) |
	({ mode: 'slider' } & SliderOptions)
);
export type RateControl = { cmd: (string | Symbol)[] } & SliderOptions;
