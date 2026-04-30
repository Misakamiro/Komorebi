import { OutputParams_video } from "../types";
import { SliderOptions, Parameter, RateControl } from './parameter';
import { getMenuItemByValue, MenuItem, NarrowedMenuItem } from '@common/menu';

const VALUE = Symbol()

export interface VCodecDetail {
	rateControl: MenuItem<RateControl>[];
	parameters: Parameter[];
	strict2?: true;
}

const 自动: NarrowedMenuItem = {
	type: 'normal',
	value: '自动',
	label: '自动',
	tooltip: '不指定，由 FFmpeg 自动选择',
}

// #region 预置码率控制模式 combo

const CRF = (extra: any) => ({
	type: 'normal' as const,
	value: 'CRF',
	label: '恒定质量 CRF',
	tooltip: 'Constant Rate Factor - 恒定速率因子\n指定视觉画质，而码率因画面内容而异，性价比最高。\n如果您对输出文件大小没有明确的目标，使用此项可获得视觉上最稳定的画质。相较于 CQP，CRF 会考虑帧间的动态关系，在人眼更容易捕捉的静态画面分配更低的 QP，从而节省码率并且获得更好的视觉效果。',
	extra: {
		cmd: ['-crf', VALUE],
		...extra,
	},
});
const CQP = (extra: any) => ({
	type: 'normal' as const,
	value: 'CQP',
	label: '恒定量化 CQP',
	tooltip: 'Constant Quantization Parameter - 恒定量化参数\n指定每帧的画质，而码率因画面内容而异，可作为 CRF 的备选方案。\n如果您对输出文件大小没有明确的目标，使用此项可获得最稳定的画质。相较于 CRF，CQP 的 QP 是恒定的，每帧的画质相同，因此相同码率下视觉画质较 CRF 低，一般仅在显卡编码时使用。',
	extra: {
		cmd: ['-qp', VALUE],
		...extra,
	},
});
const CBR = (extra: any) => ({
	type: 'normal' as const,
	value: 'CBR',
	label: '固定码率 CBR',
	tooltip: 'Constant Bit Rate - 恒定码率\n将码率恒定在指定值，仅允许极小或没有波动，性价比最低，一般仅应用于直播等需要数据速率稳定的场景。',
	extra: {
		cmd: ['-b:v', VALUE],
		...extra,
	},
});
const ABR = (extra: any) => ({
	type: 'normal' as const,
	value: 'ABR',
	label: '平均码率 ABR',
	tooltip: 'Average Bit Rate - 平均码率\n将码率控制在指定值左右，一般应用于限定文件大小但又不希望像 CBR 那样死板的场景。',
	extra: {
		cmd: ['-b:v', VALUE],
		...extra,
	},
});
const VBR = (extra: any) => ({
	type: 'normal' as const,
	value: 'VBR',
	label: '动态码率 VBR',
	tooltip: 'Variable Bit Rate - 可变码率\n指定比特率或画质参数，并控制比特率范围。',
	extra: {
		cmd: ['-rc', 'vbr', '-cq', VALUE],
		...extra,
	},
});
const VBR_HQ = (extra: any) => ({
	type: 'normal' as const,
	value: 'VBR_HQ',
	label: '动态码率 VBR_HQ',
	tooltip: 'Variable Bit Rate - 可变码率\n指定比特率或画质参数，并控制比特率范围。该项是 NVIDIA 特有选项，在编码时间几乎不变的情况下略微提高质量。',
	extra: {
		cmd: ['-rc', 'vbr_hq', '-cq', VALUE],
		...extra,
	},
});
const Q = (extra: any) => ({
	type: 'normal' as const,
	value: 'Q',
	label: '指定质量 Q',
	tooltip: 'Q - 质量\n指定画质，具体值对应的画质由具体编码器决定。',
	extra: {
		cmd: ['-q:v', VALUE],
		...extra,
	},
});

// #endregion

// #region 预置 slider

// valueToText：显示在滑杆旁边的文字　　valueProcess：进行吸附、整数化处理　　valueToParam：输出到 ffmpeg 参数的文字

const crf63slider: SliderOptions = {
	max: 63,
	tags: new Map([
		[0, '63（最低画质）'],
		[63, '0（最高画质）'],
	]),
	default: 40, // 60 - 23
	valueToDisplay: { type: 'revertInteger' },
	adsorption: 'int',
	valueToParam: (value: number) => {
		return 63 - Math.round(value);
	},
}
const libx264x265crfSlider: SliderOptions = {
	max: 51,
	tags: new Map([
		[0, '51（最低画质）'],
		[15, '36（很低画质）'],
		[21, '30（低画质）'],
		[27, '24（中画质）'],
		[33, '18（高画质）'],
		[39, '12（肉眼无损）'],
		[51, '0（最高画质）'],
	]),
	default: 28,	// 51 - 23
	valueToDisplay: { type: 'revertInteger' },
	adsorption: 'int',
	valueToParam: (value: number) => {
		return 51 - Math.round(value);
	},
}
const libaomav1CRFslider: SliderOptions = {
	max: 63,
	tags: new Map([
		[0, '63（最低画质）'],
		[13, '50（低画质）'],
		[27, '36（中画质）'],
		[41, '22（高画质）'],
		[63, '0（最高画质）'],
	]),
	default: 27, // 60 - 36
	valueToDisplay: { type: 'revertInteger' },
	adsorption: 'int',
	valueToParam: (value: number) => {
		return 63 - Math.round(value);
	},
}
const qp70slider: SliderOptions = {
	max: 70,
	tags: new Map([
		[0, '70（最低画质）'],
		[70, '0（最高画质）'],
	]),
	default: 40, // 70 - 30
	valueToDisplay: { type: 'revertInteger' },
	adsorption: 'int',
	valueToParam: (value: number) => {
		return 70 - Math.round(value);
	},
}
const qp63slider: SliderOptions = {
	max: 63,
	tags: new Map([
		[0, '63（最低画质）'],
		[63, '0（最高画质）'],
	]),
	default: 39, // 63 - 24
	valueToDisplay: { type: 'revertInteger' },
	adsorption: 'int',
	valueToParam: (value: number) => {
		return 63 - Math.round(value);
	},
}
const libsvtav1QPslider: SliderOptions = {
	max: 63,
	tags: new Map([
		[0, '63（最低画质）'],
		[3, '60（很低画质）'],
		[15, '48（低画质）'],
		[27, '36（中画质）'],
		[41, '22（高画质）'],
		[63, '0（最高画质）'],
	]),
	default: 27, // 63 - 36
	valueToDisplay: { type: 'revertInteger' },
	adsorption: 'int',
	valueToParam: (value: number) => {
		return 63 - Math.round(value);
	},
}
const qp51slider: SliderOptions = {
	max: 51,
	tags: new Map([
		[0, '51（最低画质）'],
		[51, '0（最高画质）'],
	]),
	default: 28, // 51 - 23
	valueToDisplay: { type: 'revertInteger' },
	adsorption: 'int',
	valueToParam: (value: number) => {
		return 51 - Math.round(value);
	},
}
const nvencQPslider: SliderOptions = {
	max: 51,
	tags: new Map([
		[0, '51（最低画质）'],
		[13, '38（很低画质）'],
		[19, '32（低画质）'],
		[25, '26（中画质）'],
		[31, '20（高画质）'],
		[51, '0（最高画质）'],
	]),
	default: 28, // 51 - 23
	valueToDisplay: { type: 'revertInteger' },
	adsorption: 'int',
	valueToParam: (value: number) => {
		return 51 - Math.round(value);
	},
}
const nvencVBRslider: SliderOptions = {
	max: 51,
	tags: new Map([
		[0, '51（最低画质）'],
		[9, '42（很低画质）'],
		[15, '36（低画质）'],
		[23, '28（中画质）'],
		[41, '10（高画质）'],
		[51, '0（自动）'],
	]),
	default: 23,	// 51 - 28
	valueToDisplay: { type: 'revertInteger' },
	adsorption: 'int',
	valueToParam: (value: number) => {
		return 51 - Math.round(value);
	},
}
const av1qsvQslider: SliderOptions = {
	max: 255,
	tags: new Map([
		[0, '255（最低画质）'],
		[79, '176（很低画质）'],
		[123, '132（低画质）'],
		[167, '88（中画质）'],
		[211, '44（高画质）'],
		[255, '0（最高画质）'],
	]),
	default: 88,
	valueToDisplay: { type: 'revertInteger' },
	adsorption: 'int',
	valueToParam: (value: number) => {
		return 255 - Math.round(value);
	},
}
const vbitrateSlider: SliderOptions = {
	max: 12,
	arrowKeyStep: 24,
	tags: new Map([
		[0, '62.5 Kbps'],
		[3, '500 Kbps'],
		[6, '4 Mbps'],
		[9, '32 Mbps'],
		[12, '256 Mbps'],
	]),
	default: 6,
	valueToDisplay: { base: 62500, type: 'bitrate' },
	valueToParam: (value: number) => {
		return Math.round(62.5 * Math.pow(2, value)) + "k"
	},
}
const q100slider: SliderOptions = {
	max: 100,
	tags: new Map([
		[0, '0'],
		[100, '100'],
	]),
	default: 50,
	valueToDisplay: { type: 'integer' },
	adsorption: 'int',
	valueToParam: (value: number) => {
		return (value).toFixed(0);
	},
}
const H264265presetSlider: SliderOptions = {
	max: 9,
	tags: new Map([
		[0, 'ultrafast'],
		[1, 'superfast'],
		[2, 'veryfast'],
		[3, 'faster'],
		[4, 'fast'],
		[5, 'medium'],
		[6, 'slow'],
		[7, 'slower'],
		[8, 'veryslow'],
		[9, 'placebo'],
	]),
	sliderMode: 'string',
	default: 'medium',
	valueToParam: (value) => value,
}
const qsvPresetSlider: SliderOptions = {
	max: 6,
	tags: new Map([
		[0, 'veryfast'],
		[1, 'faster'],
		[2, 'fast'],
		[3, 'medium'],
		[4, 'slow'],
		[5, 'slower'],
		[6, 'veryslow'],
	]),
	sliderMode: 'string',
	default: 'medium',
	valueToParam: (value) => value,
}

