import { defaultParams } from './defaultParams';
import { InputInfo, NcmTaskParams, OutputParams } from './types';

export type KomorebiWorkflow = 'video-compress' | 'audio-convert' | 'remux' | 'ncm';
export type KomorebiMode = 'normal';
export type KomorebiVideoScene = 'anime' | 'screen' | 'live';
export type KomorebiVideoCodec = 'h264' | 'hevc' | 'av1' | 'vp9' | 'mpeg4';
export type KomorebiQuality = 1 | 2 | 3 | 4;
export type KomorebiAudioSource = 'source' | 'none' | 'external';
export type KomorebiVideoContainer = 'mp4' | 'mkv' | 'webm' | 'mov' | 'm4v' | 'flv' | 'ts' | 'avi';
export type KomorebiAudioFormat = 'mp3' | 'flac' | 'wav' | 'aac' | 'm4a' | 'ogg' | 'wma' | 'opus' | 'ac3' | 'mp2';
export type KomorebiRemuxContainer = 'mp4' | 'mkv' | 'mov' | 'm4v' | 'webm' | 'flv' | 'avi' | 'ts' | 'wmv' | '3gp';

export interface KomorebiVideoPreset {
	scene: KomorebiVideoScene;
	codec: KomorebiVideoCodec;
	quality: KomorebiQuality;
	container: KomorebiVideoContainer;
	audioSource: KomorebiAudioSource;
	externalAudio?: string;
	outputDir?: string;
	outputNameTemplate?: string;
}

export interface KomorebiAudioPreset {
	format: KomorebiAudioFormat;
	quality: KomorebiQuality;
	outputDir?: string;
	outputNameTemplate?: string;
}

export interface KomorebiRemuxPreset {
	container: KomorebiRemuxContainer;
	audioSource?: 'source' | 'external';
	externalAudio?: string;
	outputDir?: string;
	outputNameTemplate?: string;
}

export interface KomorebiMediaHints {
	hasVideo?: boolean;
	hasAudio?: boolean;
	videoCodec?: string;
	audioCodec?: string;
}

export const defaultKomorebiVideoPreset: KomorebiVideoPreset = {
	scene: 'anime',
	codec: 'hevc',
	quality: 2,
	container: 'mp4',
	audioSource: 'source',
	externalAudio: '',
	outputDir: '',
	outputNameTemplate: '',
};

export const defaultKomorebiAudioPreset: KomorebiAudioPreset = {
	format: 'mp3',
	quality: 2,
	outputDir: '',
	outputNameTemplate: '',
};

export const defaultKomorebiRemuxPreset: KomorebiRemuxPreset = {
	container: 'mp4',
	audioSource: 'source',
	externalAudio: '',
	outputDir: '',
	outputNameTemplate: '',
};

const qualityCrf: Record<KomorebiQuality, number> = {
	1: 19,
	2: 23,
	3: 27,
	4: 31,
};

const audioBitrates: Record<KomorebiQuality, string> = {
	1: '320k',
	2: '192k',
	3: '128k',
	4: '64k',
};

const sceneParams = {
	anime: {
		x265High: 'limit-sao=1:bframes=8:psy-rd=1.0:aq-mode=3:aq-strength=0.8:deblock=0,0',
		x265Low: 'limit-sao=1:bframes=8:psy-rd=0.6:aq-mode=3:deblock=1,1:qcomp=0.6',
		svtHigh: 'tune=0:enable-overlays=1:scd=1',
		svtLow: 'tune=0:enable-overlays=1:scd=1',
		hwPresetHigh: 'p4',
		hwPresetLow: 'p3',
	},
	screen: {
		x265High: 'strong-intra-smoothing=0:rect=0:aq-mode=1:deblock=-1,-1:bframes=8:keyint=300',
		x265Low: 'strong-intra-smoothing=0:rect=0:aq-mode=1:deblock=-1,-1:bframes=8:keyint=300',
		svtHigh: 'tune=0:enable-overlays=1:scd=1:scm=2',
		svtLow: 'tune=0:enable-overlays=1:scd=1:scm=2',
		hwPresetHigh: 'p4',
		hwPresetLow: 'p4',
	},
	live: {
		x265High: 'no-sao=1:bframes=4:psy-rd=1.5:psy-rdoq=2.0:aq-mode=2',
		x265Low: 'limit-sao=1:bframes=4:psy-rd=1.0:aq-mode=2',
		svtHigh: 'tune=2:film-grain=8',
		svtLow: 'tune=2:film-grain=4',
		hwPresetHigh: 'p5',
		hwPresetLow: 'p4',
	},
} satisfies Record<KomorebiVideoScene, {
	x265High: string;
	x265Low: string;
	svtHigh: string;
	svtLow: string;
	hwPresetHigh: string;
	hwPresetLow: string;
}>;

