import { EncoderDetail, FFmpegCodecDetail, FFmpegDemuxerDetail, FFmpegFilterDetail, FFmpegMuxerDetail } from '@common/types';
import { ACodecDetail, builtInAcodecs, allAcodecs } from './acodecs';
import { allVcodecs, VCodecDetail, builtInVcodecs } from './vcodecs';
import { allDemuxers, allMuxers, builtInDemuxers, builtInMuxers, Demuxer, Muxer } from './formats';
import { Parameter } from './parameter';
import { filtersList } from './filter';
import { getMenuItemByValue } from '@common/menu';
import { MenuItem } from '@renderer/components/Menu/Menu';

export function parseSingleOption(option: EncoderDetail['options'][number]): Parameter {
	if (['string', 'dictionary'].includes(option.type)) {
		return ({
			parameter: option.name,
			display: option.name,
			description: option.description,
			optional: true,
			mode: 'text',
			default: option.default as string,
		});
	} else if (['color', 'duration', 'image_size', 'rational'].includes(option.type)) {
		return ({
			parameter: option.name,
			display: option.name,
			description: option.description,
			optional: true,
			mode: 'text',
			type: option.type as any,
			default: option.default as string,
		});
	} else if (option.type === 'boolean') {
		return ({
			parameter: option.name,
			display: option.name,
			description: option.description,
			optional: true,
			mode: 'switch',
			default: option.default as boolean,
		});
	} else if (option.type === 'flags') {
		return ({
			parameter: option.name,
			display: option.name,
			description: option.description,
			optional: true,
			mode: 'combo',
			items: option.options.map((option) => ({
				type: 'normal',
				value: option.value as string,
				label: option.value as string,
			})),
			default: option.default,
		});
	} else if (['int', 'int64'].includes(option.type)) {
		/**
		 * int 类型具有最多的目的
		 * 如果是间距为 1 或 0 的等差数列，可以认为是挡位调节（如 preset）（适用 slider），也有可能是枚举（如 tune）（适用 dropdownInput）。从 slider 占用和容纳空间考虑，设定为上下限差 4~10 之间的使用 slider，否则使用 dropwownInput
		 * 如果不等差，基本可以认定是枚举（适用 dropdownInput）
		 * 如果没有选项，有可能是可调节范围（适用 slider），或者是别的(适用 NormalInput)
		 */
		if (option.options) {
			const options = option.options;
			const isEqualDiff = options.map((o) => +o.value).every((option, index, array) => index === 0 || Math.abs(option - array[index - 1]) <= 1);
			const minmaxDiff4to10 = isEqualDiff && Math.abs(+options[0].value - +options[options.length - 1].value) >= 4 && Math.abs(+options[0].value - +options[options.length - 1].value) <= 10;
			// if (minmaxDiff4to10) {
			// 	console.log('minmaxDiff4to10', encoder.name, option.name);
			// }
			if (isEqualDiff && minmaxDiff4to10) {
				const min = Math.min(+options[0].value, +options[options.length - 1].value);
				const max = Math.max(+options[0].value, +options[options.length - 1].value);
				return ({
					parameter: option.name,
					display: option.name,
					description: option.description,
					optional: true,
					mode: 'slider',
					min, max,
					tags: new Map([[min, min + ''], [max, max + ''], [+option.default, '默认值'], ...options.map((option) => [+option.value, option.name] as [number, string])]),
					sliderMode: 'number',
					default: option.default as number,	// 已在 FFmpegInvoke 将字符串表示的默认值匹配到对应数字
					adsorption: 'int',
				})									
			} else {
				return ({
					parameter: option.name,
					display: option.name,
					description: option.description,
					optional: true,
					mode: 'combo',
					items: option.options.map((option) => ({
						type: 'normal',
						value: option.value,
						label: option.name,
						tooltip: option.description,
					})),
					default: option.default,
				});
			}
		} else {
			if (Math.abs(option.max - option.min) < 1000) {
				return ({
					parameter: option.name,
					display: option.name,
					description: option.description,
					optional: true,
					mode: 'slider',
					min: option.min,
					max: option.max,
					tags: new Map([[option.min, option.min + ''], [option.max, option.max + ''], [+option.default, '默认值']]),
					sliderMode: 'number',
					default: option.default as number,	// 已在 FFmpegInvoke 将字符串表示的默认值匹配到对应数字
					adsorption: 'int',
				});
			} else {
				return ({
					parameter: option.name,
					display: option.name,
					description: option.description,
					optional: true,
					mode: 'text',
					type: 'int',
					default: option.default + '',
				});
			}
		}
	} else if (['float', 'double'].includes(option.type)) {
		if (Math.abs(option.max - option.min) < 1000) {
			return ({
				parameter: option.name,
				display: option.name,
				description: option.description,
				optional: true,
				mode: 'slider',
				min: option.min,
				max: option.max,
				arrowKeyStep: (Math.abs(option.max - option.min)) / (10 ** (Math.round(Math.log10(Math.abs(option.max - option.min) / 2)) - 2)),	// 控制步长方便操作
				tags: new Map([[option.min, option.min + ''], [option.max, option.max + ''], [+option.default, '默认值']]),
				sliderMode: 'number',
				default: option.default as number,	// 已在 FFmpegInvoke 将字符串表示的默认值匹配到对应数字
			});
		} else {
			return ({
				parameter: option.name,
				display: option.name,
				description: option.description,
				optional: true,
				mode: 'text',
				type: 'float',
				default: option.default + '',
			});
		}
	} else {
		// console.warn(`解析 ${option.name} 过程中发现未知类型 ${option.type}`);
		return ({
			parameter: option.name,
			display: option.name,
			description: option.description,
			optional: true,
			mode: 'text',
			default: option.default as string,
		});
	}
}