// #endregion

// #region 预置 preset

const 默认: NarrowedMenuItem = {
	type: 'normal',
	value: '默认',
	label: '默认',
	tooltip: '默认',
}
const psnr: NarrowedMenuItem = {
	type: 'normal',
	value: 'psnr',
	label: 'psnr',
	tooltip: '优化 PSNR',
}
const ssim: NarrowedMenuItem = {
	type: 'normal',
	value: 'ssim',
	label: 'ssim',
	tooltip: '优化 SSIM',
}
const fastdecode: NarrowedMenuItem = {
	type: 'normal',
	value: 'fastdecode',
	label: 'fastdecode',
	tooltip: '快速解码',
}
const zerolatency: NarrowedMenuItem = {
	type: 'normal',
	value: 'zerolatency',
	label: 'zerolatency',
	tooltip: '低延迟编码',
}
const film: NarrowedMenuItem = {
	type: 'normal',
	value: 'film',
	label: 'film',
	tooltip: '电影',
}
const animation: NarrowedMenuItem = {
	type: 'normal',
	value: 'animation',
	label: 'animation',
	tooltip: '动画',
}
const grain: NarrowedMenuItem = {
	type: 'normal',
	value: 'grain',
	label: 'grain',
	tooltip: '保留噪点',
}
const stillimage: NarrowedMenuItem = {
	type: 'normal',
	value: 'stillimage',
	label: 'stillimage',
	tooltip: '静态图像',
}
const nvencPreset: NarrowedMenuItem[] = [
	{
		type: 'normal',
		value: '自动',
		label: '自动',
		tooltip: '自动',
	},
	{
		type: 'normal',
		value: 'slow',
		label: 'slow',
		tooltip: 'hq 2 passes',
	},
	{
		type: 'normal',
		value: 'medium',
		label: 'medium',
		tooltip: 'hq 1 pass',
	},
	{
		type: 'normal',
		value: 'fast',
		label: 'fast',
		tooltip: 'hp 1 pass',
	},
	{
		type: 'normal',
		value: 'hq',
		label: 'hq',
		tooltip: '',
	},
	{
		type: 'normal',
		value: 'bd',
		label: 'bd',
		tooltip: '',
	},
	{
		type: 'normal',
		value: 'll',
		label: 'll',
		tooltip: 'low latency',
	},
	{
		type: 'normal',
		value: 'llhq',
		label: 'llhq',
		tooltip: 'low latency hq',
	},
	{
		type: 'normal',
		value: 'llhp',
		label: 'llhp',
		tooltip: 'low latency hp',
	},
	{
		type: 'normal',
		value: 'lossless',
		label: 'lossless',
		tooltip: '',
	},
	{
		type: 'normal',
		value: 'losslesshp',
		label: 'losslesshp',
		tooltip: '',
	},
	{
		type: 'normal',
		value: 'p1',
		label: 'p1',
		tooltip: 'fastest (lowest quality)',
	},
	{
		type: 'normal',
		value: 'p2',
		label: 'p2',
		tooltip: 'faster (lower quality)',
	},
	{
		type: 'normal',
		value: 'p3',
		label: 'p3',
		tooltip: 'fast (low quality)',
	},
	{
		type: 'normal',
		value: 'p4',
		label: 'p4',
		tooltip: 'medium (default)',
	},
	{
		type: 'normal',
		value: 'p5',
		label: 'p5',
		tooltip: 'slow (good quality)',
	},
	{
		type: 'normal',
		value: 'p6',
		label: 'p6',
		tooltip: 'slower (better quality)',
	},
	{
		type: 'normal',
		value: 'p7',
		label: 'p7',
		tooltip: 'slowest (best quality)',
	},
]

// #endregion

// #region 预置 level

const h264Level: NarrowedMenuItem[] = [
	{
		type: 'normal',
		value: '自动',
		label: '自动',
		tooltip: '自动',
	},
	{
		type: 'normal',
		value: '1',
		label: '1',
		tooltip: '高清晰度@最高帧率：\n128×96@30\n176×144@15',
	},
	{
		type: 'normal',
		value: '1b',
		label: '1b',
		tooltip: '高清晰度@最高帧率：\n128×96@30\n176×144@15',
	},
	{
		type: 'normal',
		value: '1.1',
		label: '1.1',
		tooltip: '高清晰度@最高帧率：\n128×96@60\n176×144@30\n352×288@7.5',
	},
	{
		type: 'normal',
		value: '1.2',
		label: '1.2',
		tooltip: '高清晰度@最高帧率：\n128×96@120\n176×144@60\n352×288@15',
	},
	{
		type: 'normal',
		value: '1.3',
		label: '1.3',
		tooltip: '高清晰度@最高帧率：\n128×96@172\n176×144@120\n352×288@30',
	},
	{
		type: 'normal',
		value: '2',
		label: '2',
		tooltip: '高清晰度@最高帧率：\n128×96@172\n176×144@120\n352×288@30',
	},
	{
		type: 'normal',
		value: '2.1',
		label: '2.1',
		tooltip: '高清晰度@最高帧率：\n176×144@172\n352×240@60\n352×288@50\n352×480@30\n352×576@25',
	},
	{
		type: 'normal',
		value: '2.2',
		label: '2.2',
		tooltip: '高清晰度@最高帧率：\n176×144@172\n352×480@30\n352×576@25\n720×480@15\n720×576@12.5',
	},
	{
		type: 'normal',
		value: '3',
		label: '3',
		tooltip: '高清晰度@最高帧率：\n176×144@172\n352×240@120\n352×480@60\n720×480@30\n720×576@25',
	},
	{
		type: 'normal',
		value: '3.1',
		label: '3.1',
		tooltip: '高清晰度@最高帧率：\n352×288@172\n352×576@130\n640×480@90\n720×576@60\n1280×720@30',
	},
	{
		type: 'normal',
		value: '3.2',
		label: '3.2',
		tooltip: '高清晰度@最高帧率：\n640×480@172\n720×480@160\n720×576@130\n1280×720@60',
	},
	{
		type: 'normal',
		value: '4',
		label: '4',
		tooltip: '高清晰度@最高帧率：\n720×480@172\n720×576@150\n1280×720@60\n2048×1024@30',
	},
	{
		type: 'normal',
		value: '4.1',
		label: '4.1',
		tooltip: '高清晰度@最高帧率：\n720×480@172\n720×576@150\n1280×720@60\n2048×1024@30',
	},
	{
		type: 'normal',
		value: '4.2',
		label: '4.2',
		tooltip: '高清晰度@最高帧率：\n720×576@172\n1280×720@140\n2048×1080@60',
	},
	{
		type: 'normal',
		value: '5',
		label: '5',
		tooltip: '高清晰度@最高帧率：\n1024×768@172\n1280×720@160\n2048×1080@60\n2560×1920@30\n3680×1536@25',
	},
	{
		type: 'normal',
		value: '5.1',
		label: '5.1',
		tooltip: '高清晰度@最高帧率：\n1280×720@172\n1920×1080@120\n2048×1536@80\n4096×2048@30',
	},
	{
		type: 'normal',
		value: '5.2',
		label: '5.2',
		tooltip: '高清晰度@最高帧率：\n1920×1080@172\n2048×1536@160\n4096×2048@60',
	},
	{
		type: 'normal',
		value: '6',
		label: '6',
		tooltip: '高清晰度@最高帧率：\n2048×1536@300\n4096×2160@120\n8192×4320@30',
	},
	{
		type: 'normal',
		value: '6.1',
		label: '6.1',
		tooltip: '高清晰度@最高帧率：\n2048×1536@300\n4096×2160@240\n8192×4320@60',
	},
	{
		type: 'normal',
		value: '6.2',
		label: '6.2',
		tooltip: '高清晰度@最高帧率：\n4096×2304@300\n8192×4320@120',
	},
]
const hevcLevel: NarrowedMenuItem[] = [
	{
		type: 'normal',
		value: '自动',
		label: '自动',
		tooltip: '自动',
	},
	{
		type: 'normal',
		value: '1',
		label: '1',
		tooltip: '高清晰度@最高帧率：\n128×96@33.7\n176×144@15.0',
	},
	{
		type: 'normal',
		value: '2',
		label: '2',
		tooltip: '高清晰度@最高帧率：\n176×144@100.0\n320×240@45.0\n352×240@37.5\n352×288@30.0',
	},
	{
		type: 'normal',
		value: '2.1',
		label: '2.1',
		tooltip: '高清晰度@最高帧率：\n320×240@90.0\n352×240@75.0\n352×288@60.0\n352×480@37.5\n352×576@33.3\n640×360@30.0',
	},
	{
		type: 'normal',
		value: '3',
		label: '3',
		tooltip: '高清晰度@最高帧率：\n352×480@84.3\n352×576@75.0\n640×360@67.5\n720×480@42.1\n720×576@37.5\n960×540@30.0',
	},
	{
		type: 'normal',
		value: '3.1',
		label: '3.1',
		tooltip: '高清晰度@最高帧率：\n720×480@84.3\n720×576@75.0\n960×540@60.0\n1280×720@33.7',
	},
	{
		type: 'normal',
		value: '4',
		label: '4',
		tooltip: '高清晰度@最高帧率：\n1280×720@68.0\n1280×1024@51.0\n1920×1080@32.0\n2048×1080@30.0',
	},
	{
		type: 'normal',
		value: '4.1',
		label: '4.1',
		tooltip: '高清晰度@最高帧率：\n1280×720@136.0\n1280×1024@102.0\n1920×1080@64.0\n2048×1080@60.0',
	},
	{
		type: 'normal',
		value: '5',
		label: '5',
		tooltip: '高清晰度@最高帧率：\n1920×1080@128.0\n2048×1024@127.5\n2048×1080@120.0\n2048×1536@85.0\n2560×1920@54.4\n3672×1536@46.8\n3840×2160@32.0\n4096×2160@30.0',
	},
	{
		type: 'normal',
		value: '5.1',
		label: '5.1',
		tooltip: '高清晰度@最高帧率：\n1920×1080@256.0\n2048×1024@255.0\n2048×1080@240.0\n2048×1536@170.0\n2560×1920@108.8\n3672×1536@93.7\n3840×2160@64.0\n4096×2160@60.0',
	},
	{
		type: 'normal',
		value: '5.2',
		label: '5.2',
		tooltip: '高清晰度@最高帧率：\n1920×1080@300.0\n2048×1024@300.0\n2048×1080@300.0\n2048×1536@300.0\n2560×1920@217.6\n3672×1536@187.5\n3840×2160@128.0\n4096×2160@120.0',
	},
	{
		type: 'normal',
		value: '6',
		label: '6',
		tooltip: '高清晰度@最高帧率：\n3840×2160@128.0\n4096×2048@127.5\n4096×2160@120.0\n4096×2304@113.3\n7680×4320@32.0\n8192×4320@30.0',
	},
	{
		type: 'normal',
		value: '6.1',
		label: '6.1',
		tooltip: '高清晰度@最高帧率：\n3840×2160@256.0\n4096×2048@255.0\n4096×2160@240.0\n4096×2304@226.6\n7680×4320@64.0\n8192×4320@60.0',
	},
	{
		type: 'normal',
		value: '6.2',
		label: '6.2',
		tooltip: '高清晰度@最高帧率：\n3840×2160@300.0\n4096×2048@300.0\n4096×2160@300.0\n4096×2304@300.0\n7680×4320@128.0\n8192×4320@120.0',
	},
]

