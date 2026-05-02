import { defaultParams } from './defaultParams';
import { getPathBaseName, joinPathPreserveUnc, normalizeDirectoryPathForKomorebi, normalizeFilesystemPathForKomorebi, stripOuterQuotes } from './filePath';
import { InputInfo, NcmTaskParams, OutputParams } from './types';

export type KomorebiWorkflow = 'video-compress' | 'audio-convert' | 'remux' | 'ncm';
export type KomorebiMode = 'normal';
export type KomorebiVideoScene = 'anime' | 'screen' | 'live';
export type KomorebiVideoCodec = 'h264' | 'hevc' | 'av1' | 'vp9' | 'mpeg4' | 'gif';
export type KomorebiQuality = 1 | 2 | 3 | 4;
export type KomorebiAudioSource = 'source' | 'none' | 'external';
export type KomorebiVideoContainer = 'mp4' | 'mkv' | 'webm' | 'mov' | 'm4v' | 'flv' | 'ts' | 'avi' | 'gif';
export type KomorebiVideoAspectRatio = 'source' | '16:9' | '4:3' | '1:1' | '9:16' | '21:9';
export type KomorebiVideoResolution = 'source' | '480p' | '720p' | '1080p' | '1440p' | '2160p';
export type KomorebiFrameRate = 'auto' | 5 | 10 | 12 | 15 | 24 | 25 | 30 | 48 | 50 | 60 | 75 | 90 | 100 | 120 | 144 | 165 | 240;
export type KomorebiGifFps = KomorebiFrameRate;
export type KomorebiEncodeSpeed = 'fast' | 'balanced' | 'low';
export type KomorebiAudioFormat = 'mp3' | 'flac' | 'wav' | 'aac' | 'm4a' | 'ogg' | 'wma' | 'opus' | 'ac3' | 'mp2';
export type KomorebiRemuxContainer = 'mp4' | 'mkv' | 'mov' | 'm4v' | 'webm' | 'flv' | 'avi' | 'ts' | 'wmv' | '3gp';

export interface KomorebiVideoPreset {
	scene: KomorebiVideoScene;
	codec: KomorebiVideoCodec;
	quality: KomorebiQuality;
	container: KomorebiVideoContainer;
	audioSource: KomorebiAudioSource;
	aspectRatio?: KomorebiVideoAspectRatio;
	resolution?: KomorebiVideoResolution;
	frameRate?: KomorebiFrameRate;
	/** @deprecated Kept for old persisted settings. Use frameRate instead. */
	gifFps?: KomorebiGifFps;
	encodeSpeed?: KomorebiEncodeSpeed;
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
	aspectRatio?: KomorebiVideoAspectRatio;
	resolution?: KomorebiVideoResolution;
	frameRate?: KomorebiFrameRate;
	encodeSpeed?: KomorebiEncodeSpeed;
	externalAudio?: string;
	outputDir?: string;
	outputNameTemplate?: string;
}

export interface KomorebiMediaHints {
	hasVideo?: boolean;
	hasAudio?: boolean;
	videoCodec?: string;
	audioCodec?: string;
	videoFps?: number;
}