const cloneDefaultParams = (): OutputParams => JSON.parse(JSON.stringify(defaultParams));

const stripOuterQuotes = (value?: string) => {
	let normalized = (value || '').trim();
	while (
		normalized.length >= 2 &&
		((normalized.startsWith('"') && normalized.endsWith('"')) ||
			(normalized.startsWith("'") && normalized.endsWith("'")))
	) {
		normalized = normalized.slice(1, -1).trim();
	}
	return normalized;
};

const normalizePath = (path?: string) => stripOuterQuotes(path).replace(/\\/g, '/');

const normalizeDirectoryPath = (path?: string) => {
	let normalized = normalizePath(path);
	while (normalized.endsWith('/') && normalized !== '/' && !/^[A-Za-z]:\/$/.test(normalized)) {
		normalized = normalized.slice(0, -1);
	}
	return normalized;
};

const outputPattern = (outputDir: string | undefined, suffix: string, fileNameTemplate?: string) => {
	const normalized = normalizeDirectoryPath(outputDir);
	const safeTemplate = stripOuterQuotes(fileNameTemplate).replace(/[\\/]/g, '_').trim();
	const filename = safeTemplate || `[filename]_${suffix}`;
	const filenameWithExt = filename.includes('[fileext]') ? filename : `${filename}.[fileext]`;
	return normalized ? `${normalized}/${filenameWithExt}` : `[filedir]/${filenameWithExt}`;
};

const inputFiles = (inputs: string[]) => inputs.filter(Boolean).map((filePath) => ({
	filePath: normalizePath(filePath),
	demuxer: '自动',
	begin: '',
	end: '',
	hwaccel: '自动',
	realtime: false,
	detail: {},
	custom: '',
}));

const ensureInputFiles = (params: OutputParams, inputs: string[]) => {
	params.input.files = inputFiles(inputs.length ? inputs : params.input.files.map((file) => file.filePath).filter(Boolean) as string[]);
};

const mapContainer = (container: string) => {
	switch (container) {
		case 'mkv': return 'mkv (matroska)';
		case 'mov': return 'mov (mp4)';
		case 'm4v': return 'm4v (mp4)';
		case 'ts': return 'ts (mpegts)';
		case 'wmv': return 'wmv (asf)';
		default: return container;
	}
};

export const komorebiVideoContainers: { value: KomorebiVideoContainer; label: string }[] = [
	{ value: 'mp4', label: 'MP4' },
	{ value: 'mkv', label: 'MKV' },
	{ value: 'webm', label: 'WebM' },
	{ value: 'mov', label: 'MOV' },
	{ value: 'm4v', label: 'M4V' },
	{ value: 'flv', label: 'FLV' },
	{ value: 'ts', label: 'TS' },
	{ value: 'avi', label: 'AVI' },
];

export const komorebiAudioFormats: { value: KomorebiAudioFormat; label: string }[] = [
	{ value: 'mp3', label: 'MP3' },
	{ value: 'flac', label: 'FLAC' },
	{ value: 'wav', label: 'WAV' },
	{ value: 'aac', label: 'AAC' },
	{ value: 'm4a', label: 'M4A' },
	{ value: 'ogg', label: 'OGG/Vorbis' },
	{ value: 'opus', label: 'OPUS' },
	{ value: 'wma', label: 'WMA' },
	{ value: 'ac3', label: 'AC3' },
	{ value: 'mp2', label: 'MP2' },
];