// #endregion

// #region 预置 profile

const baseline: NarrowedMenuItem = {
	type: 'normal',
	value: 'baseline',
	label: 'baseline',
	tooltip: 'baseline',
}
const constrained_baseline: NarrowedMenuItem = {
	type: 'normal',
	value: 'constrained_baseline',
	label: 'constrained_baseline',
	tooltip: 'constrained_baseline',
}
const main: NarrowedMenuItem = {
	type: 'normal',
	value: 'main',
	label: 'main',
	tooltip: 'main',
}
const main10: NarrowedMenuItem = {
	type: 'normal',
	value: 'main10',
	label: 'main10',
	tooltip: 'main10',
}
const mainsp: NarrowedMenuItem = {
	type: 'normal',
	value: 'mainsp',
	label: 'mainsp',
	tooltip: 'mainsp',
}
const rext: NarrowedMenuItem = {
	type: 'normal',
	value: 'rext',
	label: 'rext',
	tooltip: 'rext',
}
const high: NarrowedMenuItem = {
	type: 'normal',
	value: 'high',
	label: 'high',
	tooltip: 'high',
}
const high10: NarrowedMenuItem = {
	type: 'normal',
	value: 'high10',
	label: 'high10',
	tooltip: 'high10',
}
const constrained_high: NarrowedMenuItem = {
	type: 'normal',
	value: 'constrained_high',
	label: 'constrained_high',
	tooltip: 'constrained_high',
}
const high422p: NarrowedMenuItem = {
	type: 'normal',
	value: 'high422p',
	label: 'high422p',
	tooltip: 'high422p',
}
const high422: NarrowedMenuItem = {
	type: 'normal',
	value: 'high422',
	label: 'high422',
	tooltip: 'high422',
}
const high444p: NarrowedMenuItem = {
	type: 'normal',
	value: 'high444p',
	label: 'high444p',
	tooltip: 'high444p',
}
const high444: NarrowedMenuItem = {
	type: 'normal',
	value: 'high444',
	label: 'high444',
	tooltip: 'high444',
}
const extended: NarrowedMenuItem = {
	type: 'normal',
	value: 'extended',
	label: 'extended',
	tooltip: 'extended',
}


// #endregion

// #region 预置 pixel format

const [ yuv420p ,  yuv422p ,  yuv440p ,  yuv444p ,  yuva420p ,  yuvj420p ,  yuvj422p ,  yuvj444p ,  nv12 ,  nv16 ,  nv21 ,  gbrp ,  yuv420p10le ,  yuv422p10le ,  yuv440p10le ,  yuv444p10le ,  yuv420p12le ,  yuv422p12le ,  yuv440p12le ,  yuv444p12le ,  yuv444p16le ] =
	  ['yuv420p', 'yuv422p', 'yuv440p', 'yuv444p', 'yuva420p', 'yuvj420p', 'yuvj422p', 'yuvj444p', 'nv12', 'nv16', 'nv21', 'gbrp', 'yuv420p10le', 'yuv422p10le', 'yuv440p10le', 'yuv444p10le', 'yuv420p12le', 'yuv422p12le', 'yuv440p12le', 'yuv444p12le', 'yuv444p16le'].map((n) => ({
		type: 'normal' as const,
		value: n, label: n,
		tooltip: '',
	  }));
const [ nv20le ,  gbrp10le ,  gbrp12le ,  gray ,  gray10le ,  p010le ,  p016le ,  qsv ,  bgr0 ,  rgb0 ,  bgr24 ,  rgb24 ,  bgra ,  cuda ,  d3d11 ,  dxva2_vld ,  videotoolbox_vld ,  rgb555le ] =
	  ['nv20le', 'gbrp10le', 'gbrp12le', 'gray', 'gray10le', 'p010le', 'p016le', 'qsv', 'bgr0', 'rgb0', 'bgr24', 'rgb24', 'bgra', 'cuda', 'd3d11', 'dxva2_vld', 'videotoolbox_vld', 'rgb555le'].map((n) => ({
		type: 'normal' as const,
		value: n, label: n,
		tooltip: '',
	  }));

// #endregion