export const defaultKomorebiVideoPreset: KomorebiVideoPreset = {
	scene: 'anime',
	codec: 'hevc',
	quality: 2,
	container: 'mp4',
	audioSource: 'source',
	aspectRatio: 'source',
	resolution: 'source',
	frameRate: 'auto',
	gifFps: 'auto',
	encodeSpeed: 'balanced',
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
	aspectRatio: 'source',
	resolution: 'source',
	frameRate: 'auto',
	encodeSpeed: 'balanced',
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

const gifProfileDefaults = (quality: KomorebiQuality) => {
	switch (quality) {
		case 1:
			return { fps: 15, width: 480, colors: 96, bayerScale: 4 };
		case 2:
			return { fps: 12, width: 360, colors: 64, bayerScale: 5 };
		case 3:
			return { fps: 8, width: 280, colors: 48, bayerScale: 5 };
		case 4:
		default:
			return { fps: 6, width: 200, colors: 32, bayerScale: 5 };
	}
};

export const komorebiGifMaxFps = 60;
export const komorebiFrameRateMaxFps = 240;

const roundFps = (fps: number) => Math.round(fps * 1000) / 1000;
const validFps = (fps?: number) => Number.isFinite(fps) && fps! > 0 ? fps! : undefined;
const capFps = (fps: number, sourceFps?: number, maxFps = komorebiFrameRateMaxFps) => {
	const sourceLimit = validFps(sourceFps) ?? maxFps;
	const capped = Math.min(Math.max(1, fps), sourceLimit, maxFps);
	return roundFps(capped);
};

const normalizeKomorebiFrameRateValue = (
	frameRate: KomorebiFrameRate | string | number | null | undefined,
	fallback: KomorebiFrameRate = 'auto',
): KomorebiFrameRate => {
	if (frameRate === 'auto' || frameRate === undefined || frameRate === null) {
		return frameRate === 'auto' ? 'auto' : fallback;
	}
	const numeric = typeof frameRate === 'number' ? frameRate : Number(frameRate);
	return komorebiFrameRateOptions.some((item) => item.value === numeric)
		? numeric as KomorebiFrameRate
		: fallback;
};

export const getKomorebiPresetFrameRate = (
	preset: Pick<KomorebiVideoPreset, 'frameRate' | 'gifFps'> | Pick<KomorebiRemuxPreset, 'frameRate'>,
): KomorebiFrameRate => normalizeKomorebiFrameRateValue(
	'frameRate' in preset ? preset.frameRate : undefined,
	'gifFps' in preset ? normalizeKomorebiFrameRateValue(preset.gifFps, 'auto') : 'auto',
);

export const getKomorebiEffectiveFrameRate = (
	frameRate: KomorebiFrameRate | undefined = 'auto',
	sourceFps?: number,
	maxFps = komorebiFrameRateMaxFps,
) => {
	if (frameRate === 'auto' || frameRate === undefined) {
		return undefined;
	}
	return capFps(Number(frameRate) || maxFps, sourceFps, maxFps);
};

export const getKomorebiRecommendedFrameRate = (
	preset: Pick<KomorebiVideoPreset, 'container' | 'quality' | 'frameRate' | 'gifFps'> | Pick<KomorebiRemuxPreset, 'container' | 'frameRate'>,
	sourceFps?: number,
	mode: 'video' | 'remux' = 'video',
) => {
	const source = validFps(sourceFps);
	const container = 'container' in preset ? preset.container : undefined;
	if (container === 'gif') {
		const quality = 'quality' in preset ? preset.quality : 2;
		return capFps(gifProfileDefaults(quality || 2).fps, source, komorebiGifMaxFps);
	}
	if (!source) {
		return undefined;
	}
	if (mode === 'remux') {
		return capFps(source, source);
	}
	const quality = 'quality' in preset ? preset.quality : 2;
	const qualityCaps: Record<KomorebiQuality, number> = {
		1: 120,
		2: 60,
		3: 30,
		4: 24,
	};
	const target = Math.min(source, qualityCaps[quality || 2]);
	return capFps(target, source);
};

export const getKomorebiEffectiveGifFps = (
	quality: KomorebiQuality,
	gifFps: KomorebiGifFps | undefined = 'auto',
	sourceFps?: number,
) => {
	const defaultFps = gifProfileDefaults(quality).fps;
	const normalizedFps = normalizeKomorebiFrameRateValue(gifFps, 'auto');
	const requestedFps = normalizedFps === 'auto' || normalizedFps === undefined ? defaultFps : Number(normalizedFps);
	return capFps(requestedFps || defaultFps, sourceFps, komorebiGifMaxFps);
};

export const getKomorebiGifEncodeProfile = (
	quality: KomorebiQuality,
	gifFps?: KomorebiGifFps,
	sourceFps?: number,
) => {
	const profile = gifProfileDefaults(quality);
	return {
		...profile,
		fps: getKomorebiEffectiveGifFps(quality, gifFps, sourceFps),
	};
};

const even = (value: number) => Math.max(2, Math.round(value / 2) * 2);

const aspectRatioValues: Record<Exclude<KomorebiVideoAspectRatio, 'source'>, number> = {
	'16:9': 16 / 9,
	'4:3': 4 / 3,
	'1:1': 1,
	'9:16': 9 / 16,
	'21:9': 21 / 9,
};

const resolutionHeights: Record<Exclude<KomorebiVideoResolution, 'source'>, number> = {
	'480p': 480,
	'720p': 720,
	'1080p': 1080,
	'1440p': 1440,
	'2160p': 2160,
};

export const parseKomorebiResolution = (resolution?: string, fallbackWidth = 1920, fallbackHeight = 1080) => {
	const fallback = { width: fallbackWidth, height: fallbackHeight };
	const match = getKomorebiResolutionText(resolution).match(/^(\d{2,5})x(\d{2,5})$/);
	if (!match) {
		return fallback;
	}
	const width = Number.parseInt(match[1], 10);
	const height = Number.parseInt(match[2], 10);
	const ratio = width / height;
	if (
		!Number.isFinite(width) ||
		!Number.isFinite(height) ||
		width < 16 ||
		height < 16 ||
		ratio < 0.2 ||
		ratio > 5
	) {
		return fallback;
	}
	return { width, height };
};

export const getKomorebiResolutionText = (resolution?: string) => {
	const source = `${resolution || ''}`;
	const matches = source.matchAll(/(?:^|[^\da-zA-Z])(\d{2,5})\s*x\s*(\d{2,5})(?=$|[^\da-zA-Z])/g);
	for (const match of matches) {
		const width = Number.parseInt(match[1], 10);
		const height = Number.parseInt(match[2], 10);
		const ratio = width / height;
		if (
			Number.isFinite(width) &&
			Number.isFinite(height) &&
			width >= 16 &&
			height >= 16 &&
			ratio >= 0.2 &&
			ratio <= 5
		) {
			return `${width}x${height}`;
		}
	}
	return '';
};

export const komorebiVideoAspectRatios: { value: KomorebiVideoAspectRatio; label: string }[] = [
	{ value: 'source', label: 'Source' },
	{ value: '16:9', label: '16:9' },
	{ value: '4:3', label: '4:3' },
	{ value: '1:1', label: '1:1' },
	{ value: '9:16', label: '9:16' },
	{ value: '21:9', label: '21:9' },
];

export const komorebiVideoResolutions: { value: KomorebiVideoResolution; label: string }[] = [
	{ value: 'source', label: 'Source' },
	{ value: '480p', label: '480p' },
	{ value: '720p', label: '720p' },
	{ value: '1080p', label: '1080p' },
	{ value: '1440p', label: '1440p' },
	{ value: '2160p', label: '2160p' },
];

export const komorebiFrameRateOptions: { value: KomorebiFrameRate; label: string }[] = [
	{ value: 'auto', label: 'Auto' },
	{ value: 5, label: '5 FPS' },
	{ value: 10, label: '10 FPS' },
	{ value: 12, label: '12 FPS' },
	{ value: 15, label: '15 FPS' },
	{ value: 24, label: '24 FPS' },
	{ value: 25, label: '25 FPS' },
	{ value: 30, label: '30 FPS' },
	{ value: 48, label: '48 FPS' },
	{ value: 50, label: '50 FPS' },
	{ value: 60, label: '60 FPS' },
	{ value: 75, label: '75 FPS' },
	{ value: 90, label: '90 FPS' },
	{ value: 100, label: '100 FPS' },
	{ value: 120, label: '120 FPS' },
	{ value: 144, label: '144 FPS' },
	{ value: 165, label: '165 FPS' },
	{ value: 240, label: '240 FPS' },
];

export const komorebiGifFpsOptions = komorebiFrameRateOptions;

export const komorebiEncodeSpeeds: { value: KomorebiEncodeSpeed; label: string }[] = [
	{ value: 'fast', label: 'Fast' },
	{ value: 'balanced', label: 'Balanced' },
	{ value: 'low', label: 'Low usage' },
];

export const getKomorebiResolutionOptions = (
	aspectRatio: KomorebiVideoAspectRatio = 'source',
	sourceWidth = 1920,
	sourceHeight = 1080,
	sourceLabel = 'Source',
) => komorebiVideoResolutions.map((item) => {
	if (item.value === 'source') {
		return { ...item, label: sourceLabel };
	}
	const { width, height } = getKomorebiOutputDimensions(
		sourceWidth,
		sourceHeight,
		{ aspectRatio, resolution: item.value, quality: 2 },
		'video',
	);
	return {
		...item,
		label: `${width}x${height}`,
	};
});

export const getKomorebiOutputDimensions = (
	sourceWidth: number,
	sourceHeight: number,
	preset: Pick<KomorebiVideoPreset, 'aspectRatio' | 'resolution' | 'quality'>,
	mode: 'video' | 'gif' = 'video',
) => {
	const safeWidth = Number.isFinite(sourceWidth) && sourceWidth > 0 ? sourceWidth : 1920;
	const safeHeight = Number.isFinite(sourceHeight) && sourceHeight > 0 ? sourceHeight : 1080;
	const aspectRatio = preset.aspectRatio || 'source';
	const resolution = preset.resolution || 'source';
	const rawSourceRatio = safeWidth / safeHeight;
	const sourceRatio = Number.isFinite(rawSourceRatio) && rawSourceRatio >= 0.2 && rawSourceRatio <= 5
		? rawSourceRatio
		: 16 / 9;
	const targetRatio = aspectRatio === 'source' ? sourceRatio : aspectRatioValues[aspectRatio];

	if (mode === 'gif' && resolution === 'source') {
		const profile = getKomorebiGifEncodeProfile(preset.quality || 2);
		const targetWidth = Math.min(safeWidth, profile.width);
		const targetHeight = aspectRatio === 'source' ? targetWidth / sourceRatio : targetWidth / targetRatio;
		return { width: even(targetWidth), height: even(targetHeight) };
	}

	if (resolution === 'source') {
		const targetHeight = safeHeight;
		const targetWidth = aspectRatio === 'source' ? safeWidth : targetHeight * targetRatio;
		return { width: even(targetWidth), height: even(targetHeight) };
	}

	const targetHeight = resolutionHeights[resolution];
	return { width: even(targetHeight * targetRatio), height: even(targetHeight) };
};

const getKomorebiScaleFlags = (speed?: KomorebiEncodeSpeed) => {
	if (speed === 'fast') {
		return 'fast_bilinear';
	}
	if (speed === 'low') {
		return 'bilinear';
	}
	return 'bicubic';
};

export const getKomorebiVideoTransformFilter = (preset: Pick<KomorebiVideoPreset, 'aspectRatio' | 'resolution' | 'encodeSpeed'>) => {
	const aspectRatio = preset.aspectRatio || 'source';
	const resolution = preset.resolution || 'source';
	const scaleFlags = getKomorebiScaleFlags(preset.encodeSpeed);
	if (aspectRatio === 'source' && resolution === 'source') {
		return '';
	}
	if (aspectRatio === 'source') {
		const height = resolutionHeights[resolution as Exclude<KomorebiVideoResolution, 'source'>];
		if (!height) {
			return '';
		}
		return `scale=-2:${height}:flags=${scaleFlags}`;
	}
	const ratio = aspectRatioValues[aspectRatio];
	if (!ratio) {
		return '';
	}
	if (resolution === 'source') {
		return `pad=w='ceil(max(iw,ih*${ratio})/2)*2':h='ceil(max(ih,iw/${ratio})/2)*2':x='(ow-iw)/2':y='(oh-ih)/2':color=black,setsar=1`;
	}
	const { width, height } = getKomorebiOutputDimensions(1920, 1080, { ...preset, quality: 2 } as KomorebiVideoPreset, 'video');
	return `scale=${width}:${height}:force_original_aspect_ratio=decrease:force_divisible_by=2:flags=${scaleFlags},pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:color=black,setsar=1`;
};

const joinKomorebiVideoFilters = (...filters: Array<string | undefined>) => filters.filter(Boolean).join(',');

export const getKomorebiVideoFilter = (
	preset: Pick<KomorebiVideoPreset, 'container' | 'quality' | 'aspectRatio' | 'resolution' | 'frameRate' | 'gifFps' | 'encodeSpeed'>,
	sourceFps?: number,
	mode: 'video' | 'remux' = 'video',
) => {
	const frameRate = getKomorebiPresetFrameRate(preset);
	const recommendedFps = mode === 'remux' ? undefined : getKomorebiRecommendedFrameRate(preset, sourceFps, mode);
	const fps = frameRate === 'auto' ? recommendedFps : getKomorebiEffectiveFrameRate(frameRate, sourceFps);
	return joinKomorebiVideoFilters(
		fps ? `fps=${fps}` : '',
		getKomorebiVideoTransformFilter(preset),
	);
};

const getKomorebiGifTransformFilter = (preset: KomorebiVideoPreset, sourceFps?: number) => {
	const profile = getKomorebiGifEncodeProfile(preset.quality, getKomorebiPresetFrameRate(preset), sourceFps);
	const aspectRatio = preset.aspectRatio || 'source';
	const resolution = preset.resolution || 'source';
	const scaleFlags = getKomorebiScaleFlags(preset.encodeSpeed);
	if (aspectRatio === 'source' && resolution === 'source') {
		return `scale='min(${profile.width},iw)':-2:flags=${scaleFlags}`;
	}
	if (aspectRatio === 'source') {
		const height = resolutionHeights[resolution as Exclude<KomorebiVideoResolution, 'source'>];
		if (!height) {
			return `scale='min(${profile.width},iw)':-2:flags=${scaleFlags}`;
		}
		return `scale=-2:${height}:flags=${scaleFlags}`;
	}
	const { width, height } = getKomorebiOutputDimensions(1920, 1080, preset, 'gif');
	return `scale=${width}:${height}:force_original_aspect_ratio=decrease:force_divisible_by=2:flags=${scaleFlags},pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:color=black,setsar=1`;
};

export const getKomorebiGifFilter = (quality: KomorebiQuality, progressProbe = false, preset?: KomorebiVideoPreset, sourceFps?: number) => {
	const profile = getKomorebiGifEncodeProfile(quality, preset ? getKomorebiPresetFrameRate(preset) : undefined, sourceFps);
	const probe = progressProbe ? ',showinfo' : '';
	const transform = preset ? getKomorebiGifTransformFilter(preset, sourceFps) : `scale='min(${profile.width},iw)':-2:flags=lanczos`;
	return `[0:v]fps=${profile.fps},${transform}${probe}[gifout]`;
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

const outputPattern = (outputDir: string | undefined, suffix: string, fileNameTemplate?: string) => {
	const normalized = normalizeDirectoryPathForKomorebi(outputDir);
	const safeTemplate = stripOuterQuotes(fileNameTemplate).replace(/[\\/]/g, '_').trim();
	const filename = safeTemplate || `[filename]_${suffix}`;
	const filenameWithExt = filename.includes('[fileext]') ? filename : `${filename}.[fileext]`;
	return normalized ? joinPathPreserveUnc(normalized, filenameWithExt) : `[filedir]/${filenameWithExt}`;
};

const inputFiles = (inputs: string[]) => inputs.filter(Boolean).map((filePath) => ({
	filePath: normalizeFilesystemPathForKomorebi(filePath),
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
		case 'gif': return 'gif';
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
	{ value: 'gif', label: 'GIF' },
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
	const normalized = { ...defaultKomorebiVideoPreset, ...preset };
	if (!komorebiVideoAspectRatios.some((item) => item.value === normalized.aspectRatio)) {
		normalized.aspectRatio = 'source';
	}
	if (!komorebiVideoResolutions.some((item) => item.value === normalized.resolution)) {
		normalized.resolution = 'source';
	}
	normalized.frameRate = normalizeKomorebiFrameRateValue(
		normalized.frameRate,
		normalizeKomorebiFrameRateValue(normalized.gifFps, defaultKomorebiVideoPreset.frameRate || 'auto'),
	);
	normalized.gifFps = normalized.frameRate;
	if (!komorebiEncodeSpeeds.some((item) => item.value === normalized.encodeSpeed)) {
		normalized.encodeSpeed = defaultKomorebiVideoPreset.encodeSpeed;
	}
	if (normalized.container === 'gif') {
		normalized.codec = 'gif';
		normalized.audioSource = 'none';
	} else if (normalized.container === 'webm' && !['av1', 'vp9'].includes(normalized.codec)) {
		normalized.codec = 'av1';
	} else if (normalized.codec === 'gif') {
		normalized.codec = 'h264';
	} else if (normalized.container === 'flv') {
		normalized.codec = 'h264';
	} else if (normalized.container === 'avi') {
		normalized.codec = normalized.codec === 'mpeg4' ? 'mpeg4' : 'h264';
	} else if (normalized.container === 'ts' && normalized.codec === 'av1') {
		normalized.codec = 'hevc';
	}
	return normalized;
}

export function normalizeKomorebiRemuxPreset(preset: KomorebiRemuxPreset): KomorebiRemuxPreset {
	const normalized = { ...defaultKomorebiRemuxPreset, ...preset };
	if (!komorebiRemuxContainers.some((item) => item.value === normalized.container)) {
		normalized.container = defaultKomorebiRemuxPreset.container;
	}
	if (!komorebiVideoAspectRatios.some((item) => item.value === normalized.aspectRatio)) {
		normalized.aspectRatio = 'source';
	}
	if (!komorebiVideoResolutions.some((item) => item.value === normalized.resolution)) {
		normalized.resolution = 'source';
	}
	normalized.frameRate = normalizeKomorebiFrameRateValue(normalized.frameRate, defaultKomorebiRemuxPreset.frameRate || 'auto');
	if (!komorebiEncodeSpeeds.some((item) => item.value === normalized.encodeSpeed)) {
		normalized.encodeSpeed = defaultKomorebiRemuxPreset.encodeSpeed;
	}
	return normalized;
}

export function normalizeKomorebiRemuxContainer(container: KomorebiRemuxContainer): KomorebiRemuxContainer {
	return normalizeKomorebiRemuxPreset({ container }).container;
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
	const gifFilter = getKomorebiGifFilter(actualPreset.quality, false, actualPreset);
	const codec = actualPreset.codec === 'h264' ? 'libx264'
		: actualPreset.codec === 'hevc' ? 'libx265'
			: actualPreset.codec === 'vp9' ? 'libvpx-vp9'
				: actualPreset.codec === 'mpeg4' ? 'mpeg4'
					: actualPreset.codec === 'gif' ? 'gif'
						: 'libsvtav1';
	const scene = sceneParams[actualPreset.scene];
	const highQuality = actualPreset.quality === 1 || actualPreset.quality === 2;
	const videoFilter = getKomorebiVideoFilter(actualPreset);
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
		framerate: actualPreset.frameRate === 'auto' ? '不改变' : `${actualPreset.frameRate}`,
		ratecontrol: 'CRF',
		ratevalue: crf,
		detail: {},
		custom: actualPreset.container === 'gif' ? `-filter_complex "${gifFilter}" -map [gifout] -an -gifflags +offsetting+transdiff -loop 0` : [...maps, ...(videoFilter ? ['-vf', videoFilter] : []), ...codecTuning].join(' '),
	};
	output.audio = {
		acodec: actualPreset.audioSource === 'none' || actualPreset.container === 'gif' ? '禁用' : ['av1', 'vp9'].includes(actualPreset.codec) || actualPreset.container === 'webm' ? 'libopus' : 'aac',
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
		komorebiPreset: { ...actualPreset, outputDir: normalizeDirectoryPathForKomorebi(actualPreset.outputDir), outputNameTemplate: stripOuterQuotes(actualPreset.outputNameTemplate) },
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
		komorebiPreset: { ...preset, outputDir: normalizeDirectoryPathForKomorebi(preset.outputDir), outputNameTemplate: stripOuterQuotes(preset.outputNameTemplate) },
	};
	return params;
}

export function buildKomorebiRemuxParams(inputs: string[], preset: KomorebiRemuxPreset): OutputParams {
	const actualPreset = normalizeKomorebiRemuxPreset(preset);
	const params = cloneDefaultParams();
	ensureInputFiles(params, inputs.slice(0, 1));
	if (actualPreset.audioSource === 'external' && actualPreset.externalAudio?.trim()) {
		params.input.files.push(...inputFiles([actualPreset.externalAudio]));
	}
	const output = params.outputs[0];
	const hasVideoTransform = actualPreset.aspectRatio !== 'source' || actualPreset.resolution !== 'source' || actualPreset.frameRate !== 'auto';
	output.video = {
		vcodec: hasVideoTransform ? 'libx264' : 'copy',
		resolution: '不改变',
		framerate: actualPreset.frameRate === 'auto' ? '不改变' : `${actualPreset.frameRate}`,
		detail: {},
		custom: hasVideoTransform ? '-map 0 -c:s copy -preset medium -pix_fmt yuv420p' : '-map 0 -c:s copy',
	};
	output.audio = {
		acodec: 'copy',
		vol: 0,
		detail: {},
	};
	output.mux = {
		format: mapContainer(actualPreset.container),
		moveflags: ['mp4', 'm4v', 'mov'].includes(actualPreset.container),
		filePath: outputPattern(actualPreset.outputDir, 'remux', actualPreset.outputNameTemplate),
		begin: '',
		end: '',
		detail: {},
		keepMetadata: 'both',
	};
	params.extra = {
		presetName: 'Komorebi 转封装',
		komorebiWorkflow: 'remux',
		komorebiPreset: { ...actualPreset, outputDir: normalizeDirectoryPathForKomorebi(actualPreset.outputDir), outputNameTemplate: stripOuterQuotes(actualPreset.outputNameTemplate) },
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
	const codec = preset.codec;
	const crf = `${qualityCrf[preset.quality]}`;
	const scene = sceneParams[preset.scene];
	const highQuality = preset.quality === 1 || preset.quality === 2;
	const encoder = targetEncoder(codec, encoderNames, forceCpu);
	const speed = preset.encodeSpeed || 'balanced';
	const nvencPreset = speed === 'fast' ? 'p1' : speed === 'low' ? (highQuality ? 'p5' : 'p4') : (highQuality ? scene.hwPresetHigh : scene.hwPresetLow);
	const qsvPreset = speed === 'fast' ? 'veryfast' : speed === 'low' ? 'medium' : 'slower';
	const svtPreset = speed === 'fast' ? '5' : speed === 'low' ? '8' : '6';
	const vp9CpuUsed = speed === 'fast' ? '5' : speed === 'low' ? '4' : '2';
	const cpuPreset = speed === 'fast' ? 'veryfast' : speed === 'low' ? 'fast' : 'medium';
	const amfQuality = speed === 'fast' ? 'speed' : speed === 'low' ? 'quality' : 'balanced';

	if (encoder.endsWith('_nvenc')) {
		args.push('-c:v', encoder, '-preset', nvencPreset, '-rc', 'vbr', '-cq', crf);
		if (speed === 'fast') {
			args.push('-multipass', 'disabled');
		}
		if (preset.scene === 'anime') {
			args.push('-spatial-aq', '1', '-tune', 'hq', '-bf', '3');
		} else if (preset.scene === 'screen') {
			args.push('-spatial-aq', '1', '-tune', 'hq', '-bf', '4', '-g', '300');
		} else {
			args.push('-spatial-aq', '1', '-temporal-aq', '1', '-tune', 'hq', '-bf', '3');
		}
	} else if (encoder.endsWith('_qsv')) {
		args.push('-c:v', encoder, '-preset', qsvPreset, '-global_quality', crf);
		if (speed !== 'fast') {
			args.push('-look_ahead', '1');
		}
	} else if (encoder.endsWith('_amf')) {
		args.push('-c:v', encoder, '-rc', 'cqp', '-qp_i', crf, '-qp_p', crf, '-qp_b', crf);
		args.push('-quality', amfQuality);
	} else if (codec === 'av1') {
		args.push('-c:v', 'libsvtav1', '-preset', svtPreset, '-crf', crf, '-svtav1-params', highQuality ? scene.svtHigh : scene.svtLow);
	} else if (codec === 'vp9') {
		args.push('-c:v', 'libvpx-vp9', '-b:v', '0', '-crf', crf, '-deadline', 'good', '-cpu-used', vp9CpuUsed);
	} else if (codec === 'mpeg4') {
		args.push('-c:v', 'mpeg4', '-q:v', highQuality ? '3' : '5');
	} else if (codec === 'hevc') {
		args.push('-c:v', 'libx265', '-pix_fmt', 'yuv420p10le', '-preset', cpuPreset, '-crf', crf);
		if (preset.scene === 'anime') {
			args.push('-tune', 'animation');
		}
		args.push('-x265-params', highQuality ? scene.x265High : scene.x265Low);
	} else {
		args.push('-c:v', 'libx264', '-preset', cpuPreset, '-crf', crf, '-tune', preset.scene === 'anime' ? 'animation' : 'film', '-pix_fmt', 'yuv420p');
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

const getKomorebiGifThreadCount = (speed: KomorebiEncodeSpeed | undefined) => {
	if (speed === 'fast') {
		return undefined;
	}
	if (speed === 'low') {
		return '1';
	}
	return '2';
};

const resolveKomorebiInputPath = (filePath: string, inputDir?: string) => {
	const normalized = normalizeFilesystemPathForKomorebi(filePath);
	if (!inputDir) {
		return normalized;
	}
	const normalizedDir = inputDir.replace(/[\\/]$/, '');
	return `${normalizedDir}/${getPathBaseName(normalized) || normalized}`;
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
		videoFps: Number.isFinite(videoStream?.fps) && videoStream!.fps! > 0 ? videoStream!.fps : undefined,
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
	if (container === 'gif') {
		return codec === 'gif';
	}
	if (codec === 'gif') {
		return false;
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

export function buildKomorebiFFmpegArgs(outputParams: OutputParams, outputFile: string, encoderNames: string[] = [], forceCpu = false, mediaHints?: KomorebiMediaHints, inputDir?: string): string[] | undefined {
	const workflow = outputParams.extra?.komorebiWorkflow as KomorebiWorkflow | undefined;
	if (!workflow || workflow === 'ncm') {
		return undefined;
	}

	const inputs = outputParams.input.files.map((file) => resolveKomorebiInputPath(file.filePath, inputDir)).filter(Boolean);
	const args = ['-hide_banner'];
	const inputArgs = (paths: string[]) => paths.forEach((filePath) => args.push('-i', filePath));

	if (workflow === 'video-compress') {
		const preset = outputParams.extra.komorebiPreset as KomorebiVideoPreset | undefined;
		if (!preset || !inputs[0]) {
			return undefined;
		}
		const actualPreset = normalizeKomorebiVideoPreset(preset);
		if (!forceCpu && (actualPreset.container !== 'gif' || actualPreset.encodeSpeed !== 'low')) {
			args.push('-hwaccel', 'auto');
		}
		inputArgs(actualPreset.audioSource === 'external' && inputs[1] ? [inputs[0], inputs[1]] : [inputs[0]]);
		if (actualPreset.container === 'gif') {
			const gifThreads = getKomorebiGifThreadCount(actualPreset.encodeSpeed);
			if (gifThreads) {
				args.push('-threads', gifThreads, '-filter_threads', gifThreads);
			}
			args.push(
				'-filter_complex', getKomorebiGifFilter(actualPreset.quality, true, actualPreset, mediaHints?.videoFps),
				'-map', '[gifout]',
				'-an',
				'-gifflags', '+offsetting+transdiff',
				'-loop', '0',
				outputFile,
				'-y',
			);
			return args;
		}
		if (actualPreset.audioSource === 'external' && inputs[1]) {
			args.push('-map', '0:v', '-map', '1:a', '-map', '0:s?');
		} else if (actualPreset.audioSource === 'none') {
			args.push('-map', '0:v');
		} else {
			args.push('-map', '0:v?', '-map', '0:a?', '-map', '0:s?', '-dn');
		}
		const videoFilter = getKomorebiVideoFilter(actualPreset, mediaHints?.videoFps);
		if (videoFilter) {
			args.push('-vf', videoFilter);
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
		const actualPreset = normalizeKomorebiRemuxPreset(preset);
		inputArgs(actualPreset.audioSource === 'external' && inputs[1] ? [inputs[0], inputs[1]] : [inputs[0]]);
		const needsFrameRateTransform = actualPreset.frameRate !== 'auto' && mediaHints?.hasVideo !== false;
		const needsVideoTransform = actualPreset.aspectRatio !== 'source' || actualPreset.resolution !== 'source' || needsFrameRateTransform;
		const needsTranscode = needsVideoTransform || outputParams.extra.komorebiFallbackTried || !!shouldKomorebiRemuxTranscode(actualPreset.container, mediaHints);
		if (needsTranscode) {
			const fallbackPreset: KomorebiVideoPreset = {
				scene: 'live',
				codec: actualPreset.container === 'webm' ? 'av1' : actualPreset.container === 'avi' ? 'mpeg4' : 'h264',
				quality: 1,
				container: (actualPreset.container === 'wmv' || actualPreset.container === '3gp') ? 'mp4' : actualPreset.container as KomorebiVideoPreset['container'],
				audioSource: 'source',
				aspectRatio: actualPreset.aspectRatio,
				resolution: actualPreset.resolution,
				frameRate: actualPreset.frameRate,
				encodeSpeed: actualPreset.encodeSpeed,
			};
			if (mediaHints?.hasVideo === false) {
				if (actualPreset.audioSource === 'external' && inputs[1]) {
					args.push('-map', '1:a?', '-dn');
				} else {
					args.push('-map', '0:a?', '-dn');
				}
				args.push('-c:a', actualPreset.container === 'webm' ? 'libopus' : 'aac', '-b:a', '256k', '-map_metadata', '0');
				args.push(outputFile, '-y');
				return args;
			}
			if (actualPreset.audioSource === 'external' && inputs[1]) {
				args.push('-map', '0:v?', '-map', '0:a?', '-map', '1:a?', '-map', '0:s?', '-dn');
			} else {
				args.push('-map', '0:v?', '-map', '0:a?', '-map', '0:s?', '-dn');
			}
			const videoFilter = getKomorebiVideoFilter(fallbackPreset, mediaHints?.videoFps, 'remux');
			if (videoFilter) {
				args.push('-vf', videoFilter);
			}
			appendVideoEncoderArgs(args, fallbackPreset, encoderNames, forceCpu);
			args.push('-c:a', actualPreset.container === 'webm' ? 'libopus' : 'aac', '-b:a', '256k', '-c:s', 'copy', '-map_metadata', '0');
		} else {
			if (actualPreset.audioSource === 'external' && inputs[1]) {
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
	const inputs = params.inputs.map((input) => normalizeFilesystemPathForKomorebi(input)).filter(Boolean);
	const firstDir = inputs.length === 1 && !inputs[0].toLowerCase().endsWith('.ncm');
	if (firstDir) {
		args.push('-d', inputs[0]);
		if (params.recursive) {
			args.push('-r');
		}
	} else {
		args.push(...inputs);
	}
	const outputDir = normalizeDirectoryPathForKomorebi(params.outputDir);
	if (outputDir) {
		args.push('-o', outputDir);
	}
	if (params.deleteSource) {
		args.push('-m');
	}
	return args;
}