export const komorebiRemuxContainers: { value: KomorebiRemuxContainer; label: string }[] = [
	{ value: 'mp4', label: 'MP4' },
	{ value: 'mkv', label: 'MKV' },
	{ value: 'mov', label: 'MOV' },
	{ value: 'm4v', label: 'M4V' },
	{ value: 'webm', label: 'WebM' },
	{ value: 'flv', label: 'FLV' },
	{ value: 'avi', label: 'AVI' },
	{ value: 'ts', label: 'TS' },
	{ value: 'wmv', label: 'WMV' },
	{ value: '3gp', label: '3GP' },
];

export const komorebiNcmFormats: { value: NonNullable<NcmTaskParams['targetFormat']>; label: string }[] = [
	{ value: 'auto', label: '按源音乐自动输出' },
	{ value: 'mp3', label: 'MP3' },
	{ value: 'flac', label: 'FLAC' },
	{ value: 'wav', label: 'WAV' },
	{ value: 'aac', label: 'AAC' },
	{ value: 'm4a', label: 'M4A' },
	{ value: 'ogg', label: 'OGG/Vorbis' },
	{ value: 'opus', label: 'OPUS' },
	{ value: 'wma', label: 'WMA' },
	{ value: 'ac3', label: 'AC3' },
	{ value: 'mp2', label: 'MP2' },
];

export function normalizeKomorebiVideoPreset(preset: KomorebiVideoPreset): KomorebiVideoPreset {
	const normalized = { ...preset };
	if (normalized.container === 'webm' && !['av1', 'vp9'].includes(normalized.codec)) {
		normalized.codec = 'av1';
	} else if (normalized.container === 'flv') {
		normalized.codec = 'h264';
	} else if (normalized.container === 'avi') {
		normalized.codec = normalized.codec === 'mpeg4' ? 'mpeg4' : 'h264';
	} else if (normalized.container === 'ts' && normalized.codec === 'av1') {
		normalized.codec = 'hevc';
	}
	return normalized;
}

export function normalizeKomorebiRemuxContainer(container: KomorebiRemuxContainer): KomorebiRemuxContainer {
	return container;
}