export function parseFFmpegCodecsToCodecsList(input: { video: FFmpegCodecDetail[], audio: FFmpegCodecDetail[] }) {
	// 视频
	allVcodecs.splice(0, allVcodecs.length);	// 清空之前的全部编码器列表
	for (const iVideo of input.video) {
		const menuItem: MenuItem<VCodecDetail> = {
			type: 'submenu',
			label: iVideo.name,
			tooltip: iVideo.description,
			subMenu: iVideo.encoders.map((encoder) => ({
				type: 'normal',
				value: encoder.name,
				label: encoder.name,
				extra: (() => {
					// 对每款编码器进行参数扫描组装
					const parameters: Parameter[] = [];
					// 如果 FFBox 已预置该编码器的部分信息，那么进行 append
					const outsideItem = getMenuItemByValue(builtInVcodecs, encoder.name) as any;
					const outsideDetail = (outsideItem?.extra) as VCodecDetail;
					let existParameters: string[] = [];	// 对于已经预置的选项，不在详细参数中重复添加
					if (outsideDetail) {
						parameters.push(...outsideDetail.parameters);
						existParameters = outsideDetail.parameters.map((parameter) => parameter.parameter);
					}
					for (const option of encoder.options) {
						if (existParameters.includes(option.name)) {
							continue;
						} else {
							const parsedOption = parseSingleOption(option);
							parsedOption && parameters.push(parsedOption);
						}
					}
					// 如果有预置编码器，那么在 return 结果之前把预置编码的参数也替换掉
					if (outsideDetail) {
						outsideDetail.parameters = parameters;
					}
					return { rateControl: [] as any[], parameters };
				})(),
			})),
		}
		allVcodecs.push(menuItem);
	}
	// 音频
	allAcodecs.splice(0, allAcodecs.length);	// 清空之前的全部编码器列表
	for (const iAudio of input.audio) {
		const menuItem: MenuItem<VCodecDetail> = {
			type: 'submenu',
			label: iAudio.name,
			tooltip: iAudio.description,
			subMenu: iAudio.encoders.map((encoder) => ({
				type: 'normal',
				value: encoder.name,
				label: encoder.name,
				extra: (() => {
					// 对每款编码器进行参数扫描组装
					const parameters: Parameter[] = [];
					// 如果 FFBox 已预置该编码器的部分信息，那么进行 append
					const outsideItem = getMenuItemByValue(builtInAcodecs, encoder.name) as any;
					const outsideDetail = (outsideItem?.extra) as ACodecDetail;
					let existParameters: string[] = [];	// 对于已经预置的选项，不在详细参数中重复添加
					if (outsideDetail) {
						parameters.push(...outsideDetail.parameters);
						existParameters = outsideDetail.parameters.map((parameter) => parameter.parameter);
					}
					for (const option of encoder.options) {
						if (existParameters.includes(option.name)) {
							continue;
						} else {
							const parsedOption = parseSingleOption(option);
							parsedOption && parameters.push(parsedOption);
						}
					}
					// 如果有预置编码器，那么在 return 结果之前把预置编码的参数也替换掉
					if (outsideDetail) {
						outsideDetail.parameters = parameters;
					}
					return { rateControl: [] as any[], parameters };
				})(),
			})),
		}
		allAcodecs.push(menuItem);
	}
}

