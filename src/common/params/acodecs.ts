import { getMenuItemByValue, MenuItem, NarrowedMenuItem } from "@common/menu";
import { OutputParams_audio } from "../types";
import { strict2, SliderOptions, Parameter, RateControl } from './parameter';

const VALUE = Symbol()

export interface ACodecDetail {
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

const Q = (extra: any) => ({
	type: 'normal' as const,
	value: 'Q',
	label: 'Q',
	tooltip: '指定音频质量',
	extra: {
		cmd: ['-q:a', VALUE],
		...extra,
	},
});
const CBR_ABR = (extra: any) => ({
	type: 'normal' as const,
	value: 'CBR',
	label: 'CBR',
	tooltip: '指定预期码率大小',
	extra: {
		cmd: ['-b:a', VALUE],
		...extra,
	},
});

// #endregion

// #region 预置 slider

const abitrateSlider: SliderOptions = {
	max: 6,
	arrowKeyStep: 18,
	tags: new Map([
		[0, '8 Kbps'],
		[1, '16 Kbps'],
		[2, '32 Kbps'],
		[3, '64 Kbps'],
		[4, '128 Kbps'],
		[5, '256 Kbps'],
		[6, '512 Kbps']
	]),
	default: 4,
	valueToDisplay: { base: 8000, type: 'bitrate' },
	valueToParam: (value: number) => {
		return Math.round(8 * Math.pow(2, value)) + "k"
	}
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

// #endregion

// #region 预置音频采样率

const [ sr_96000 ,  sr_88200 ,  sr_64000 ,  sr_48000 ,  sr_44100 ,  sr_32000 ,  sr_24000 ,  sr_22050 ,  sr_16000 ,  sr_12000 ,  sr_11025 ,  sr_8000 ,  sr_7350 ] =
	  ['sr_96000', 'sr_88200', 'sr_64000', 'sr_48000', 'sr_44100', 'sr_32000', 'sr_24000', 'sr_22050', 'sr_16000', 'sr_12000', 'sr_11025', 'sr_8000', 'sr_7350'].map((n) => ({
		type: 'normal' as const, 
		value: n, label: `${n} Hz`,
		tooltip: '',
	  }));

// #endregion

// #region 预置声道布局

const [lo_mono, lo_stereo, lo_2_1, lo_3_0, lo_3_0_back, lo_4_0, lo_quad, lo_quad_side, lo_3_1, lo_5_0, lo_5_0_side, lo_4_1, lo_5_1, lo_5_1_side, lo_6_0, lo_6_0_front, lo_hexagonal, lo_6_1, lo_6_1_back, lo_6_1_front, lo_7_0, lo_7_0_front, lo_7_1, lo_7_1_wide, lo_7_1_wide_side, lo_octagonal, lo_hexadecagonal, lo_downmix] =
	[
		['mono', '单声道\nFC'],
		['stereo', '立体声\nFL+FR'],
		['2.1', '左右前置 + 重低音\nFL+FR+LFE'],
		['3.0', '左右前置 + 前中置\nFL+FR+FC'],
		['3.0(back)', '左右前置 + 后中置\nFL+FR+BC'],
		['4.0', '左右前置 + 前后中置\nFL+FR+FC+BC'],
		['quad', '左右前置 + 左右后置\nFL+FR+BL+BR'],
		['quad(side)', '左右前置 + 左右侧置\nFL+FR+SL+SR'],
		['3.1', '左中右前置 + 重低音\nFL+FR+FC+LFE'],
		['5.0', '左中右前置 + 左右后置\nFL+FR+FC+BL+BR'],
		['5.0(side)', '左中右前置 + 左右侧置\nFL+FR+FC+SL+SR'],
		['4.1', '左右前置 + 前后中置 + 重低音\nFL+FR+FC+LFE+BC'],
		['5.1', '左中右前置 + 左右后置 + 重低音\nFL+FR+FC+LFE+BL+BR'],
		['5.1(side)', '左中右前置 + 左右侧置 + 重低音\nFL+FR+FC+LFE+SL+SR'],
		['6.0', '左右前置 + 前后中置 + 左右侧置\nFL+FR+FC+BC+SL+SR'],
		['6.0(front)', 'FL+FR+FLC+FRC+SL+SR'],
		['hexagonal', '左中右前置 + 左中右后置\nFL+FR+FC+BL+BR+BC'],
		['6.1', '左右前置 + 前后中置 + 左右侧置 + 重低音\nFL+FR+FC+LFE+BC+SL+SR'],
		['6.1(back)', '左中右前置 + 左中右后置 + 重低音\nFL+FR+FC+LFE+BL+BR'],
		['6.1(front)', 'FL+FR+LF+FLC+FRC+SL+SR'],
		['7.0', '左右前置 + 前后中置 + 左右侧置\nFL+FR+FC+BC+SL+SR'],
		['7.0(front)', 'FL+FR+FLC+FRC+SL+SR'],
		['7.1', '左中右前置 + 左右后置 + 前后中置 + 重低音\nFL+FR+FC+LFE+BL+BR+BC'],
		['7.1(wide)', '左中右前置 + 左右后置 + 前后中置 + 重低音 + 宽声道\nFL+FR+FC+LFE+BL+BR+BC'],
		['7.1(wide,side)', '左中右前置 + 左右后置 + 前后中置 + 重低音 + 宽声道侧置\nFL+FR+FC+LFE+BL+BR+BC'],
		['octagonal', '八边形环绕声道布局\nFL+FR+C+BLS+BRS+BLC+BRC'],
		['hexadecagonal', '十六边形环绕声道布局\nFL1, FL2, FR1, FR2, FC, BLS, BRS, BLC, BRC, LFE1, LFE2'],
		['downmix', 'DL+DR'],
	].map(([value, tooltip]) => ({
		type: 'normal' as const,
		value, label: value,
		tooltip,
	}));

// #endregion

export const volSlider: SliderOptions = {
	min: -48,
	max: 48,
	tags: new Map([
		[-48, '-48 dB'],
		[-36, '-36 dB'],
		[-24, '-24 dB'],
		[-12, '-12 dB'],
		[0, '0 dB'],
		[12, '+12 dB'],
		[24, '+24 dB'],
		[36, '+36 dB'],
		[48, '+48 dB'],
	]),
	default: 0,
	valueToDisplay: (value: number) => {
		if (value > 0) {
			return '+ ' + value + ' dB';
		} else {
			return value + ' dB';
		}
	},
	adsorption: 'int',
	valueToParam: (value: number) => {
		return Math.round(256 * Math.pow(10, (value) / 20));
	}
}

export const builtInAcodecs: MenuItem<ACodecDetail>[] = [
	{
		type: 'submenu',
		label: 'OPUS',
		tooltip: 'OPUS - Opus 是一个有损声音编码的格式，由 Xiph.Org 基金会开发，之后由互联网工程任务组进行标准化，目标是希望用单一格式包含声音和语音，取代 Speex 和 Vorbis，且适用于网络上低延迟的即时声音传输，标准格式定义于 RFC 6716 文件。Opus 格式是一个开放格式，使用上没有任何专利或限制。',
		subMenu: [
			{
				type: 'normal',
				value: 'opus',
				label: '【默认】opus',
				tooltip: '',
				extra: {
					rateControl: [
						{ ...Q(q100slider) },
						{ ...CBR_ABR(abitrateSlider) },
					],
					parameters: [
						{
							mode: "combo", parameter: "ar", display: "采样频率",
							items: [ 自动, sr_48000 ],
						},
						{
							mode: "combo", parameter: "channel_layout", display: "声道布局",
							items: [ 自动, lo_mono, lo_stereo ],
						},
					],
					strict2: true,
				},
			},
			{
				type: 'normal',
				value: 'libopus',
				label: 'libopus',
				tooltip: '',
				extra: {
					rateControl: [
						{ ...Q(q100slider) },
						{ ...CBR_ABR(abitrateSlider) },
					],
					parameters: [
						{
							mode: "combo", parameter: "ar", display: "采样频率",
							items: [ 自动, sr_48000, sr_24000, sr_16000, sr_12000, sr_8000 ],
						},
					],
					strict2: true,
				},
			},
		],
	},
	{
		type: 'submenu',
		label: 'AAC',
		tooltip: 'AAC - AAC 即 Advanced Audio Coding，高级音频编码，出现于 1997 年，为一种基于 MPEG-2 的有损数字音频压缩的专利音频编码标准，由 Fraunhofer IIS、杜比实验室、AT&T、Sony、Nokia 等公司共同开发。2000 年，MPEG-4 标准在原本的基础上加上了 PNS（Perceptual Noise Substitution）等技术，并提供了多种扩展工具。为了区别于传统的MPEG-2 AAC 又称为 MPEG-4 AAC。其作为 MP3 的后继者而被设计出来，在相同的比特率之下，AAC 相较于 MP3 通常可以达到更好的声音质量。',
		subMenu: [
			{
				type: 'normal',
				value: 'aac',
				label: '【默认】aac',
				tooltip: '',
				extra: {
					rateControl: [
						{ ...Q(q100slider) },
						{ ...CBR_ABR(abitrateSlider) },
					],
					parameters: [
						{
							mode: "combo", parameter: "ar", display: "采样频率",
							items: [ 自动, sr_96000, sr_88200, sr_64000, sr_48000, sr_44100, sr_32000, sr_24000, sr_22050, sr_16000, sr_12000, sr_11025, sr_8000, sr_7350 ],
						},
						{
							mode: "combo", parameter: "aac_coder", display: "编码算法",
							items: [
								自动,
								{
									type: 'normal',
									value: 'anmr',
									label: 'anmr',
									tooltip: 'ANMR method',
									strict2: true,	// TODO 类型不科学
								},
								{
									type: 'normal',
									value: 'twoloop',
									label: 'twoloop',
									tooltip: 'Two loop searching method',
								},
								{
									type: 'normal',
									value: 'fast',
									label: 'fast（默认）',
									tooltip: 'Default fast search',
								},
							],
						},
					],
				},
			},
		],
	},
	{
		type: 'submenu',
		label: 'Vorbis (OGG)',
		tooltip: 'Vorbis - Vorbis 是一种有损音频压缩格式，由 Xiph.Org 基金会所领导并开放源代码的一个免费的开源软件项目。该项目为有损音频压缩产生音频编码格式和软件参考编码器╱解码器（编解码器）。Vorbis 通常以 Ogg 作为容器格式，所以常合称为 Ogg Vorbis。',
		subMenu: [
			{
				type: 'normal',
				value: 'vorbis',
				label: '【默认】vorbis',
				tooltip: '',
				extra: {
					rateControl: [
						{ ...Q(q100slider) },
						{ ...CBR_ABR(abitrateSlider) },
					],
					parameters: [],
					strict2: true,
				},
			},
			{
				type: 'normal',
				value: 'libvorbis',
				label: 'libvorbis',
				tooltip: '',
				extra: {
					rateControl: [
						{ ...Q(q100slider) },
						{ ...CBR_ABR(abitrateSlider) },
					],
					parameters: [],
					strict2: true,
				},
			},
		],
	},
	{
		type: 'submenu',
		label: 'MP3',
		tooltip: 'MP3 - MP3 即 MPEG-1 Audio Layer Ⅲ，是当今流行的一种数字音频编码和有损压缩格式，它被设计来大幅降低音频数据量，通过舍弃 PCM 音频数据中对人类听觉不重要的部分，达成压缩成较小文件的目的。而对于大多数用户的听觉感受来说，MP3 的音质与最初的不压缩音频相比没有明显的下降。',
		subMenu: [
			{
				type: 'normal',
				value: 'libmp3lame',
				label: '【默认】libmp3lame',
				tooltip: '',
				extra: {
					rateControl: [
						{ ...Q(q100slider) },
						{ ...CBR_ABR(abitrateSlider) },
					],
					parameters: [
						{
							mode: "combo", parameter: "ar", display: "采样频率",
							items: [ 自动, sr_48000, sr_44100, sr_32000, sr_24000, sr_22050, sr_16000, sr_12000, sr_11025, sr_8000 ],
						},
						{
							mode: "combo", parameter: "channel_layout", display: "声道布局",
							items: [ 自动, lo_mono, lo_stereo ],
						},	
					],
				},
			},
			{
				type: 'normal',
				value: 'libshine',
				label: 'libshine',
				tooltip: '',
				extra: {
					rateControl: [
						{ ...Q(q100slider) },
						{ ...CBR_ABR(abitrateSlider) },
					],
					parameters: [
						{
							mode: "combo", parameter: "ar", display: "采样频率",
							items: [ 自动, sr_48000, sr_44100, sr_32000 ],
						},
						{
							mode: "combo", parameter: "channel_layout", display: "声道布局",
							items: [ 自动, lo_mono, lo_stereo ],
						},	
					],
				},
			},
		],
	},
	{
		type: 'submenu',
		label: 'MP2',
		tooltip: 'MP2 - MP2 即 MPEG-1 Audio Layer Ⅱ。个人电脑和互联网音乐流行 MP3，MP2 则多用于广播。',
		subMenu: [
			{
				type: 'normal',
				value: 'mp2',
				label: '【默认】mp2',
				tooltip: '',
				extra: {
					rateControl: [
						{ ...Q(q100slider) },
						{ ...CBR_ABR(abitrateSlider) },
					],
					parameters: [
						{
							mode: "combo", parameter: "ar", display: "采样频率",
							items: [ 自动, sr_48000, sr_44100, sr_32000, sr_24000, sr_22050, sr_16000 ],
						},
						{
							mode: "combo", parameter: "channel_layout", display: "声道布局",
							items: [ 自动, lo_mono, lo_stereo ]
						},
					],
				},
			},
			{
				type: 'normal',
				value: 'mp2fixed',
				label: 'mp2fixed',
				tooltip: '',
				extra: {
					rateControl: [
						{ ...Q(q100slider) },
						{ ...CBR_ABR(abitrateSlider) },
					],
					parameters: [
						{
							mode: "combo", parameter: "ar", display: "采样频率",
							items: [ 自动, sr_48000, sr_44100, sr_32000, sr_24000, sr_22050, sr_16000 ],
						},
						{
							mode: "combo", parameter: "channel_layout", display: "声道布局",
							items: [ 自动, lo_mono, lo_stereo ]
						},
					],
				},
			},
			{
				type: 'normal',
				value: 'libtwolame',
				label: 'libtwolame',
				tooltip: '',
				extra: {
					rateControl: [
						{ ...Q(q100slider) },
						{ ...CBR_ABR(abitrateSlider) },
					],
					parameters: [
						{
							mode: "combo", parameter: "ar", display: "采样频率",
							items: [ 自动, sr_48000, sr_44100, sr_32000, sr_24000, sr_22050, sr_16000 ],
						},
						{
							mode: "combo", parameter: "mode", display: "声道模式",
							items: [
								自动,
								{
									type: 'normal',
									value: 'stereo',
									label: 'stereo',
									tooltip: '立体声',
								},
								{
									type: 'normal',
									value: 'joint_stereo',
									label: 'joint_stereo',
									tooltip: '联合立体声',
								},
								{
									type: 'normal',
									value: 'dual_channel',
									label: 'dual_channel',
									tooltip: '双声道',
								},
								{
									type: 'normal',
									value: 'mono',
									label: 'mono',
									tooltip: '单声道',
								},
							]
						},
					],
				},
			},
		],
	},
	{
		type: 'submenu',
		label: 'AC3',
		tooltip: 'AC3 - AC3 即杜比数字音频编码。杜比数字（Dolby Digital）是美国杜比实验室开发的一系列有损和无损的多媒体单元格式。',
		subMenu: [
			{
				type: 'normal',
				value: 'ac3',
				label: '【默认】ac3',
				tooltip: '',
				extra: {
					rateControl: [
						{ ...Q(q100slider) },
						{ ...CBR_ABR(abitrateSlider) },
					],
					parameters: [
						{
							mode: "combo", parameter: "channel_layout", display: "声道布局",
							items: [
								自动, lo_mono, lo_stereo, lo_3_0_back, lo_3_0, lo_quad_side, lo_quad, lo_4_0, lo_5_0_side, lo_5_0, lo_2_1, lo_3_1, lo_4_1, lo_5_1_side, lo_5_1,
								{
									type: 'normal',
									value: 'FC+LFE',
									label: 'FC+LFE',
									tooltip: '',
								},
								{
									type: 'normal',
									value: 'FL+FR+LFE+BC',
									label: 'FL+FR+LFE+BC',
									tooltip: '',
								},
								{
									type: 'normal',
									value: 'FL+FR+LFE+SL+SR',
									label: 'FL+FR+LFE+SL+SR',
									tooltip: '',
								},
								{
									type: 'normal',
									value: 'FL+FR+LFE+BL+BR',
									label: 'FL+FR+LFE+BL+BR',
									tooltip: '',
								},
							]
						},
					],
				},
			},
			{
				type: 'normal',
				value: 'ac3_fixed',
				label: 'ac3_fixed',
				tooltip: '',
				extra: {
					rateControl: [
						{ ...Q(q100slider) },
						{ ...CBR_ABR(abitrateSlider) },
					],
					parameters: [
						{
							mode: "combo", parameter: "channel_layout", display: "声道布局",
							items: [
								自动, lo_mono, lo_stereo, lo_3_0_back, lo_3_0, lo_quad_side, lo_quad, lo_4_0, lo_5_0_side, lo_5_0, lo_2_1, lo_3_1, lo_4_1, lo_5_1_side, lo_5_1,
								{
									type: 'normal',
									value: 'FC+LFE',
									label: 'FC+LFE',
									tooltip: '',
								},
								{
									type: 'normal',
									value: 'FL+FR+LFE+BC',
									label: 'FL+FR+LFE+BC',
									tooltip: '',
								},
								{
									type: 'normal',
									value: 'FL+FR+LFE+SL+SR',
									label: 'FL+FR+LFE+SL+SR',
									tooltip: '',
								},
								{
									type: 'normal',
									value: 'FL+FR+LFE+BL+BR',
									label: 'FL+FR+LFE+BL+BR',
									tooltip: '',
								},
							]
						},
					],
				},
			},
		],
	},
	{
		type: 'submenu',
		label: 'FLAC',
		tooltip: 'FLAC - FLAC 即 Free Lossless Audio Codec，FLAC 是一款的自由音频压缩编码，其特点是可以对音频文件无损压缩。',
		subMenu: [
			{
				type: 'normal',
				value: 'flac',
				label: '【默认】flac',
				tooltip: '',
				extra: {
					rateControl: [
						{ ...Q(q100slider) },
						{ ...CBR_ABR(abitrateSlider) },
					],
					parameters: [],
					strict2: true,
				},
			},
		],
	},
	{
		type: 'submenu',
		label: 'ALAC',
		tooltip: 'ALAC - ALAC 即 Apple Lossless Audio Codec，为苹果的无损音频压缩编码格式，可将非压缩音频格式（WAV、AIFF）压缩至原先容量的 40% 至 60% 左右。',
		subMenu: [
			{
				type: 'normal',
				value: 'alac',
				label: '【默认】alac',
				tooltip: '',
				extra: {
					rateControl: [
						{ ...Q(q100slider) },
						{ ...CBR_ABR(abitrateSlider) },
					],
					parameters: [
						{
							mode: "combo", parameter: "channel_layout", display: "声道布局",
							items: [ 自动, lo_mono, lo_stereo, lo_3_0, lo_4_0, lo_5_0, lo_5_1, lo_6_1_back, lo_7_1_wide ],
						},	
					],
					strict2: true,
				},
			},
		],
	},
	{
		type: 'submenu',
		label: 'WMA V2',
		tooltip: 'WMA 2 - WMA 是微软公司开发的一系列音频编解码器。WMA Pro 支持更多声道和更高质量的音频。',
		subMenu: [
			{
				type: 'normal',
				value: 'wmav2',
				label: '【默认】wmav2',
				tooltip: '',
				extra: {
					rateControl: [
						{ ...Q(q100slider) },
						{ ...CBR_ABR(abitrateSlider) },
					],
					parameters: [],
				},
			},
		],
	},
	{
		type: 'submenu',
		label: 'WMA V1',
		tooltip: 'WMA 1 - WMA 是微软公司开发的一系列音频编解码器。WMA Pro 支持更多声道和更高质量的音频。',
		subMenu: [
			{
				type: 'normal',
				value: 'wmav1',
				label: '【默认】wmav1',
				tooltip: '',
				extra: {
					rateControl: [
						{ ...Q(q100slider) },
						{ ...CBR_ABR(abitrateSlider) },
					],
					parameters: [
						{
							mode: "combo", parameter: "channel_layout", display: "声道布局",
							items: [ 自动, lo_mono, lo_stereo, lo_3_0, lo_4_0, lo_5_0, lo_5_1, lo_6_1_back, lo_7_1_wide ],
						},
					],
				},
			},
		],
	},
	{
		type: 'submenu',
		label: 'DTS',
		tooltip: 'DTS - DTS 即 Digital Theater Systems，数字影院系统，由 DTS 公司（DTS Inc.，NASDAQ：DTSI）开发，为多声道音频格式中的一种，广泛应用于 DVD 音效上。其最普遍的格式为 5.1 声道。',
		subMenu: [
			{
				type: 'normal',
				value: 'dca',
				label: '【默认】dca',
				tooltip: '',
				extra: {
					rateControl: [
						{ ...Q(q100slider) },
						{ ...CBR_ABR(abitrateSlider) },
					],
					parameters: [
						{
							mode: "combo", parameter: "ar", display: "采样频率",
							items: [ 自动, sr_48000, sr_44100, sr_32000, sr_24000, sr_22050, sr_16000, sr_12000, sr_11025, sr_8000 ],
						},
								{
							mode: "combo", parameter: "channel_layout", display: "声道布局",
							items: [ 自动, lo_mono, lo_stereo, lo_quad_side, lo_5_0_side, lo_5_1_side ],
						},
					],
				},
			},
		],
	},
	{
		type: 'submenu',
		label: 'AMR WB',
		tooltip: 'AMR - AMR 即 Adaptive multi-Rate compression，自适应多速率音频压缩，是一个使语音编码最优化的专利。AMR 被标准语音编码 3GPP 在 1998 年 10 月选用，现在广泛在 GSM 和 UMTS 中使用。',
		subMenu: [
			{
				type: 'normal',
				value: 'libvo_armwbenc',
				label: '【默认】libvo_armwbenc',
				tooltip: '',
				extra: {
					rateControl: [
						{ ...Q(q100slider) },
						{ ...CBR_ABR(abitrateSlider) },
					],
					parameters: [],
				},
			},
		],
	},
	{
		type: 'submenu',
		label: 'AMR NB',
		tooltip: 'AMR - AMR 即 Adaptive multi-Rate compression，自适应多速率音频压缩，是一个使语音编码最优化的专利。AMR 被标准语音编码 3GPP 在 1998 年 10 月选用，现在广泛在 GSM 和 UMTS 中使用。',
		subMenu: [
			{
				type: 'normal',
				value: 'libopencore_armnb',
				label: '【默认】libopencore_armnb',
				tooltip: '',
				extra: {
					rateControl: [
						{ ...Q(q100slider) },
						{ ...CBR_ABR(abitrateSlider) },
					],
					parameters: [],
				},
			},
		],
	},
];

export const allAcodecs: MenuItem<ACodecDetail>[] = [];

export const getAudioFFmpegParam = function (audioParams: OutputParams_audio) {
	const ret = [];
	let strict2 = false;
	if (audioParams.acodec == '禁用') {
		ret.push('-an');
	} else if (audioParams.acodec == 'copy') {
		ret.push('-acodec');
		ret.push('copy');
	} else if (audioParams.acodec && audioParams.acodec !== '自动') {
		ret.push('-acodec');
		ret.push(audioParams.acodec);
		let acodecItem = getMenuItemByValue(builtInAcodecs, audioParams.acodec) as any;
		if (!acodecItem) {
			acodecItem = getMenuItemByValue(allAcodecs, audioParams.acodec) as any;
		}
		const acodecDetail = (acodecItem?.extra) as ACodecDetail;
		if (acodecDetail) {
			if (acodecDetail.strict2) {
				strict2 = true;
			}
			if (!audioParams.detail) audioParams.detail = {};	// 这会改变 outputParams，但从类型定义上来说不应该会执行这一条，这里的处理是防范外部 API 调用不遵守规范
			for (const parameter of acodecDetail.parameters || []) {
				if (parameter.optional && audioParams.detail[parameter.parameter] === undefined) {
					continue;
				}
				if (parameter.mode === 'combo') {
					if (audioParams.detail[parameter.parameter] && audioParams.detail[parameter.parameter] != '默认' && audioParams.detail[parameter.parameter] != '自动') {
						ret.push('-' + parameter.parameter);
						ret.push(audioParams.detail[parameter.parameter]);
					}
					// 检查参数项是否有 strict2 标记
					var item = parameter.items.find((item) => item.value === audioParams.detail[parameter.parameter]);
					if (item?.strict2) {
						strict2 = true;
					}
				} else if (parameter.mode == 'slider') {
					ret.push('-' + parameter.parameter);
					const floatValue = audioParams.detail[parameter.parameter];
					const value = parameter.valueToParam ? parameter.valueToParam(floatValue) : floatValue;
					ret.push(value);
				} else if (parameter.mode === 'switch') {
					if (audioParams.detail[parameter.parameter] !== undefined) {
						ret.push('-' + parameter.parameter);
						ret.push(audioParams.detail[parameter.parameter]);
					}
				} else if (parameter.mode === 'text') {
					if (audioParams.detail[parameter.parameter] && audioParams.detail[parameter.parameter] != '默认' && audioParams.detail[parameter.parameter] != '自动') {
						ret.push('-' + parameter.parameter);
						ret.push(audioParams.detail[parameter.parameter]);
					}
				}
			}
			const ratecontrolItem = (acodecDetail.rateControl || []).find((item) => item.type === 'normal' && item.value === audioParams.ratecontrol) as any;
			if (ratecontrolItem) {
				const ratecontrol = ratecontrolItem.extra as RateControl;
				// 计算值
				const floatValue = audioParams.ratevalue;
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
		}
	} // 如果编码为自动，则不设置 acodec 参数，返回空 Array
	if (audioParams.acodec !== '禁用' && audioParams.acodec !== 'copy') {
		if (audioParams.vol && audioParams.vol !== 0) {
			ret.push('-vol');
			ret.push(volSlider.valueToParam(audioParams.vol));
		}
	}
	if (audioParams.custom) {
		ret.push(...audioParams.custom.split(' '));
	}
	return ret;
}

// 获取 ratecontrol 方面的参数，主要是给 taskitem 用
export const getAudioRateControlParam = function (audioParams: OutputParams_audio) {
	let ret = {
		mode: '-',
		value: '-'
	};
	if (!audioParams || audioParams.acodec == '禁用' || audioParams.acodec == '不重新编码' || audioParams.acodec == '自动') {
		return ret;
	} else {
		const acodecItem = getMenuItemByValue(builtInAcodecs, audioParams.acodec) as any;
		const acodecDetail = (acodecItem?.extra) as ACodecDetail;
		if (!acodecDetail || !acodecDetail.rateControl?.length) {
			return ret;
		}
		// 找到 ratecontrol 参数
		const ratecontrolItem = acodecDetail.rateControl.find((item) => {
			return item.type === 'normal' && item.value == audioParams.ratecontrol;
		}) as any;
		if (ratecontrolItem) {
			const ratecontrol = ratecontrolItem.extra as RateControl;
			// 计算值
			const floatValue = audioParams.ratevalue;
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