export function buildKomorebiVideoParams(inputs: string[], preset: KomorebiVideoPreset): OutputParams {
	const actualPreset = normalizeKomorebiVideoPreset(preset);
	const params = cloneDefaultParams();
	ensureInputFiles(params, inputs.slice(0, 1));
	if (actualPreset.audioSource === 'external' && actualPreset.externalAudio?.trim()) {
		params.input.files.push(...inputFiles([actualPreset.externalAudio]));
	}

	const output = params.outputs[0];
	const crf = qualityCrf[actualPreset.quality];
	const codec = actualPreset.codec === 'h264' ? 'libx264'
		: actualPreset.codec === 'hevc' ? 'libx265'
			: actualPreset.codec === 'vp9' ? 'libvpx-vp9'
				: actualPreset.codec === 'mpeg4' ? 'mpeg4'
					: 'libsvtav1';
	const scene = sceneParams[actualPreset.scene];
	const highQuality = actualPreset.quality === 1 || actualPreset.quality === 2;
	const maps = (() => {
		if (actualPreset.audioSource === 'none') {
			return ['-map', '0:v'];
		}
		if (actualPreset.audioSource === 'external' && actualPreset.externalAudio?.trim()) {
			return ['-map', '0:v', '-map', '1:a', '-map', '0:s?', '-c:s', 'copy'];
		}
		return ['-map', '0:v?', '-map', '0:a?', '-map', '0:s?', '-dn', '-c:s', 'copy'];
	})();
	const codecTuning = (() => {
		if (actualPreset.codec === 'h264') {
			return ['-preset', 'medium', '-pix_fmt', 'yuv420p'];
		}
		if (actualPreset.codec === 'hevc') {
			return ['-preset', 'medium', '-x265-params', highQuality ? scene.x265High : scene.x265Low];
		}
		if (actualPreset.codec === 'vp9') {
			return ['-deadline', 'good', '-cpu-used', '2'];
		}
		if (actualPreset.codec === 'mpeg4') {
			return ['-q:v', highQuality ? '3' : '5'];
		}
		return ['-preset', '6', '-svtav1-params', highQuality ? scene.svtHigh : scene.svtLow];
	})();

	output.video = {
		vcodec: codec,
		resolution: '不改变',
		framerate: '不改变',
		ratecontrol: 'CRF',
		ratevalue: crf,
		detail: {},
		custom: [...maps, ...codecTuning].join(' '),
	};
	output.audio = {
		acodec: actualPreset.audioSource === 'none' ? '禁用' : ['av1', 'vp9'].includes(actualPreset.codec) || actualPreset.container === 'webm' ? 'libopus' : 'aac',
		ratecontrol: undefined,
		ratevalue: undefined,
		vol: 0,
		detail: {},
		custom: actualPreset.audioSource === 'none' ? '' : '-b:a 192k',
	};
	output.mux = {
		format: mapContainer(actualPreset.container),
		moveflags: ['mp4', 'm4v', 'mov'].includes(actualPreset.container),
		filePath: outputPattern(actualPreset.outputDir, 'komorebi', actualPreset.outputNameTemplate),
		begin: '',
		end: '',
		detail: {},
		keepMetadata: 'both',
	};
	params.extra = {
		presetName: 'Komorebi 视频压缩',
		komorebiWorkflow: 'video-compress',
		komorebiPreset: { ...actualPreset, outputDir: normalizeDirectoryPath(actualPreset.outputDir), outputNameTemplate: stripOuterQuotes(actualPreset.outputNameTemplate) },
		komorebiCpuFallback: true,
	};
	return params;
}

export function buildKomorebiAudioParams(inputs: string[], preset: KomorebiAudioPreset): OutputParams {
	const params = cloneDefaultParams();
	ensureInputFiles(params, inputs);
	const output = params.outputs[0];
	const bitrate = audioBitrates[preset.quality];
	const format = preset.format;
	const codec = (() => {
		switch (format) {
			case 'mp3': return 'libmp3lame';
			case 'flac': return 'flac';
			case 'wav': return 'pcm_s16le';
			case 'ogg': return 'libvorbis';
			case 'opus': return 'libopus';
			case 'wma': return 'wmav2';
			case 'ac3': return 'ac3';
			case 'mp2': return 'mp2';
			case 'aac':
			case 'm4a':
			default:
				return 'aac';
		}
	})();
	const lossy = !['flac', 'wav'].includes(format);

	output.video = {
		vcodec: '禁用',
		resolution: '不改变',
		framerate: '不改变',
		detail: {},
	};
	output.audio = {
		acodec: codec,
		ratecontrol: undefined,
		ratevalue: undefined,
		vol: 0,
		detail: {},
		custom: lossy ? `-b:a ${bitrate}` : '',
	};
	output.mux = {
		format,
		moveflags: false,
		filePath: outputPattern(preset.outputDir, 'audio', preset.outputNameTemplate),
		begin: '',
		end: '',
		detail: {},
		keepMetadata: 'both',
	};
	params.extra = {
		presetName: 'Komorebi 音频转换',
		komorebiWorkflow: 'audio-convert',
		komorebiPreset: { ...preset, outputDir: normalizeDirectoryPath(preset.outputDir), outputNameTemplate: stripOuterQuotes(preset.outputNameTemplate) },
	};
	return params;
}