export function parseFFmpegMuDeMuxersToList(input: { muxer: FFmpegMuxerDetail[], demuxer: FFmpegDemuxerDetail[] }) {
	// 复用器
	allMuxers.splice(0, allMuxers.length);	// 清空之前的全部复用器列表
	for (const iMuxer of input.muxer) {
		const muxerExtra = (() => {
			// 对每款编码器进行参数扫描组装
			const parameters: Parameter[] = [];
			// 如果 FFBox 已预置该编码器的部分信息，那么进行 append
			const outsideItem = getMenuItemByValue(
				builtInMuxers,
				iMuxer.name,
				(i, y) => i === y || (i.match(/^.+ \((.+)\)$/)?.[1] === y ? true : false)	// muxer 名称完全一致或者在菜单项名的括号里面
			) as any;
			let outsideDetail = (outsideItem?.extra) as VCodecDetail;
			if (outsideItem && !outsideDetail) {
				outsideItem.extra = {
					parameters: [],
				};
				outsideDetail = outsideItem.extra;
			}
			let existParameters: string[] = [];	// 对于已经预置的选项，不在详细参数中重复添加
			if (outsideDetail) {
				parameters.push(...outsideDetail.parameters);
				existParameters = outsideDetail.parameters.map((parameter) => parameter.parameter);
			}
			for (const option of iMuxer.options) {
				if (existParameters.includes(option.name)) {
					continue;
				} else {
					const parsedOption = parseSingleOption(option);
					parsedOption && parameters.push(parsedOption);
				}
			}
			// 如果有预置编码器，那么在 return 结果之前把预置编码的参数也替换掉
			if (outsideDetail) {
				outsideDetail.parameters = parameters;
			}
			return {
				defaultVideoCodec: iMuxer.defaultVideoCodec,
				defaultAudioCodec: iMuxer.defaultAudioCodec,
				parameters,
			};
		})();
		if (!iMuxer.extensions || iMuxer.extensions?.[0] === iMuxer.name) {
			const menuItem: MenuItem<Muxer> = {
				type: 'normal',
				value: iMuxer.name,
				label: iMuxer.name,
				tooltip: iMuxer.description + (iMuxer.defaultVideoCodec ? `\n默认视频编码器：${iMuxer.defaultVideoCodec}` : '') + (iMuxer.defaultAudioCodec ? `\n默认音频编码器：${iMuxer.defaultAudioCodec}` : ''),
				extra: muxerExtra,
			}
			allMuxers.push(menuItem);
		} else {
			const menuItem: MenuItem<Muxer> = {
				type: 'submenu',
				label: iMuxer.name,
				tooltip: iMuxer.description + (iMuxer.defaultVideoCodec ? `\n默认视频编码器：${iMuxer.defaultVideoCodec}` : '') + (iMuxer.defaultAudioCodec ? `\n默认音频编码器：${iMuxer.defaultAudioCodec}` : ''),
				subMenu: iMuxer.extensions.map((extension) => ({
					type: 'normal',
					value: `${extension} (${iMuxer.name})`,
					label: extension,
					// tooltip: iMuxer.description,
					extra: muxerExtra,
				})),
			}
			allMuxers.push(menuItem);
		}
	}
	// 解复用器
	allDemuxers.splice(0, allDemuxers.length);	// 清空之前的全部复用器列表
	for (const iDemuxer of input.demuxer) {
		const menuItem: MenuItem<Demuxer> = {
			type: 'normal',
			value: iDemuxer.name,
			label: iDemuxer.name,
			tooltip: iDemuxer.description,
			extra: (() => {
				// 对每款编码器进行参数扫描组装
				const parameters: Parameter[] = [];
				// 如果 FFBox 已预置该编码器的部分信息，那么进行 append
				const outsideItem = getMenuItemByValue(builtInDemuxers, iDemuxer.name) as any;
				const outsideDetail = (outsideItem?.extra) as VCodecDetail;
				let existParameters: string[] = [];	// 对于已经预置的选项，不在详细参数中重复添加
				if (outsideDetail) {
					parameters.push(...outsideDetail.parameters);
					existParameters = outsideDetail.parameters.map((parameter) => parameter.parameter);
				}
				for (const option of iDemuxer.options) {
					if (existParameters.includes(option.name)) {
						continue;
					} else {
						const parsedOption = parseSingleOption(option);
						parsedOption && parameters.push(parsedOption);
					}
				}
				// 如果有预置编码器，那么在 return 结果之前把预置编码的参数也替换掉
				if (outsideDetail) {
					outsideDetail.parameters = parameters;
				}
				return { isDevice: iDemuxer.isDevice, parameters };
			})(),
		}
		allDemuxers.push(menuItem);
	}
}

export function parseFFmpegFiltersToFiltersList(input: FFmpegFilterDetail[]) {
	filtersList.splice(0, filtersList.length);
	filtersList.push(...input);
}