export const builtInVcodecs: MenuItem<VCodecDetail>[] = [
	{
		type: 'submenu',
		label: 'AV1',
		tooltip: 'AV1 - AV1 即 AOMedia Video 1 是一个开放、免专利的影片编码格式，专为通过网络进行流传输而设计。',
		subMenu: [
			{
				type: 'normal',
				value: 'libaom-av1',
				label: '【默认】libaom-av1',
				tooltip: '',
				extra: {
					rateControl: [
						{ ...CRF(libaomav1CRFslider) },
						{ ...ABR(vbitrateSlider) },
					],
					parameters: [
						{
							mode: "combo", parameter: "pix_fmt", display: "像素格式",
							items: [ 自动, yuv420p, yuv422p, yuv444p, gbrp, yuv420p10le, yuv422p10le, yuv444p10le, yuv420p12le, yuv422p12le, yuv444p12le, gbrp10le, gbrp12le, gray, gray10le, gbrp12le ],
						},
						{
							mode: "slider", parameter: "cpu-used", display: "编码质量",
								max: 8,
								tags: new Map([
									[0, '8（低质量，快）'],
									[8, '0（高质量，慢）'],
								]),
								default: 0,
								valueToDisplay: { type: 'revertInteger' },
								adsorption: 'int',
								valueToParam: (value: number) => {
									return 8 - Math.round(value);
								},
						},
					],
				}
			},
			{
				type: 'normal',
				value: 'libsvtav1',
				label: 'libsvtav1',
				tooltip: '',
				extra: {
					rateControl: [
						{ ...CQP(libsvtav1QPslider) },
						{ ...CRF(crf63slider) },
						{ ...ABR(vbitrateSlider) },
					],
					parameters: [
						{
							mode: "combo", parameter: "pix_fmt", display: "像素格式",
							items: [ 自动, yuv420p, yuv420p10le ],
						},
						{
							mode: "slider", parameter: "preset", display: "编码质量",
								max: 13,
								tags: new Map([
									[0, '13（低质量，快）'],
									[13, '0（高质量，慢）'],
								]),
								default: 6, // 13 - 7
								valueToDisplay: { type: 'revertInteger' },
								adsorption: 'int',
								valueToParam: (value: number) => {
									return 13 - Math.round(value);
								},
						},
					],
				}
			},
			{
				type: 'normal',
				value: 'av1_qsv',
				label: 'av1_qsv',
				tooltip: 'Intel 硬件加速编码器',
				extra: {
					rateControl: [
						{ ...Q(av1qsvQslider) },	// 255 以上的数值依然有效，但影响甚微
						{ ...ABR(vbitrateSlider) },
					],
					parameters: [
						{
							mode: "combo", parameter: "pix_fmt", display: "像素格式",
							items: [ 自动, nv12, p010le, qsv ],
						},
						{
							mode: "slider", parameter: "preset", display: "编码质量",
							...qsvPresetSlider,
						},
					],
				}
			},
		],
	},
	{
		type: 'submenu',
		label: 'HEVC (H.265)',
		tooltip: 'HEVC - HEVC 即高效率视频编码（High Efficiency Video Coding），又称为 H.265 和 MPEG-H 第 2 部分，是一种视频压缩标准，被视为是 ITU-T H.264/MPEG-4 AVC 标准的继任者。',
		subMenu: [
			{
				type: 'normal',
				value: 'libx265',
				label: '【默认】libx265',
				tooltip: '',
				extra: {
					rateControl: [
						{ ...CRF(libx264x265crfSlider) },
						{ ...CQP(qp70slider) },
						{ ...ABR(vbitrateSlider) },
					],
					parameters: [
						{
							mode: "slider", parameter: "preset", display: "编码质量",
							...H264265presetSlider,
						},
						{
							mode: "combo", parameter: "tune", display: "编码倾重",
							items: [ 默认, psnr, ssim, fastdecode, zerolatency ],
						},
						{
							mode: "combo", parameter: "level", display: "级别",
							items: [ ...hevcLevel ],
						},
						{
							mode: "combo", parameter: "pix_fmt", display: "像素格式",
							items: [ 自动, yuv420p, yuv422p, yuv444p, gbrp, yuv420p10le, yuv422p10le, yuv444p10le, gbrp10le, gray, gray10le ],
						},	
					],
				},
			},
			{
				type: 'normal',
				value: 'hevc_qsv',
				label: 'hevc_qsv',
				tooltip: 'Intel 硬件加速编码器',
				extra: {
					rateControl: [
						{ ...Q(qp63slider) },
						{ ...ABR(vbitrateSlider) },
					],
					parameters: [
						{
							mode: "slider", parameter: "preset", display: "编码质量",
							...qsvPresetSlider,
						},
						{
							mode: "combo", parameter: 'profile:v', display: '规格',
							items: [ 自动, main, main10, mainsp ],
						},
						{
							mode: "combo", parameter: "pix_fmt", display: "像素格式",
							items: [ 自动, nv12, p010le, qsv ],
						},
					],
				},
			},
			{
				type: 'normal',
				value: 'hevc_nvenc',
				label: 'hevc_nvenc',
				tooltip: 'NVIDIA 硬件加速编码器',
				extra: {
					rateControl: [
						{ ...VBR(nvencVBRslider) },
						{ ...VBR_HQ(nvencVBRslider) },
						{ ...CQP(nvencQPslider) },
						{ ...ABR(vbitrateSlider) },
					],
					parameters: [
						{
							mode: "combo", parameter: "preset", display: "编码质量",
							items: [ ...nvencPreset ],
						},
						{
							mode: "combo", parameter: "tune", display: "编码倾重",
							items: [ 默认, psnr, ssim, fastdecode, zerolatency ],
						},
						{
							mode: "combo", parameter: 'profile:v', display: "规格",
							items: [ 自动, main, main10, rext ],
						},
						{
							mode: "combo", parameter: "level", display: "级别",
							items: [ ...hevcLevel ],
						},
						{
							mode: "combo", parameter: "pix_fmt", display: "像素格式",
							items: [ 自动, yuv420p, nv12, p016le, yuv444p, p010le, yuv444p16le, bgr0, rgb0, cuda, d3d11 ],
						},
					],
				},
			},
			{
				type: 'normal',
				value: 'hevc_amf',
				label: 'hevc_amf',
				tooltip: 'AMD 硬件加速编码器',
				extra: {
					rateControl: [
						{ ...CQP({ ...qp51slider, cmd: ['-qp_i', VALUE, '-qp_p', VALUE] }) },
						{ ...CBR({ ...vbitrateSlider, cmd: ['-rc', 'cbr', '-b:v', VALUE] }) },
						{ ...ABR(vbitrateSlider) },
					],
					parameters: [
						{
							mode: "slider", parameter: "preset", display: "编码质量",
							max: 2,
							tags: new Map([
								[0, 'speed'],
								[1, 'balanced'],
								[2, 'quality'],
							]),
							sliderMode: 'string',
							default: 'balanced',
							valueToParam: (value) => value,
						},
						{
							mode: "combo", parameter: "tune", display: "编码倾重",
							items: [
								自动,
								{
									type: 'normal',
									value: 'transcoding',
									label: 'transcoding（默认）',
									tooltip: '转码',
								},
								{
									type: 'normal',
									value: 'ultralowlatency',
									label: 'ultralowlatency',
									tooltip: '超低延迟',
								},
								{
									type: 'normal',
									value: 'webcam',
									label: 'webcam',
									tooltip: '网络摄像头',
								},
							],
						},
						{
							mode: "combo", parameter: 'profile:v', display: "规格",
							items: [ 自动, main, high ]
						},
						{
							mode: "combo", parameter: "level", display: "级别",
							items: [ ...hevcLevel ]
						},
						{
							mode: "combo", parameter: "pix_fmt", display: "像素格式",
							items: [ 自动, yuv420p, nv12, d3d11, dxva2_vld ],
						},
					],
				},
			},
			{
				type: 'normal',
				value: 'hevc_videotoolbox',
				label: 'hevc_videotoolbox',
				tooltip: '苹果硬件加速编码器',
				extra: {
					rateControl: [
						{ ...Q(q100slider) },
						{ ...ABR(vbitrateSlider) },
					],
					parameters: [
						{
							mode: "combo", parameter: 'profile:v', display: "规格",
							items: [ 自动, main, main10 ],
						},
						{
							mode: "combo", parameter: "pix_fmt", display: "像素格式",
							items: [ 自动, videotoolbox_vld, nv12, yuv420p, bgra, p010le ],
						},
					],
				},
			},
		],
	},
	{
		type: 'submenu',
		label: 'H.264 (AVC)',
		tooltip: 'H.264 - H.264 又称为 MPEG-4 第 10 部分，高级视频编码（MPEG-4 Part 10, Advanced Video Coding，缩写为 MPEG-4 AVC）是一种面向块，基于运动补偿的视频编码标准。到 2014 年，它已经成为高精度视频录制、压缩和发布的最常用格式之一。',
		subMenu: [
			{
				type: 'normal',
				value: 'libx264',
				label: '【默认】libx264',
				tooltip: '',
				extra: {
					rateControl: [
						{ ...CRF(libx264x265crfSlider) },
						{ ...CQP(qp70slider) },
						{ ...CBR({ ...vbitrateSlider, cmd: ['-b:v', VALUE, '-minrate', VALUE, '-maxrate', VALUE] }) },
						{ ...ABR(vbitrateSlider) },
					],
					parameters: [
						{
							mode: "slider", parameter: "preset", display: "编码质量",
							...H264265presetSlider,
						},
						{
							mode: "combo", parameter: "tune", display: "编码倾重",
							items: [ 默认, film, animation, grain, stillimage, psnr, ssim, fastdecode, zerolatency ],
						},
						{
							mode: "combo", parameter: 'profile:v', display: "规格",
							items: [ 自动, baseline, main, high, high422, high444 ],
						},
						{
							mode: "combo", parameter: "level", display: "级别",
							items: [ ...h264Level ],
						},
						{
							mode: "combo", parameter: "pix_fmt", display: "像素格式",
							items: [ 自动, yuv420p, yuvj420p, yuv422p, yuvj422p, yuv444p, yuvj444p, nv12, nv16, nv21, yuv420p10le, yuv422p10le, yuv444p10le, nv20le, gray, gray10le ],
						},
					],
				},
			},
			{
				type: 'normal',
				value: 'libx264rgb',
				label: 'libx264rgb',
				tooltip: '',
				extra: {
					rateControl: [
						{ ...CRF(libx264x265crfSlider) },
						{ ...CQP(qp70slider) },
						{ ...CBR({ ...vbitrateSlider, cmd: ['-b:v', VALUE, '-minrate', VALUE, '-maxrate', VALUE] }) },
						{ ...ABR(vbitrateSlider) },
					],
					parameters: [
						{
							mode: "slider", parameter: "preset", display: "编码质量",
							...H264265presetSlider,
						},
						{
							mode: "combo", parameter: "tune", display: "编码倾重",
							items: [ 默认, film, animation, grain, stillimage, psnr, ssim, fastdecode, zerolatency ],
						},
						{
							mode: "combo", parameter: "level", display: "级别",
							items: [ ...h264Level ],
						},
						{
							mode: "combo", parameter: "pix_fmt", display: "像素格式",
							items: [ 自动, bgr0, bgr24, rgb24 ],
						},
					],
				},
			},
			{
				type: 'normal',
				value: 'h264_qsv',
				label: 'h264_qsv',
				tooltip: 'Intel 硬件加速编码器',
				extra: {
					rateControl: [
						{ ...Q(q100slider) },
						{ ...ABR(vbitrateSlider) },
					],
					parameters: [
						{
							mode: "slider", parameter: "preset", display: "编码质量",
							...qsvPresetSlider,
						},
						{
							mode: "combo", parameter: 'profile:v', display: '规格',
							items: [ 自动, baseline, main, high ],
						},
						{
							mode: "combo", parameter: "pix_fmt", display: "像素格式",
							items: [ 自动, nv12, qsv ],
						},
					],
				},
			},
			{
				type: 'normal',
				value: 'h264_nvenc',
				label: 'h264_nvenc',
				tooltip: 'NVIDIA 硬件加速编码器',
				extra: {
					rateControl: [
						{ ...VBR(nvencVBRslider) },
						{ ...VBR_HQ(nvencVBRslider) },
						{ ...CQP(nvencQPslider) },
						{ ...CBR({ ...vbitrateSlider, cmd: ['-cbr', 'true', '-b:v', VALUE] }) },
						{ ...ABR(vbitrateSlider) },
					],
					parameters: [
						{
							mode: "combo", parameter: "preset", display: "编码质量",
							items: [ ...nvencPreset ],
						},
						{
							mode: "combo", parameter: "tune", display: "编码倾重",
							items: [ 默认, psnr, ssim, fastdecode, zerolatency ],
						},
						{
							mode: "combo", parameter: 'profile:v', display: "规格",
							items: [ 自动, baseline, main, high, high444p ],
						},
						{
							mode: "combo", parameter: "level", display: "级别",
							items: [ ...h264Level ],
						},
						{
							mode: "combo", parameter: "pix_fmt", display: "像素格式",
							items: [ 自动, yuv420p, nv12, p016le, yuv444p, p010le, yuv444p16le, bgr0, rgb0, cuda, d3d11 ],
						},
					],
				},
			},
			{
				type: 'normal',
				value: 'h264_amf',
				label: 'h264_amf',
				tooltip: 'AMD 硬件加速编码器',
				extra: {
					rateControl: [
						{ ...CQP({ ...qp51slider, cmd: ['-qp_i', VALUE, '-qp_p', VALUE] }) },
						{ ...CBR({ ...vbitrateSlider, cmd: ['-rc', 'cbr', '-b:v', VALUE] }) },
						{ ...ABR(vbitrateSlider) },
					],
					parameters: [
						{
							mode: "slider", parameter: "preset", display: "编码质量",
							max: 2,
							tags: new Map([
								[0, 'speed'],
								[1, 'balanced'],
								[2, 'quality'],
							]),
							sliderMode: 'string',
							default: 'balanced',
							valueToParam: (value) => value,
						},
						{
							mode: "combo", parameter: "tune", display: "编码倾重",
							items: [
								{
									type: 'normal',
									value: 'transcoding',
									label: 'transcoding（默认）',
									tooltip: '转码',
								},
								{
									type: 'normal',
									value: 'ultralowlatency',
									label: 'ultralowlatency',
									tooltip: '超低延迟',
								},
								{
									type: 'normal',
									value: 'webcam',
									label: 'webcam',
									tooltip: '网络摄像头',
								},
							],
						},
						{
							mode: "combo", parameter: 'profile:v', display: "规格",
							items: [ 自动, main, high, constrained_baseline, constrained_high ],
						},
						{
							mode: "combo", parameter: "level", display: "级别",
							items: [ ...h264Level ],
						},
						{
							mode: "combo", parameter: "pix_fmt", display: "像素格式",
							items: [ 自动, yuv420p, nv12, d3d11, dxva2_vld ],
						},
					],
				},
			},
			{
				type: 'normal',
				value: 'h264_videotoolbox',
				label: 'h264_videotoolbox',
				tooltip: '苹果硬件加速编码器',
				extra: {
					rateControl: [
						{ ...Q(q100slider) },
						{ ...ABR(vbitrateSlider) },
					],
					parameters: [
						{
							mode: "combo", parameter: 'profile:v', display: "规格",
							items: [ 自动, baseline, main, main10, extended ],
						},
						{
							mode: "combo", parameter: "level", display: "级别",
							items: [ ...h264Level ],
						},
						{
							mode: "combo", parameter: "pix_fmt", display: "像素格式",
							items: [ 自动, videotoolbox_vld, nv12, yuv420p ],
						},
					],
				},
			},
		],
	},
	{
		type: 'submenu',
		label: 'VP9',
		tooltip: 'VP9 - VP9 是谷歌公司为了替换老旧的 VP8 影像编码格式并与动态专家图像组（MPEG）主导的高效率视频编码（H.265/HEVC）竞争所开发的免费、开源的影像编码格式。',
		subMenu: [
			{
				type: 'normal',
				value: 'libvpx-vp9',
				label: '【默认】libvpx-vp9',
				tooltip: '',
				extra: {
					rateControl: [
						{ ...CRF(crf63slider) },
						{ ...ABR(vbitrateSlider) },
					],
					parameters: [
						{
							mode: "slider", parameter: "preset", display: "编码质量",
							max: 2,
							tags: new Map([
								[0, 'realtime'],
								[1, 'good'],
								[2, 'best'],
							]),
							sliderMode: 'string',
							default: 'good',
							valueToParam: (value) => value,
						},
						{
							mode: "combo", parameter: "pix_fmt", display: "像素格式",
							items: [ 自动, yuv420p, yuv422p, yuv440p, yuv444p, yuv420p10le, yuv422p10le, yuv440p10le, yuv444p10le, yuv420p12le, yuv422p12le, yuv440p12le, yuv444p12le, gbrp, gbrp10le, gbrp12le ],
						},
					],
				},
			},
		],
	},
	{
		type: 'submenu',
		label: 'VP8',
		tooltip: 'VP8 - VP8 是一个由 On2 Technologies 开发并由 Google 发布的开放的影像压缩格式。',
		subMenu: [
			{
				type: 'normal',
				value: 'libvpx',
				label: '【默认】libvpx',
				tooltip: '',
				extra: {
					rateControl: [
						{ ...CRF(crf63slider) },
						{ ...ABR(vbitrateSlider) },
					],
					parameters: [
						{
							mode: "slider", parameter: "preset", display: "编码质量",
							max: 2,
							tags: new Map([
								[0, 'realtime'],
								[1, 'good'],
								[2, 'best'],
							]),
							sliderMode: 'string',
							default: 'good',
							valueToParam: (value) => value,
						},
						{
							mode: "combo", parameter: "pix_fmt", display: "像素格式",
							items: [ 自动, yuv420p, yuva420p ],
						},
					],
				},
			},
		],
	},
	{
		type: 'submenu',
		label: 'MPEG-4 (Part 2)',
		tooltip: 'MPEG-4 Part 2 - MPEG-4 是一套用于音频、视频信息的压缩编码标准，由国际标准化组织（ISO）和国际电工委员会（IEC）下属的“动态影像专家组”（Moving Picture Experts Group，即 MPEG）制定。该标准的第二部分为视频编解码器。',
		subMenu: [
			{
				type: 'normal',
				value: 'mpeg4',
				label: '【默认】mpeg4',
				tooltip: '',
				extra: {
					rateControl: [
						{ ...Q(q100slider) },
						{ ...ABR(vbitrateSlider) },
					],
					parameters: [
						{
							mode: "combo", parameter: "pix_fmt", display: "像素格式",
							items: [ 自动, yuv420p ],
						},
					],
				},
			},
			{
				type: 'normal',
				value: 'libxvid',
				label: 'libxvid',
				tooltip: '',
				extra: {
					rateControl: [
						{ ...Q(q100slider) },
						{ ...ABR(vbitrateSlider) },
					],
					parameters: [
						{
							mode: "combo", parameter: "pix_fmt", display: "像素格式",
							items: [ 自动, yuv420p ],
						},
					],
				},
			},
		],
	},
	{
		type: 'submenu',
		label: 'MPEG-2 (Part 2)',
		tooltip: 'MPEG-2 Part 2 - MPEG-2 是 MPEG 工作组于 1994 年发布的视频和音频压缩国际标准。MPEG-2 通常用来为广播信号提供视频和音频编码，包括卫星电视、有线电视等。MPEG-2 经过少量修改后，也成为 DVD 产品的核心技术。',
		subMenu: [
			{
				type: 'normal',
				value: 'mpeg2video',
				label: '【默认】mpeg2video',
				tooltip: '',
				extra: {
					rateControl: [
						{ ...Q(q100slider) },
						{ ...ABR(vbitrateSlider) },
					],
					parameters: [
						{
							mode: "combo", parameter: "pix_fmt", display: "像素格式",
							items: [ 自动, yuv420p, yuv422p ],
						},
					],
				},
			},
			{
				type: 'normal',
				value: 'mpeg2_qsv',
				label: 'mpeg2_qsv',
				tooltip: '',
				extra: {
					rateControl: [
						{ ...Q(q100slider) },
						{ ...ABR(vbitrateSlider) },
					],
					parameters: [
						{
							mode: "slider", parameter: "preset", display: "编码质量",
							...qsvPresetSlider,
						},
						{
							mode: "combo", parameter: 'profile:v', display: '规格',
							items: [ 自动, main, main10, mainsp ],
						},
						{
							mode: "combo", parameter: "pix_fmt", display: "像素格式",
							items: [ 自动, nv12, qsv ],
						},
					],
				},
			},
		],
	},
	{
		type: 'submenu',
		label: 'MPEG-1',
		tooltip: 'MPEG-1 - MPEG-1 是 MPEG 组织制定的第一个视频和音频有损压缩标准，也是最早推出及应用在市场上的 MPEG 技术。它采用了块方式的运动补偿、离散余弦变换（DCT）、量化等技术，并为 1.2Mbps 传输速率进行了优化，被 Video CD 采用作为核心技术。',
		subMenu: [
			{
				type: 'normal',
				value: 'mpeg1video',
				label: '【默认】mpeg1video',
				tooltip: '',
				extra: {
					rateControl: [
						{ ...Q(q100slider) },
						{ ...ABR(vbitrateSlider) },
					],
					parameters: [
						{
							mode: "combo", parameter: "pix_fmt", display: "像素格式",
							items: [ 自动, yuv420p, yuv422p ],
						},
					],
				},
			},
		],
	},
	{
		type: 'submenu',
		label: 'MJPEG',
		tooltip: 'MJPEG - MJPEG 即 Motion JPEG（Motion Joint Photographic Experts Group）是一种影像压缩格式，其中每一帧图像都分别使用 JPEG 编码。',
		subMenu: [
			{
				type: 'normal',
				value: 'mjpeg',
				label: '【默认】mjpeg',
				tooltip: '',
				extra: {
					rateControl: [
						{ ...Q(q100slider) },
						{ ...ABR(vbitrateSlider) },
					],
					parameters: [
						{
							mode: "combo", parameter: "pix_fmt", display: "像素格式",
							items: [ 自动, yuvj420p, yuvj422p, yuvj444p ],
						},
					],
				},
			},
			{
				type: 'normal',
				value: 'mjpeg_qsv',
				label: 'mjpeg_qsv',
				tooltip: '',
				extra: {
					rateControl: [
						{ ...ABR(vbitrateSlider) },
					],
					parameters: [
						{
							mode: "combo", parameter: "pix_fmt", display: "像素格式",
							items: [ 自动, nv12, qsv ],
						},
					],
				},
			},
		],
	},
	{
		type: 'submenu',
		label: 'WMV2 (WMV v8)',
		tooltip: 'WMV2 - WMV（Windows Media Video）是微软公司开发的一组数字影片编解码格式的通称，它是 Windows Media 架构下的一部分。WMV2 即 Windows Media Video v8',
		subMenu: [
			{
				type: 'normal',
				value: 'wmv2',
				label: '【默认】wmv2',
				tooltip: '',
				extra: {
					rateControl: [
						{ ...Q(q100slider) },
						{ ...ABR(vbitrateSlider) },
					],
					parameters: [
						{
							mode: "combo", parameter: "pix_fmt", display: "像素格式",
							items: [ 自动, yuvj420p ],
						},
					],
				},
			},
		],
	},
	{
		type: 'submenu',
		label: 'WMV1 (WMV v7)',
		tooltip: 'WMV1 - WMV（Windows Media Video）是微软公司开发的一组数字影片编解码格式的通称，它是 Windows Media 架构下的一部分。WMV1 即 Windows Media Video v7',
		subMenu: [
			{
				type: 'normal',
				value: 'wmv2',
				label: '【默认】wmv2',
				tooltip: '',
				extra: {
					rateControl: [
						{ ...Q(q100slider) },
						{ ...ABR(vbitrateSlider) },
					],
					parameters: [
						{
							mode: "combo", parameter: "pix_fmt", display: "像素格式",
							items: [ 自动, yuvj420p ],
						},
					],
				},
			},
		],
	},
	{
		type: 'submenu',
		label: 'RV20',
		tooltip: 'RV20 - RealVideo 是由 RealNetworks 于 1997 年所开发的一种专用视频压缩格式。RV20 使用 H.263 编码器。',
		subMenu: [
			{
				type: 'normal',
				value: 'rv20',
				label: '【默认】rv20',
				tooltip: '',
				extra: {
					rateControl: [
						{ ...Q(q100slider) },
						{ ...ABR(vbitrateSlider) },
					],
					parameters: [
						{
							mode: "combo", parameter: "pix_fmt", display: "像素格式",
							items: [ 自动, yuvj420p ],
						},
					],
				},
			},
		],
	},
	{
		type: 'submenu',
		label: 'RV10',
		tooltip: 'RV10 - RealVideo 是由 RealNetworks 于 1997 年所开发的一种专用视频压缩格式。RV10 使用 H.263 编码器。',
		subMenu: [
			{
				type: 'normal',
				value: 'rv10',
				label: '【默认】rv10',
				tooltip: '',
				extra: {
					rateControl: [
						{ ...Q(q100slider) },
						{ ...ABR(vbitrateSlider) },
					],
					parameters: [
						{
							mode: "combo", parameter: "pix_fmt", display: "像素格式",
							items: [ 自动, yuvj420p ],
						},
					],
				},
			},
		],
	},
	{
		type: 'submenu',
		label: 'Microsoft Video 1',
		tooltip: 'Microsoft Video 1 - Microsoft Video 1 is a vector quantizer video codec with frame differencing that operates in either a palettized 8-bit color space or a 16-bit RGB color space.',
		subMenu: [
			{
				type: 'normal',
				value: 'msvideo1',
				label: '【默认】msvideo1',
				tooltip: '',
				extra: {
					rateControl: [],
					parameters: [
						{
							mode: "combo", parameter: "pix_fmt", display: "像素格式",
							items: [ 自动, rgb555le ],
						},
					],
				},
			},
		],
	},
];