export function buildKomorebiRemuxParams(inputs: string[], preset: KomorebiRemuxPreset): OutputParams {
	const params = cloneDefaultParams();
	ensureInputFiles(params, inputs.slice(0, 1));
	if (preset.audioSource === 'external' && preset.externalAudio?.trim()) {
		params.input.files.push(...inputFiles([preset.externalAudio]));
	}
	const output = params.outputs[0];
	output.video = {
		vcodec: 'copy',
		resolution: '不改变',
		framerate: '不改变',
		detail: {},
		custom: '-map 0 -c:s copy',
	};
	output.audio = {
		acodec: 'copy',
		vol: 0,
		detail: {},
	};
	output.mux = {
		format: mapContainer(preset.container),
		moveflags: ['mp4', 'm4v', 'mov'].includes(preset.container),
		filePath: outputPattern(preset.outputDir, 'remux', preset.outputNameTemplate),
		begin: '',
		end: '',
		detail: {},
		keepMetadata: 'both',
	};
	params.extra = {
		presetName: 'Komorebi 转封装',
		komorebiWorkflow: 'remux',
		komorebiPreset: { ...preset, outputDir: normalizeDirectoryPath(preset.outputDir), outputNameTemplate: stripOuterQuotes(preset.outputNameTemplate) },
		komorebiRemuxFallback: true,
	};
	return params;
}

export function buildKomorebiRemuxFallbackParams(params: OutputParams): OutputParams {
	const fallback = JSON.parse(JSON.stringify(params)) as OutputParams;
	const output = fallback.outputs[0];
	output.video = {
		vcodec: 'libx264',
		resolution: '不改变',
		framerate: '不改变',
		ratecontrol: 'CRF',
		ratevalue: 18,
		detail: {},
		custom: '-map 0 -c:s copy -preset medium -pix_fmt yuv420p',
	};
	output.audio = {
		acodec: 'aac',
		ratecontrol: undefined,
		ratevalue: undefined,
		vol: 0,
		detail: {},
		custom: '-b:a 256k',
	};
	fallback.extra = {
		...fallback.extra,
		presetName: 'Komorebi 转封装 fallback',
		komorebiFallbackTried: true,
	};
	return fallback;
}

const targetEncoder = (codec: KomorebiVideoCodec, encoderNames: string[], forceCpu = false) => {
	if (codec === 'vp9' || codec === 'mpeg4') {
		return codec === 'vp9' ? 'libvpx-vp9' : 'mpeg4';
	}
	if (!forceCpu) {
		const candidates = codec === 'av1'
			? ['av1_nvenc', 'av1_qsv', 'av1_amf']
			: codec === 'hevc'
				? ['hevc_nvenc', 'hevc_qsv', 'hevc_amf']
				: ['h264_nvenc', 'h264_qsv', 'h264_amf'];
		const found = candidates.find((name) => encoderNames.includes(name));
		if (found) {
			return found;
		}
	}
	return codec === 'av1' ? 'libsvtav1' : codec === 'hevc' ? 'libx265' : 'libx264';
};

const appendVideoEncoderArgs = (args: string[], preset: KomorebiVideoPreset, encoderNames: string[], forceCpu = false) => {
	const codec = preset.container === 'webm' ? 'av1' : preset.codec;
	const crf = `${qualityCrf[preset.quality]}`;
	const scene = sceneParams[preset.scene];
	const highQuality = preset.quality === 1 || preset.quality === 2;
	const encoder = targetEncoder(codec, encoderNames, forceCpu);

	if (encoder.endsWith('_nvenc')) {
		args.push('-c:v', encoder, '-preset', highQuality ? scene.hwPresetHigh : scene.hwPresetLow, '-rc', 'vbr', '-cq', crf);
		if (preset.scene === 'anime') {
			args.push('-spatial-aq', '1', '-tune', 'hq', '-bf', '3');
		} else if (preset.scene === 'screen') {
			args.push('-spatial-aq', '1', '-tune', 'hq', '-bf', '4', '-g', '300');
		} else {
			args.push('-spatial-aq', '1', '-temporal-aq', '1', '-tune', 'hq', '-bf', '3');
		}
	} else if (encoder.endsWith('_qsv')) {
		args.push('-c:v', encoder, '-preset', 'slower', '-global_quality', crf, '-look_ahead', '1');
	} else if (encoder.endsWith('_amf')) {
		args.push('-c:v', encoder, '-rc', 'cqp', '-qp_i', crf, '-qp_p', crf, '-qp_b', crf);
	} else if (codec === 'av1') {
		args.push('-c:v', 'libsvtav1', '-preset', '6', '-crf', crf, '-svtav1-params', highQuality ? scene.svtHigh : scene.svtLow);
	} else if (codec === 'vp9') {
		args.push('-c:v', 'libvpx-vp9', '-b:v', '0', '-crf', crf, '-deadline', 'good', '-cpu-used', '2');
	} else if (codec === 'mpeg4') {
		args.push('-c:v', 'mpeg4', '-q:v', highQuality ? '3' : '5');
	} else if (codec === 'hevc') {
		args.push('-c:v', 'libx265', '-pix_fmt', 'yuv420p10le', '-preset', 'medium', '-crf', crf);
		if (preset.scene === 'anime') {
			args.push('-tune', 'animation');
		}
		args.push('-x265-params', highQuality ? scene.x265High : scene.x265Low);
	} else {
		args.push('-c:v', 'libx264', '-preset', 'medium', '-crf', crf, '-tune', preset.scene === 'anime' ? 'animation' : 'film', '-pix_fmt', 'yuv420p');
	}
};