export const allVcodecs: MenuItem<VCodecDetail>[] = [];

// https://zh.wikipedia.org/wiki/显示分辨率列表
export const resolution: MenuItem[] = [
	{ type: 'normal', label: '不改变', value: '不改变', tooltip: '不改变分辨率' },
	{ type: 'submenu', label: '横向 16:9', subMenu: [
		{ type: 'normal', label: '7680×4320', value: '7680x4320', tooltip: 'UHD 8K, 33.2M 像素' },
		{ type: 'normal', label: '5120×2880', value: '5120x2880', tooltip: '5K, 14.7M 像素' },
		{ type: 'normal', label: '3840×2160', value: '3840x2160', tooltip: 'UHD 4K, 8.3M 像素' },
		{ type: 'normal', label: '2560×1440', value: '2560x1440', tooltip: 'QHD 2K, 3.7M 像素' },
		{ type: 'normal', label: '1920×1080', value: '1920x1080', tooltip: 'FHD, 2.0M 像素' },
		{ type: 'normal', label: '1280×720', value: '1280x720', tooltip: 'HD, 921.6K 像素' },
		{ type: 'normal', label: '960×540', value: '960x540', tooltip: 'qHD, 518.4K 像素' },
		{ type: 'normal', label: '640×360', value: '640x360', tooltip: '230.4K 像素' },
	] },
	{ type: 'submenu', label: '纵向 9:16', subMenu: [
		{ type: 'normal', label: '4320×7680', value: '4320x7680', tooltip: 'UHD 8K, 33.2M 像素' },
		{ type: 'normal', label: '2880×5120', value: '2880x5120', tooltip: '5K, 14.7M 像素' },
		{ type: 'normal', label: '2160×3840', value: '2160x3840', tooltip: 'UHD 4K, 8.3M 像素' },
		{ type: 'normal', label: '1440×2560', value: '1440x2560', tooltip: 'QHD 2K, 3.7M 像素' },
		{ type: 'normal', label: '1080×1920', value: '1080x1920', tooltip: 'FHD, 2.0M 像素' },
		{ type: 'normal', label: '720×1280', value: '720x1280', tooltip: 'HD, 921.6K 像素' },
		{ type: 'normal', label: '540×960', value: '540x960', tooltip: 'qHD, 518.4K 像素' },
		{ type: 'normal', label: '360×640', value: '360x640', tooltip: '230.4K 像素' },
	] },
	{ type: 'submenu', label: '数字电影联盟标准', subMenu: [
		{ type: 'normal', label: '8192×4320', value: '8192x4320', tooltip: 'DCI 8K, 35.4M 像素' },
		{ type: 'normal', label: '4096×2160', value: '4096x2160', tooltip: 'DCI 4K, 8.8M 像素' },
		{ type: 'normal', label: '2048×1080', value: '2048x1080', tooltip: 'DCI 2K, 2.2M 像素' },
	] },
	{ type: 'submenu', label: '电脑显示标准', subMenu: [
		{ type: 'normal', label: '10240×4320', value: '10240x4320', tooltip: '(64:27), 44.2M 像素' },
		{ type: 'normal', label: '7680×4320', value: '7680x4320', tooltip: 'UHD 8K (16:9), 33.2M 像素' },
		{ type: 'normal', label: '6144×3456', value: '6144x3456', tooltip: '(16:9), 21.2M 像素' },
		{ type: 'normal', label: '5760×3240', value: '5760x3240', tooltip: '(16:9), 18.7M 像素' },
		{ type: 'normal', label: '5120×3200', value: '5120x3200', tooltip: 'WHXGA (8:5), 16.4M 像素' },
		{ type: 'normal', label: '4096×3072', value: '4096x3072', tooltip: '(4:3), 12.6M 像素' },
		{ type: 'normal', label: '5120×2880', value: '5120x2880', tooltip: '5K (16:9), 14.7M 像素' },
		{ type: 'normal', label: '3840×2560', value: '3840x2560', tooltip: '(3:2), 9.8M 像素' },
		{ type: 'normal', label: '3840×2400', value: '3840x2400', tooltip: 'WQUXGA (8:5), 9.2M 像素' },
		{ type: 'normal', label: '3200×2400', value: '3200x2400', tooltip: '(4:3), 7.7M 像素' },
		{ type: 'normal', label: '5120×2160', value: '5120x2160', tooltip: 'UW5K (64:27), 11.1M 像素' },
		{ type: 'normal', label: '3840×2160', value: '3840x2160', tooltip: 'UHD 4K (16:9), 8.3M 像素' },
		{ type: 'normal', label: '3240×2160', value: '3240x2160', tooltip: '(3:2), 7.0M 像素' },
		{ type: 'normal', label: '2880×2160', value: '2880x2160', tooltip: '(4:3), 6.2M 像素' },
		{ type: 'normal', label: '2880×1920', value: '2880x1920', tooltip: '(3:2), 5.5M 像素' },
		{ type: 'normal', label: '2560×1920', value: '2560x1920', tooltip: '(4:3), 4.9M 像素' },
		{ type: 'normal', label: '3200×1800', value: '3200x1800', tooltip: 'WQXGA+ (16:9), 5.8M 像素' },
		{ type: 'normal', label: '2560×1600', value: '2560x1600', tooltip: 'WQXGA (8:5), 4.1M 像素' },
		{ type: 'normal', label: '2400×1600', value: '2400x1600', tooltip: '(3:2), 3.8M 像素' },
		{ type: 'normal', label: '2048×1536', value: '2048x1536', tooltip: 'QXGA (4:3), 3.1M 像素' },
		{ type: 'normal', label: '5120×1440', value: '5120x1440', tooltip: 'UWQHD (32:9), 7.4M 像素' },
		{ type: 'normal', label: '3440×1440', value: '3440x1440', tooltip: 'UWQHD (43:18), 5.0M 像素' },
		{ type: 'normal', label: '2560×1440', value: '2560x1440', tooltip: 'QHD 2K (16:9), 3.7M 像素' },
		{ type: 'normal', label: '1920×1440', value: '1920x1440', tooltip: '(4:3), 2.8M 像素' },
		{ type: 'normal', label: '1920×1280', value: '1920x1280', tooltip: '(3:2), 2.5M 像素' },
		{ type: 'normal', label: '1920×1200', value: '1920x1200', tooltip: 'WUXGA (8:5), 2.3M 像素' },
		{ type: 'normal', label: '1600×1200', value: '1600x1200', tooltip: 'UXGA (4:3), 1.9M 像素' },
		{ type: 'normal', label: '2048×1152', value: '2048x1152', tooltip: 'QWXGA (16:9), 2.4M 像素' },
		{ type: 'normal', label: '1536×1152', value: '1536x1152', tooltip: '(4:3), 1.8M 像素' },
		{ type: 'normal', label: '3840×1080', value: '3840x1080', tooltip: '(32:9), 4.1M 像素' },
		{ type: 'normal', label: '2560×1080', value: '2560x1080', tooltip: 'UWFHD (64:27), 2.8M 像素' },
		{ type: 'normal', label: '2160×1080', value: '2160x1080', tooltip: '(2:1), 2.3M 像素' },
		{ type: 'normal', label: '1920×1080', value: '1920x1080', tooltip: 'FHD (16:9), 2.0M 像素' },
		{ type: 'normal', label: '1440×1080', value: '1440x1080', tooltip: '(4:3), 1.5M 像素' },
		{ type: 'normal', label: '1680×1050', value: '1680x1050', tooltip: 'WSXGA+ (3:2), 1.8M 像素' },
		{ type: 'normal', label: '1280×1024', value: '1280x1024', tooltip: 'SXGA (5:4), 1.3M 像素' },
		{ type: 'normal', label: '1440×960', value: '1440x960', tooltip: 'FWXGA+ (3:2), 1.4M 像素' },
		{ type: 'normal', label: '1280×960', value: '1280x960', tooltip: 'QVGA (4:3), 1.2M 像素' },
		{ type: 'normal', label: '1600×900', value: '1600x900', tooltip: 'HD+ (16:9), 1.4M 像素' },
		{ type: 'normal', label: '1440×900', value: '1440x900', tooltip: 'WXGA+ (8:5), 1.3M 像素' },
		{ type: 'normal', label: '1200×900', value: '1200x900', tooltip: '(4:3), 1.1M 像素' },
		{ type: 'normal', label: '1280×800', value: '1280x800', tooltip: 'WXGA (8:5), 1.0M 像素' },
		{ type: 'normal', label: '1366×768', value: '1366x768', tooltip: 'FWXGA, 1.0M 像素' },
		{ type: 'normal', label: '1152×768', value: '1152x768', tooltip: 'WXGA (3:2), 884.7K 像素' },
		{ type: 'normal', label: '1024×768', value: '1024x768', tooltip: 'XGA (4:3), 786.4K 像素' },
		{ type: 'normal', label: '1280×720', value: '1280x720', tooltip: 'HD (16:9), 921.6K 像素' },
		{ type: 'normal', label: '1152×720', value: '1152x720', tooltip: '(8:5), 829.4K 像素' },
		{ type: 'normal', label: '960×720', value: '960x720', tooltip: '(4:3), 691.2K 像素' },
		{ type: 'normal', label: '1024×640', value: '1024x640', tooltip: '(8:5), 655.4K 像素' },
		{ type: 'normal', label: '960×640', value: '960x640', tooltip: 'DVGA (3:2), 614.4K 像素' },
		{ type: 'normal', label: '800×600', value: '800x600', tooltip: 'SVGA (4:3), 480.0K 像素' },
		{ type: 'normal', label: '1024×576', value: '1024x576', tooltip: 'WSVGA (16:9), 589.8K 像素' },
		{ type: 'normal', label: '720×576', value: '720x576', tooltip: 'PAL, 414.7K 像素' },
		{ type: 'normal', label: '704×576', value: '704x576', tooltip: 'D1 (11:9), 405.5K 像素' },
		{ type: 'normal', label: '960×540', value: '960x540', tooltip: 'qHD (16:9), 518.4K 像素' },
		{ type: 'normal', label: '854×480', value: '854x480', tooltip: 'FWVGA (16:9), 409.9K 像素' },
		{ type: 'normal', label: '800×480', value: '800x480', tooltip: 'WVGA (5:3), 384.0K 像素' },
		{ type: 'normal', label: '720×480', value: '720x480', tooltip: 'NTSC (4:3), 345.6K 像素' },
		{ type: 'normal', label: '640×480', value: '640x480', tooltip: 'VGA (4:3), 307.2K 像素' },
		{ type: 'normal', label: '640×400', value: '640x400', tooltip: 'QCGA (8:5), 256.0K 像素' },
		{ type: 'normal', label: '480×360', value: '480x360', tooltip: '(4:3), 172.8K 像素' },
		{ type: 'normal', label: '480×320', value: '480x320', tooltip: 'HVGA (3:2), 153.6K 像素' },
		{ type: 'normal', label: '352×288', value: '352x288', tooltip: 'CIF (11:9), 101.3K 像素' },
		{ type: 'normal', label: '400×240', value: '400x240', tooltip: 'WqVGA (5:3), 96.0K 像素' },
		{ type: 'normal', label: '320×240', value: '320x240', tooltip: 'qVGA (4:3), 76.8K 像素' },
		{ type: 'normal', label: '320×200', value: '320x200', tooltip: 'CGA (8:5), 64.0K 像素' },
		{ type: 'normal', label: '240×160', value: '240x160', tooltip: 'HqVGA (3:2), 38.4K 像素' },
		{ type: 'normal', label: '176×144', value: '176x144', tooltip: 'qCIF (11:9), 25.3K 像素' },
		{ type: 'normal', label: '160×120', value: '160x120', tooltip: 'qqVGA (4:3), 19.2K 像素' },
	] },
];