const appendAudioEncoderArgs = (args: string[], format: KomorebiAudioPreset['format'], quality: KomorebiQuality) => {
	const bitrate = audioBitrates[quality];
	if (format === 'mp3') {
		args.push('-c:a', 'libmp3lame', '-b:a', bitrate);
	} else if (format === 'flac') {
		args.push('-c:a', 'flac');
	} else if (format === 'wav') {
		args.push('-c:a', 'pcm_s16le');
	} else if (format === 'ogg') {
		args.push('-c:a', 'libvorbis', '-b:a', bitrate);
	} else if (format === 'opus') {
		args.push('-c:a', 'libopus', '-b:a', bitrate, '-vbr', 'on');
	} else if (format === 'wma') {
		args.push('-c:a', 'wmav2', '-b:a', bitrate);
	} else if (format === 'ac3') {
		args.push('-c:a', 'ac3', '-b:a', bitrate);
	} else if (format === 'mp2') {
		args.push('-c:a', 'mp2', '-b:a', bitrate);
	} else {
		args.push('-c:a', 'aac', '-b:a', bitrate);
	}
};

export function getKomorebiMediaHints(inputInfo?: InputInfo): KomorebiMediaHints {
	const streams = inputInfo?.streams || [];
	if (!streams.length) {
		return {};
	}
	const videoStream = streams.find((stream) => `${stream.type || ''}`.toLowerCase() === 'video');
	const audioStream = streams.find((stream) => `${stream.type || ''}`.toLowerCase() === 'audio');
	const normalizeCodec = (codec?: string) => {
		const normalized = (codec || '').toLowerCase().replace(/[^a-z0-9]/g, '');
		if (['h265', 'x265', 'hev1'].includes(normalized)) {
			return 'hevc';
		}
		if (['h264', 'x264', 'avc1', 'avc'].includes(normalized)) {
			return 'h264';
		}
		if (['mpeg4part2', 'mp4v'].includes(normalized)) {
			return 'mpeg4';
		}
		if (['wmv9'].includes(normalized)) {
			return 'wmv3';
		}
		if (['vc1'].includes(normalized)) {
			return 'vc1';
		}
		return normalized;
	};
	return {
		hasVideo: !!videoStream,
		hasAudio: !!audioStream,
		videoCodec: normalizeCodec(videoStream?.codec),
		audioCodec: normalizeCodec(audioStream?.codec),
	};
}