export const framerate: MenuItem[] = [
	{ type: 'normal', label: '不改变', value: '不改变', tooltip: '按源平均帧率输出' },
	{ type: 'submenu', label: '常见帧率', subMenu: [
		{ type: 'normal', label: '1920', value: '1920', tooltip: '1920p' },
		{ type: 'normal', label: '960', value: '960', tooltip: '960p' },
		{ type: 'normal', label: '480', value: '480', tooltip: '480p' },
		{ type: 'normal', label: '240', value: '240', tooltip: '240p' },
		{ type: 'normal', label: '144', value: '144', tooltip: '144p' },
		{ type: 'normal', label: '120', value: '120', tooltip: '120p' },
		{ type: 'normal', label: '90', value: '90', tooltip: '90p' },
		{ type: 'normal', label: '75', value: '75', tooltip: '75p' },
		{ type: 'normal', label: '60', value: '60', tooltip: '60p（常见屏幕刷新率）' },
		{ type: 'normal', label: '50', value: '50', tooltip: '50p' },
		{ type: 'normal', label: '30', value: '30', tooltip: '30p' },
		{ type: 'normal', label: '25', value: '25', tooltip: '25p（PAL 帧频）' },
		{ type: 'normal', label: '24', value: '24', tooltip: '24p（常见电影制作标准）' },
		{ type: 'normal', label: '15', value: '15', tooltip: '15p' },
		{ type: 'normal', label: '12', value: '12', tooltip: '12p' },
		{ type: 'normal', label: '10', value: '10', tooltip: '卡成 PPT' },
		{ type: 'normal', label: '5', value: '5', tooltip: '卡成 WPS Presentation' },
		{ type: 'normal', label: '3', value: '3', tooltip: '三帧极致' },
		{ type: 'normal', label: '2', value: '2', tooltip: '二帧流畅' },
		{ type: 'normal', label: '1', value: '1', tooltip: '一帧能玩' },
	] },
	{ type: 'submenu', label: '隔行扫描', tooltip: '上场优先的隔行扫描\n注意 ffmpeg 将先处理帧率，再将每帧扩展为上下场，因此您无法使用此方法进行常规的逐行转隔行处理', subMenu: [
		{ type: 'normal', label: '60i', value: '60i', tooltip: '场频 60，帧频 30' },
		{ type: 'normal', label: '50i', value: '50i', tooltip: '场频 50，帧频 25' },
	] },
	{ type: 'submenu', label: '慎用帧率', tooltip: '', subMenu: [
		{ type: 'submenu', label: 'NTSC 邪教帧率', tooltip: '由美国国家电视标准委员会（NTSC）推出的相关帧率标准', subMenu: [
			{ type: 'submenu', label: '重要信息 1', tooltip: '在 NTSC 早期标准（1941）中，帧率为 30 帧/秒。\n在后来的标准（1953）中，色度信号的引入容易导致音频信号与视频信号发生串扰，故将帧率降低 0.1%，即降低到 29.97 帧/秒。\nwikipedia\nIn December 1953, the FCC unanimously approved what is now called the NTSC color television standard (later defined as RS-170a). The compatible color standard retained full backward compatibility with then-existing black-and-white television sets. Color information was added to the black-and-white image by introducing a color subcarrier of precisely 315/88 MHz (usually described as 3.579545 MHz±10 Hz). The precise frequency was chosen so that horizontal line-rate modulation components of the chrominance signal fall exactly in between the horizontal line-rate modulation components of the luminance signal, such that the chrominance signal could easily be filtered out of the luminance signal on new television sets, and that it would be minimally visible in existing televisions. Due to limitations of frequency divider circuits at the time the color standard was promulgated, the color subcarrier frequency was constructed as composite frequency assembled from small integers, in this case 5×7×9/(8×11) MHz. The horizontal line rate was reduced to approximately 15,734 lines per second (3.579545×2/455 MHz = 9/572 MHz) from 15,750 lines per second, and the frame rate was reduced to 30/1.001 ≈ 29.970 frames per second (the horizontal line rate divided by 525 lines/frame) from 30 frames per second. These changes amounted to 0.1 percent and were readily tolerated by then-existing television receivers.', subMenu: [
				{ type: 'submenu', label: '重要信息 2', tooltip: '该方案为旧时代工程师在对应时代受电气特性限制为黑白电视与彩色电视所实现的兼容性设计。\n请注意，使用 NTSC 标准的美国电台已于 2021-07-13 全数进行了切换，即不再有电台使用该标准。\n故除非有极其特殊的场合，均不应再大规模应用该帧率。', subMenu: [
					{ type: 'submenu', label: '重要信息 3', tooltip: '非整数倍的帧率在非线性编辑软件中往往容易产生问题，如跳帧或重复帧、素材偏移或无法对齐等。\n您使用了 FFBox，代表了您已使用数字形式进行多媒体信息的处理，无需按照模拟信号时代的标准处理素材。', subMenu: [
						{ type: 'submenu', label: '重要信息 4', tooltip: '如果您使用的是部分日本相机品牌（如索尼、佳能等）制造的微单相机，或部分中国相机品牌（如大疆），您可能会发现相机中仅有 29.97 帧/秒相关的选项，或者界面上显示为 30 帧/秒但实际摄录帧率为 29.97 帧/秒的情况。\n这种情况是厂商设计有误所致，往往会对后期素材的剪辑工作流造成严重影响。\n您可尝试联系厂商修复此问题，或自行编写相机操作系统刷入机身以解决此问题。', subMenu: [
							{ type: 'submenu', label: '重要信息 5', tooltip: '如果无法进行此操作，建议将素材先以某种方式处理成 30 帧/秒相关的倍数再进行后续操作。', subMenu: [
								{ type: 'submenu', label: '重要信息 6', tooltip: '如您已知悉上述重要提示，并执意要使用此类帧率，请选择。', subMenu: [
									{ type: 'normal', label: '29.97', value: '29.97', tooltip: '29.97p' },
									{ type: 'normal', label: '23.976', value: '23.976', tooltip: '23.976p' },
									{ type: 'normal', label: '59.94', value: '59.94', tooltip: '59.94p' },
									{ type: 'normal', label: '119.88', value: '119.88', tooltip: '119.88p' },
								] },
							] },
						] },
					] },
				] },
			] },
		] },
	] },
];

export function getVideoFFmpegParam(videoParams: OutputParams_video) {
	const ret = [];
	let strict2 = false;
	let flags = '';
	if (videoParams.vcodec === '禁用') {
		ret.push('-vn');
	} else if (videoParams.vcodec === 'copy') {
		ret.push('-vcodec');
		ret.push('copy');
	} else if (videoParams.vcodec && videoParams.vcodec !== '自动') {
		ret.push('-vcodec');
		ret.push(videoParams.vcodec);
		let vcodecItem = getMenuItemByValue(builtInVcodecs, videoParams.vcodec) as any;
		if (!vcodecItem) {
			vcodecItem = getMenuItemByValue(allVcodecs, videoParams.vcodec) as any;
		}
		const vcodecDetail = (vcodecItem?.extra) as VCodecDetail;
		if (vcodecDetail) {
			if (vcodecDetail.strict2) {
				strict2 = true;
			}
			if (!videoParams.detail) videoParams.detail = {};	// 这会改变 outputParams，但从类型定义上来说不应该会执行这一条，这里的处理是防范外部 API 调用不遵守规范
			for (const parameter of vcodecDetail.parameters || []) {
				if (parameter.optional && videoParams.detail[parameter.parameter] === undefined) {
					continue;
				}
				if (parameter.mode === 'combo') {
					if (videoParams.detail[parameter.parameter] && videoParams.detail[parameter.parameter] != '默认' && videoParams.detail[parameter.parameter] != '自动') {
						ret.push('-' + parameter.parameter);
						ret.push(videoParams.detail[parameter.parameter]);
					}
					// 检查参数项是否有 strict2 标记
					const item = parameter.items.find((item) => item.value === videoParams.detail[parameter.parameter]);
					if (item?.strict2) {
						strict2 = true;
					}
				} else if (parameter.mode == 'slider') {
					ret.push('-' + parameter.parameter);
					const floatValue = videoParams.detail[parameter.parameter];
					const value = parameter.valueToParam ? parameter.valueToParam(floatValue) : floatValue;
					ret.push(value);
				} else if (parameter.mode === 'switch') {
					if (videoParams.detail[parameter.parameter] !== undefined) {
						ret.push('-' + parameter.parameter);
						ret.push(videoParams.detail[parameter.parameter]);
					}
				} else if (parameter.mode === 'text') {
					if (videoParams.detail[parameter.parameter] && videoParams.detail[parameter.parameter] != '默认' && videoParams.detail[parameter.parameter] != '自动') {
						ret.push('-' + parameter.parameter);
						ret.push(videoParams.detail[parameter.parameter]);
					}
				}
			}
							// 调试用↓
							// ret.push('-threads')
							// ret.push('1')
							// 调试用↑
			const ratecontrolItem = (vcodecDetail.rateControl || []).find((item) => item.type === 'normal' && item.value === videoParams.ratecontrol) as any;
			if (ratecontrolItem) {
				const ratecontrol = ratecontrolItem.extra as RateControl;
				// 计算值
				const floatValue = videoParams.ratevalue;
				const value = ratecontrol.valueToParam(floatValue);
				// 将值插入参数列表中
				for (const item of ratecontrol.cmd) {
					if (item === VALUE) {
						ret.push(value);
					} else {
						ret.push(item);
					}
				}
			}
			if (strict2) {
				ret.push('-strict');
				ret.push('-2');
			}
			// 设置通用参数
			if (videoParams.resolution && videoParams.resolution !== '不改变') {
				ret.push('-s');
				ret.push(videoParams.resolution);
			}
			if (videoParams.framerate && videoParams.framerate !== '不改变') {
				if (videoParams.framerate.includes('i') && videoParams.framerate.match(/^\d+(.\d+)?i?$/)) {
					const fieldrate = Number(videoParams.framerate.match(/^(\d+(.\d+)?)/)[0]);
					ret.push('-r');
					ret.push(fieldrate / 2);	
					flags += '+ilme+ildct';
				} else {
					ret.push('-r');
					ret.push(videoParams.framerate);
				}
			}
			if (flags) {
				ret.push('-flags:v');
				ret.push(flags);
			}
		}
	} // 如果编码为自动，则不设置 vcodec 参数，返回空 Array
	if (videoParams.custom) {
		ret.push(...videoParams.custom.split(' '));
	}
	return ret;
}