export function shouldKomorebiRemuxTranscode(container: KomorebiRemuxPreset['container'], hints?: KomorebiMediaHints): false | 'video' | 'audio' {
	const hasVideo = hints?.hasVideo === true;
	const hasAudio = hints?.hasAudio === true;
	const vcodec = (hints?.videoCodec || '').toLowerCase();
	const acodec = (hints?.audioCodec || '').toLowerCase();
	if (container === 'webm') {
		if (hasVideo && !['vp8', 'vp9', 'av1'].includes(vcodec)) {
			return 'video';
		}
		if (hasAudio && !['vorbis', 'opus'].includes(acodec)) {
			return 'audio';
		}
	}
	if ((container === 'mp4' || container === 'mov') && hasVideo && !['h264', 'hevc', 'mpeg4', 'av1'].includes(vcodec)) {
		return 'video';
	}
	if (container === 'm4v' && hasVideo && !['h264', 'hevc', 'mpeg4'].includes(vcodec)) {
		return 'video';
	}
	if (container === 'flv' && hasVideo && !['h264', 'flv1'].includes(vcodec)) {
		return 'video';
	}
	if (container === '3gp' && hasVideo && !['h263', 'h264', 'mpeg4'].includes(vcodec)) {
		return 'video';
	}
	if (container === 'wmv' && hasVideo && !['wmv1', 'wmv2', 'wmv3', 'vc1', 'msmpeg4v3'].includes(vcodec)) {
		return 'video';
	}
	return false;
}

export function isKomorebiVideoContainerAvailable(container: KomorebiVideoContainer, codec: KomorebiVideoCodec, hints?: KomorebiMediaHints): boolean {
	if (hints && hints.hasVideo === false) {
		return false;
	}
	return true;
}

export function isKomorebiVideoCodecAvailable(codec: KomorebiVideoCodec, container: KomorebiVideoContainer, hints?: KomorebiMediaHints): boolean {
	if (hints && hints.hasVideo === false) {
		return false;
	}
	if (container === 'webm') {
		return codec === 'av1' || codec === 'vp9';
	}
	if (container === 'flv') {
		return codec === 'h264';
	}
	if (container === 'avi') {
		return codec === 'h264' || codec === 'mpeg4';
	}
	if (container === 'ts') {
		return codec !== 'av1' && codec !== 'vp9';
	}
	return true;
}

export function isKomorebiAudioFormatAvailable(format: KomorebiAudioFormat, hints?: KomorebiMediaHints): boolean {
	if (hints && hints.hasAudio === false) {
		return false;
	}
	return !!format;
}

export function isKomorebiRemuxContainerAvailable(container: KomorebiRemuxContainer, hints?: KomorebiMediaHints): boolean {
	if (hints && hints.hasVideo === false && hints.hasAudio === false) {
		return false;
	}
	if (!hints || (!hints.hasVideo && !hints.hasAudio)) {
		return true;
	}
	return shouldKomorebiRemuxTranscode(container, hints) === false;
}