// 获取 ratecontrol 方面的参数，主要是给 taskitem 用
export function getVideoRateControlParam(videoParams: OutputParams_video) {
	let ret = {
		mode: '-',
		value: '-'
	};
	if (!videoParams || videoParams.vcodec == '禁用' || videoParams.vcodec == 'copy' || videoParams.vcodec == '自动') {
		return ret;
	} else {
		const vcodecItem = getMenuItemByValue(builtInVcodecs, videoParams.vcodec) as any;
		const vcodecDetail = (vcodecItem?.extra) as VCodecDetail;
		if (!vcodecDetail || !vcodecDetail.rateControl?.length) {
			return ret;
		}
		// 找到 ratecontrol 参数
		const ratecontrolItem = vcodecDetail.rateControl.find((item) => {
			return item.type === 'normal' && item.value == videoParams.ratecontrol;
		}) as any;
		if (ratecontrolItem) {
			const ratecontrol = ratecontrolItem.extra as RateControl;
			// 计算值
			const floatValue = videoParams.ratevalue;
			const value = (() => {
				const vtt = ratecontrol.valueToDisplay;
				if (vtt instanceof Function) {
					return vtt(floatValue);
				} else {
					if (vtt.type === 'bitrate') {
						const bps = Math.round(vtt.base * 2 ** (floatValue as number));
						if (window.frontendSettings.useIEC) {
							if (bps >= 10 * 1024 ** 2) {
								return (bps / 1024 ** 2).toFixed(1) + ' Mibps';
							} else {
								return (bps / 1024).toFixed(0) + ' kibps';
							}
						} else {
							if (bps >= 10 * 1000 ** 2) {
								return (bps / 1000 ** 2).toFixed(1) + ' Mbps';
							} else {
								return (bps / 1000).toFixed(0) + ' kbps';
							}
						}
					} else if (vtt.type === 'integer') {
						return floatValue + '';
					} else if (vtt.type === 'revertInteger') {
						return ratecontrol.max - +floatValue + '';
					}
				}
			})();
			ret = { mode: ratecontrolItem.value, value };
		}
		return ret;
	}
}