export function buildKomorebiFFmpegArgs(outputParams: OutputParams, outputFile: string, encoderNames: string[] = [], forceCpu = false, mediaHints?: KomorebiMediaHints): string[] | undefined {
	const workflow = outputParams.extra?.komorebiWorkflow as KomorebiWorkflow | undefined;
	if (!workflow || workflow === 'ncm') {
		return undefined;
	}

	const inputs = outputParams.input.files.map((file) => normalizePath(file.filePath)).filter(Boolean);
	const args = ['-hide_banner'];
	const inputArgs = (paths: string[]) => paths.forEach((filePath) => args.push('-i', filePath));

	if (workflow === 'video-compress') {
		const preset = outputParams.extra.komorebiPreset as KomorebiVideoPreset | undefined;
		if (!preset || !inputs[0]) {
			return undefined;
		}
		const actualPreset = normalizeKomorebiVideoPreset(preset);
		if (!forceCpu) {
			args.push('-hwaccel', 'auto');
		}
		inputArgs(actualPreset.audioSource === 'external' && inputs[1] ? [inputs[0], inputs[1]] : [inputs[0]]);
		if (actualPreset.audioSource === 'external' && inputs[1]) {
			args.push('-map', '0:v', '-map', '1:a', '-map', '0:s?');
		} else if (actualPreset.audioSource === 'none') {
			args.push('-map', '0:v');
		} else {
			args.push('-map', '0:v?', '-map', '0:a?', '-map', '0:s?', '-dn');
		}
		appendVideoEncoderArgs(args, actualPreset, encoderNames, forceCpu);
		if (actualPreset.audioSource !== 'none') {
			args.push('-c:a', ['av1', 'vp9'].includes(actualPreset.codec) || actualPreset.container === 'webm' ? 'libopus' : 'aac', '-b:a', '192k', '-c:s', 'copy');
		}
		args.push(outputFile, '-y');
		return args;
	}

	if (workflow === 'audio-convert') {
		const preset = outputParams.extra.komorebiPreset as KomorebiAudioPreset | undefined;
		if (!preset || !inputs[0]) {
			return undefined;
		}
		inputArgs([inputs[0]]);
		args.push('-vn');
		appendAudioEncoderArgs(args, preset.format, preset.quality);
		args.push(outputFile, '-y');
		return args;
	}

	if (workflow === 'remux') {
		const preset = outputParams.extra.komorebiPreset as KomorebiRemuxPreset | undefined;
		if (!preset || !inputs[0]) {
			return undefined;
		}
		inputArgs(preset.audioSource === 'external' && inputs[1] ? [inputs[0], inputs[1]] : [inputs[0]]);
		const needsTranscode = outputParams.extra.komorebiFallbackTried || !!shouldKomorebiRemuxTranscode(preset.container, mediaHints);
		if (needsTranscode) {
			const fallbackPreset: KomorebiVideoPreset = {
				scene: 'live',
				codec: preset.container === 'webm' ? 'av1' : preset.container === 'avi' ? 'mpeg4' : 'h264',
				quality: 1,
				container: (preset.container === 'wmv' || preset.container === '3gp') ? 'mp4' : preset.container as KomorebiVideoPreset['container'],
				audioSource: 'source',
			};
			if (mediaHints?.hasVideo === false) {
				if (preset.audioSource === 'external' && inputs[1]) {
					args.push('-map', '1:a?', '-dn');
				} else {
					args.push('-map', '0:a?', '-dn');
				}
				args.push('-c:a', preset.container === 'webm' ? 'libopus' : 'aac', '-b:a', '256k', '-map_metadata', '0');
				args.push(outputFile, '-y');
				return args;
			}
			if (preset.audioSource === 'external' && inputs[1]) {
				args.push('-map', '0:v?', '-map', '0:a?', '-map', '1:a?', '-map', '0:s?', '-dn');
			} else {
				args.push('-map', '0:v?', '-map', '0:a?', '-map', '0:s?', '-dn');
			}
			appendVideoEncoderArgs(args, fallbackPreset, encoderNames, forceCpu);
			args.push('-c:a', preset.container === 'webm' ? 'libopus' : 'aac', '-b:a', '256k', '-c:s', 'copy', '-map_metadata', '0');
		} else {
			if (preset.audioSource === 'external' && inputs[1]) {
				args.push('-map', '0:v?', '-map', '0:a?', '-map', '1:a?', '-map', '0:s?', '-dn', '-c', 'copy', '-c:s', 'copy', '-map_metadata', '0');
			} else {
				args.push('-map', '0:v?', '-map', '0:a?', '-map', '0:s?', '-dn', '-c', 'copy', '-c:s', 'copy', '-map_metadata', '0');
			}
		}
		args.push(outputFile, '-y');
		return args;
	}
}

export function buildNcmDumpArgs(params: NcmTaskParams): string[] {
	const args: string[] = [];
	const inputs = params.inputs.map((input) => normalizePath(input)).filter(Boolean);
	const firstDir = inputs.length === 1 && !inputs[0].toLowerCase().endsWith('.ncm');
	if (firstDir) {
		args.push('-d', inputs[0]);
		if (params.recursive) {
			args.push('-r');
		}
	} else {
		args.push(...inputs);
	}
	const outputDir = normalizeDirectoryPath(params.outputDir);
	if (outputDir) {
		args.push('-o', outputDir);
	}
	if (params.deleteSource) {
		args.push('-m');
	}
	return args;
}
