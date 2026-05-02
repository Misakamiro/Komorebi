<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import { useAppStore } from '@renderer/stores/appStore';
import nodeBridge from '@renderer/bridges/nodeBridge';
import { formatSize } from '@common/utils';
import { TaskStatus, type InputInfo, type StreamInfo } from '@common/types';
import i11n from '@common/i11n/i11n';
import {
	getKomorebiMediaHints,
	getKomorebiEffectiveFrameRate,
	getKomorebiEffectiveGifFps,
	getKomorebiGifEncodeProfile,
	getKomorebiOutputDimensions,
	getKomorebiRecommendedFrameRate,
	getKomorebiResolutionOptions,
	komorebiGifMaxFps,
	isKomorebiAudioFormatAvailable,
	isKomorebiRemuxContainerAvailable,
	isKomorebiVideoCodecAvailable,
	isKomorebiVideoContainerAvailable,
	komorebiAudioFormats,
	komorebiEncodeSpeeds,
	komorebiFrameRateOptions,
	komorebiNcmFormats,
	komorebiRemuxContainers,
	komorebiVideoAspectRatios,
	komorebiVideoContainers,
	getKomorebiResolutionText,
	parseKomorebiResolution,
	type KomorebiFrameRate,
	type KomorebiVideoPreset,
	type KomorebiVideoResolution,
	normalizeKomorebiRemuxPreset,
	normalizeKomorebiVideoPreset,
} from '@common/komorebiPresets';

const appStore = useAppStore();

const selectedTaskCount = computed(() => appStore.selectedTask.size);
const selectedNcmTaskCount = computed(() => [...appStore.selectedTask].filter((id) => appStore.currentServer?.data.tasks[id]?.kind === 'ncm').length);
const hasVideoExternalAudio = computed(() => appStore.komorebi.video.audioSource === 'external');
const hasRemuxExternalAudio = computed(() => appStore.komorebi.remux.audioSource === 'external');
const isGifVideoContainer = computed(() => appStore.komorebi.video.container === 'gif');
const isVideoStream = (stream: StreamInfo) => `${stream.type || ''}`.toLowerCase() === 'video';
const isAudioStream = (stream: StreamInfo) => `${stream.type || ''}`.toLowerCase() === 'audio';
const tr = computed(() => {
	appStore.frontendSettings.language;
	return i11n.frontend.komorebi;
});
const interactionPulseKey = ref(0);
const actualSourceBytes = ref<number>();
const actualOutputBytes = ref<number>();
const metadataRefreshPending = ref(false);

const selectedTaskId = computed(() => [...appStore.selectedTask][0]);
const firstSelectedTask = computed(() => {
	const id = selectedTaskId.value;
	if (id !== undefined) {
		return appStore.currentServer?.data.tasks[id];
	}
	return undefined;
});

const currentInputInfo = computed<InputInfo | undefined>(() => {
	const task = firstSelectedTask.value;
	return task?.before?.find((input) => input.streams?.some((stream) => isVideoStream(stream) || isAudioStream(stream)));
});
const videoInputInfo = computed<InputInfo | undefined>(() => {
	const task = firstSelectedTask.value;
	return task?.before?.find((input) => input.streams?.some(isVideoStream));
});
const firstTaskInputPath = computed(() => firstSelectedTask.value?.after?.input?.files?.find((file) => file.filePath && !file.filePath.startsWith('['))?.filePath);
const mediaHints = computed(() => getKomorebiMediaHints(currentInputInfo.value));
const hasKnownInput = computed(() => !!currentInputInfo.value?.streams?.length);
const selectionHint = computed(() => {
	if (!hasKnownInput.value) {
		return tr.value.hints.noInput;
	}
	if (mediaHints.value.hasVideo && mediaHints.value.hasAudio) {
		return tr.value.hints.hasVideoAudio;
	}
	if (mediaHints.value.hasVideo) {
		return tr.value.hints.hasVideo;
	}
	if (mediaHints.value.hasAudio) {
		return tr.value.hints.hasAudio;
	}
	return tr.value.hints.unknown;
});
const videoCodecOptions = [
	{ value: 'h264', label: 'H.264' },
	{ value: 'hevc', label: 'H.265/HEVC' },
	{ value: 'av1', label: 'AV1' },
	{ value: 'vp9', label: 'VP9' },
	{ value: 'mpeg4', label: 'MPEG-4' },
	{ value: 'gif', label: 'GIF' },
] as const;
const videoContainerOptions = computed(() => komorebiVideoContainers.map((item) => ({
	...item,
	disabled: !isKomorebiVideoContainerAvailable(item.value, appStore.komorebi.video.codec, hasKnownInput.value ? mediaHints.value : undefined),
})));
const videoCodecSelectOptions = computed(() => videoCodecOptions.map((item) => ({
	...item,
	disabled: !isKomorebiVideoCodecAvailable(item.value, appStore.komorebi.video.container, hasKnownInput.value ? mediaHints.value : undefined),
})));
const videoAspectRatioOptions = computed(() => komorebiVideoAspectRatios.map((item) => ({
	...item,
	label: item.value === 'source' ? tr.value.options.aspectSource : `${tr.value.options.aspectStandard} ${item.label}`,
})));
const videoSourceDimensions = computed(() => {
	const videoStream = videoInputInfo.value?.streams.find(isVideoStream) as StreamInfo | undefined;
	return parseKomorebiResolution(videoStream?.resolution);
});
const videoSourceResolutionText = computed(() => {
	const videoStream = videoInputInfo.value?.streams.find(isVideoStream) as StreamInfo | undefined;
	return getKomorebiResolutionText(videoStream?.resolution);
});
const videoSourceResolutionKnown = computed(() => !!videoSourceResolutionText.value);
const videoSourceResolutionPending = computed(() => metadataRefreshPending.value && !!firstTaskInputPath.value && !videoSourceResolutionKnown.value);
const currentVideoPreset = computed(() => normalizeKomorebiVideoPreset({ ...appStore.komorebi.video }));
const currentRemuxPreset = computed(() => normalizeKomorebiRemuxPreset({ ...appStore.komorebi.remux }));
const videoSourceFps = computed(() => {
	const videoStream = videoInputInfo.value?.streams.find(isVideoStream) as StreamInfo | undefined;
	return Number.isFinite(videoStream?.fps) && videoStream!.fps! > 0 ? videoStream!.fps : undefined;
});
const getVideoPresetKey = (preset?: Partial<KomorebiVideoPreset>) => {
	if (!preset) {
		return '';
	}
	return [
		preset.scene,
		preset.codec,
		preset.quality,
		preset.container,
		preset.audioSource,
		preset.aspectRatio || 'source',
		preset.resolution || 'source',
		preset.frameRate || preset.gifFps || 'auto',
		preset.encodeSpeed || 'balanced',
	].join('|');
};
const currentVideoPresetKey = computed(() => getVideoPresetKey(currentVideoPreset.value));
const appliedVideoPresetKey = computed(() => {
	const preset = firstSelectedTask.value?.after?.extra?.komorebiPreset as Partial<KomorebiVideoPreset> | undefined;
	return firstSelectedTask.value?.after?.extra?.komorebiWorkflow === 'video-compress'
		? getVideoPresetKey(normalizeKomorebiVideoPreset(preset as any))
		: '';
});
const isResolutionAboveSource = (resolution: KomorebiVideoResolution, aspectRatio = 'source') => {
	if (resolution === 'source') {
		return false;
	}
	if (videoSourceResolutionPending.value) {
		return true;
	}
	if (!videoSourceResolutionKnown.value) {
		return false;
	}
	const source = videoSourceDimensions.value;
	const target = getKomorebiOutputDimensions(
		source.width,
		source.height,
		{ aspectRatio: aspectRatio as any, resolution, quality: 2 },
		'video',
	);
	return target.width > source.width + 1 || target.height > source.height + 1;
};
const buildResolutionOptions = (aspectRatio = 'source') => {
	const sourceLabel = videoSourceResolutionKnown.value
		? `${tr.value.options.resolutionSource} (${videoSourceResolutionText.value})`
		: tr.value.options.resolutionSource;
	return getKomorebiResolutionOptions(
		aspectRatio as any,
		videoSourceDimensions.value.width,
		videoSourceDimensions.value.height,
		sourceLabel,
	).map((item) => {
		const disabled = isResolutionAboveSource(item.value, aspectRatio);
		return {
			...item,
			label: disabled
				? `${item.label} (${videoSourceResolutionPending.value ? tr.value.options.resolutionReadingSource : tr.value.options.resolutionAboveSource(videoSourceResolutionText.value)})`
				: item.label,
			disabled,
		};
	});
};
const videoResolutionOptions = computed(() => buildResolutionOptions(currentVideoPreset.value.aspectRatio || 'source'));
const remuxResolutionOptions = computed(() => buildResolutionOptions(currentRemuxPreset.value.aspectRatio || 'source'));
const encodeSpeedOptions = computed(() => komorebiEncodeSpeeds.map((item) => ({
	...item,
	label: item.value === 'fast'
		? tr.value.options.encodeSpeedFast
		: item.value === 'low'
			? tr.value.options.encodeSpeedLow
			: tr.value.options.encodeSpeedBalanced,
})));
const formatFpsValue = (fps?: number) => {
	if (!Number.isFinite(fps) || !fps) {
		return '';
	}
	const rounded = Math.round(fps * 1000) / 1000;
	return Number.isInteger(rounded) ? `${rounded}` : rounded.toFixed(3).replace(/0+$/, '').replace(/\.$/, '');
};
const sourceFpsLimit = (fps?: number) => Number.isFinite(fps) && fps! > 0 ? fps! : undefined;
const isFrameRateAboveSource = (fps: unknown, sourceFps?: number) => (
	typeof fps === 'number' &&
	sourceFpsLimit(sourceFps) !== undefined &&
	fps > sourceFpsLimit(sourceFps)! + 0.0001
);
const buildFrameRateOptions = (mode: 'video' | 'remux') => {
	const sourceFps = videoSourceFps.value;
	const sourceFpsText = formatFpsValue(sourceFps);
	const isAboveSource = (fps: unknown) => isFrameRateAboveSource(fps, sourceFps);
	if (mode === 'video' && isGifVideoContainer.value) {
		const autoFps = getKomorebiRecommendedFrameRate(currentVideoPreset.value, videoSourceFps.value, 'video');
		return komorebiFrameRateOptions.map((item) => ({
			...item,
			label: item.value === 'auto'
				? autoFps ? `${tr.value.options.frameRateAuto} (${formatFpsValue(autoFps)} FPS)` : tr.value.options.frameRateAuto
				: typeof item.value === 'number' && item.value > komorebiGifMaxFps
					? `${item.label} (${tr.value.options.frameRateLimited(komorebiGifMaxFps)})`
				: isAboveSource(item.value)
					? `${item.label} (${tr.value.options.frameRateAboveSource(sourceFpsText)})`
				: getKomorebiEffectiveGifFps(currentVideoPreset.value.quality, item.value, videoSourceFps.value) + 0.001 < Number(item.value)
					? `${item.label} (${tr.value.options.frameRateLimited(getKomorebiEffectiveGifFps(currentVideoPreset.value.quality, item.value, videoSourceFps.value))})`
					: item.label,
			disabled: typeof item.value === 'number' && (item.value > komorebiGifMaxFps || isAboveSource(item.value)),
		}));
	}
	const sourceFpsLabel = sourceFps ? ` (${sourceFpsText} FPS)` : '';
	const autoFps = getKomorebiRecommendedFrameRate(
		mode === 'video' ? currentVideoPreset.value : currentRemuxPreset.value,
		videoSourceFps.value,
		mode,
	);
	return komorebiFrameRateOptions.map((item) => {
		const effectiveFps = getKomorebiEffectiveFrameRate(item.value, videoSourceFps.value);
		return {
			...item,
			label: item.value === 'auto'
				? mode === 'remux'
					? `${tr.value.options.frameRateSource}${sourceFpsLabel}`
					: autoFps ? `${tr.value.options.frameRateAuto} (${formatFpsValue(autoFps)} FPS)` : tr.value.options.frameRateAuto
				: isAboveSource(item.value)
					? `${item.label} (${tr.value.options.frameRateAboveSource(sourceFpsText)})`
				: effectiveFps && effectiveFps + 0.001 < Number(item.value)
					? `${item.label} (${tr.value.options.frameRateLimited(effectiveFps)})`
					: item.label,
			disabled: isAboveSource(item.value),
		};
	});
};
const videoFrameRateOptions = computed(() => buildFrameRateOptions('video'));
const remuxFrameRateOptions = computed(() => buildFrameRateOptions('remux'));
const audioFormatOptions = computed(() => komorebiAudioFormats.map((item) => ({
	...item,
	disabled: !isKomorebiAudioFormatAvailable(item.value, hasKnownInput.value ? mediaHints.value : undefined),
})));
const remuxContainerOptions = computed(() => komorebiRemuxContainers.map((item) => ({
	...item,
	disabled: !isKomorebiRemuxContainerAvailable(item.value, hasKnownInput.value ? mediaHints.value : undefined),
})));
const ncmFormatOptions = computed(() => komorebiNcmFormats.map((item) => ({
	...item,
	label: item.value === 'auto' ? tr.value.options.ncmAuto : item.label,
	disabled: false,
})));
const isLocalPath = (path?: string) => !!path && (
	/^[A-Za-z]:[\\/]/.test(path) ||
	path.startsWith('\\\\') ||
	path.startsWith('/')
);
const getLocalFileSize = async (path?: string) => {
	if (!isLocalPath(path)) {
		return undefined;
	}
	const stats = await nodeBridge.getLocalFileStats(path).catch(() => undefined);
	const size = stats?.size;
	return Number.isFinite(size) && size > 0 ? size : undefined;
};
const estimateSourceBytes = (input: InputInfo) => {
	const videoStream = input.streams.find(isVideoStream) as StreamInfo | undefined;
	const { width, height } = parseKomorebiResolution(videoStream?.resolution);
	const pixels = Math.max(1, width * height);
	const baseKbps = pixels >= 3840 * 2160 ? 8000 : pixels >= 1920 * 1080 ? 4000 : pixels >= 1280 * 720 ? 2000 : 1000;
	const sourceBitrate = input.bitrate || videoStream?.bitrate || baseKbps * 1.5;
	if (!Number.isFinite(input.duration) || input.duration <= 0 || !Number.isFinite(sourceBitrate) || sourceBitrate <= 0) {
		return undefined;
	}
	return sourceBitrate * input.duration * 1000 / 8;
};
const formatPercent = (value: number) => {
	if (!Number.isFinite(value)) {
		return '0';
	}
	const rounded = Math.round(value * 10) / 10;
	return Number.isInteger(rounded) ? `${rounded}` : rounded.toFixed(1);
};
const getRatioText = (sourceSize: number, outputSize: number, actual = false) => {
	if (!Number.isFinite(sourceSize) || sourceSize <= 0 || !Number.isFinite(outputSize) || outputSize < 0) {
		return tr.value.estimate.unknown;
	}
	const deltaRate = (1 - outputSize / sourceSize) * 100;
	if (deltaRate > 0.5) {
		return actual
			? tr.value.estimate.actualShrink(formatPercent(deltaRate))
			: tr.value.estimate.shrink(formatPercent(deltaRate));
	}
	if (deltaRate < -0.5) {
		return actual
			? tr.value.estimate.actualGrow(formatPercent(Math.abs(deltaRate)))
			: tr.value.estimate.grow(formatPercent(Math.abs(deltaRate)));
	}
	return actual ? tr.value.estimate.actualFlat : tr.value.estimate.flat;
};
const clampNumber = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const codecEfficiency = (codec: string) => {
	const normalized = codec.toLowerCase();
	if (/av1/.test(normalized)) return 1.85;
	if (/hevc|h265|x265/.test(normalized)) return 1.55;
	if (/vp9/.test(normalized)) return 1.35;
	if (/h264|avc|x264/.test(normalized)) return 1;
	if (/mpeg4|mp4v/.test(normalized)) return 0.62;
	if (/mpeg|h263|wmv|vc1|flv/.test(normalized)) return 0.5;
	return 0.86;
};
const targetReferenceKbps = (codec: string, quality: number) => {
	const q = clampNumber(quality, 1, 4);
	const table: Record<string, Record<number, number>> = {
		av1: { 1: 2800, 2: 1750, 3: 1100, 4: 680 },
		hevc: { 1: 3400, 2: 2200, 3: 1400, 4: 860 },
		vp9: { 1: 3800, 2: 2400, 3: 1550, 4: 950 },
		h264: { 1: 5200, 2: 3400, 3: 2150, 4: 1320 },
		mpeg4: { 1: 6800, 2: 4500, 3: 2850, 4: 1750 },
	};
	const key = codec === 'av1' || codec === 'hevc' || codec === 'vp9' || codec === 'h264' || codec === 'mpeg4'
		? codec
		: 'h264';
	return table[key][q] || table.h264[2];
};
const qualitySourceFactor = (quality: number) => ({ 1: 0.92, 2: 0.62, 3: 0.42, 4: 0.28 } as Record<number, number>)[quality] || 0.62;
const sceneBitrateFactor = (scene: string) => {
	if (scene === 'anime') return 0.86;
	if (scene === 'screen') return 0.78;
	return 1;
};
const estimateGifBytes = (
	duration: number,
	sourceBytes: number,
	sourceKbps: number,
	targetPixels: number,
	quality: number,
	scene: string,
	fps: number,
) => {
	const frames = Math.max(1, duration * fps);
	const bytesPerPixelFrame: Record<number, number> = { 1: 0.019, 2: 0.012, 3: 0.008, 4: 0.0052 };
	const sceneFactor = scene === 'screen' ? 0.72 : scene === 'anime' ? 0.82 : 1;
	const sourceComplexity = clampNumber(sourceKbps / 3500, 0.55, 1.25);
	const estimatedByFrames = frames * targetPixels * (bytesPerPixelFrame[quality] || 0.012) * sceneFactor * sourceComplexity;
	const sourceCap: Record<number, number> = { 1: 0.16, 2: 0.095, 3: 0.062, 4: 0.038 };
	const cap = sourceBytes * (sourceCap[quality] || 0.095);
	return clampNumber(estimatedByFrames, 128 * 1024, Math.max(512 * 1024, cap));
};
const estimateVideoBytes = (
	duration: number,
	sourceBytes: number,
	sourceKbps: number,
	sourceCodec: string,
	targetCodec: string,
	sourcePixels: number,
	targetPixels: number,
	sourceFps: number,
	targetFps: number,
	quality: number,
	scene: string,
	audioKbps: number,
) => {
	const pixelRatio = clampNumber(targetPixels / sourcePixels, 0.05, 3);
	const fpsRatio = clampNumber(targetFps / sourceFps, 0.05, 1.5);
	const sourceGuidedKbps = sourceKbps
		* (codecEfficiency(sourceCodec) / codecEfficiency(targetCodec))
		* Math.pow(pixelRatio, 0.74)
		* Math.pow(fpsRatio, 0.58)
		* qualitySourceFactor(quality)
		* sceneBitrateFactor(scene);
	const referenceKbps = targetReferenceKbps(targetCodec, quality)
		* Math.pow(targetPixels / (1920 * 1080), 0.82)
		* Math.pow(targetFps / 30, 0.55)
		* sceneBitrateFactor(scene);
	const sourceDensity = sourceKbps / Math.max(250, referenceKbps * (codecEfficiency(targetCodec) / Math.max(0.5, codecEfficiency(sourceCodec))));
	const sourceWeight = sourceDensity < 0.65 ? 0.78 : sourceDensity > 1.55 ? 0.45 : 0.62;
	const rawTargetKbps = sourceGuidedKbps * sourceWeight + referenceKbps * (1 - sourceWeight);
	const lowerBound = Math.max(120, referenceKbps * 0.22);
	const upperBound = sourceKbps * (pixelRatio > 1.05 ? 1.7 : quality <= 2 ? 1.18 : 1.02);
	const targetVideoKbps = clampNumber(rawTargetKbps, Math.min(lowerBound, upperBound), Math.max(lowerBound, upperBound));
	return Math.max(64 * 1024, (targetVideoKbps + audioKbps) * duration * 1000 / 8);
};

const estimateVideoSize = computed(() => {
	const input = videoInputInfo.value;
	const videoPreset = currentVideoPreset.value;
	currentVideoPresetKey.value;
	const sourceBytes = input ? input.size || actualSourceBytes.value || estimateSourceBytes(input) : undefined;
	const canUseActualResult = firstSelectedTask.value?.status === TaskStatus.finished
		&& appliedVideoPresetKey.value
		&& appliedVideoPresetKey.value === currentVideoPresetKey.value
		&& actualOutputBytes.value
		&& sourceBytes;
	if (canUseActualResult) {
		return tr.value.estimate.actualSummary(
			formatSize(actualOutputBytes.value, appStore.frontendSettings.useIEC),
			formatSize(sourceBytes, appStore.frontendSettings.useIEC),
			getRatioText(sourceBytes, actualOutputBytes.value, true),
		);
	}
	if (!input?.duration) {
		return tr.value.estimate.waiting;
	}
	const videoStream = input.streams.find(isVideoStream) as StreamInfo | undefined;
	const { width, height } = parseKomorebiResolution(videoStream?.resolution);
	const pixels = Math.max(1, width * height);
	const sourceKbps = sourceBytes * 8 / 1000 / input.duration;
	if (!Number.isFinite(input.duration) || input.duration <= 0 || !Number.isFinite(sourceKbps) || sourceKbps <= 0) {
		return tr.value.estimate.unknown;
	}
	const sourceCodec = (videoStream?.codec || '').toLowerCase();
	const targetCodec = videoPreset.container === 'gif' ? 'gif'
		: videoPreset.codec;
	const outputDimensions = getKomorebiOutputDimensions(width, height, videoPreset, targetCodec === 'gif' ? 'gif' : 'video');
	const targetPixels = Math.max(1, outputDimensions.width * outputDimensions.height);
	if (!Number.isFinite(sourceBytes) || sourceBytes <= 0) {
		return tr.value.estimate.unknown;
	}
	if (targetCodec === 'gif') {
		const profile = getKomorebiGifEncodeProfile(videoPreset.quality, videoPreset.frameRate || videoPreset.gifFps, videoStream?.fps);
		const estimatedBytes = estimateGifBytes(input.duration, sourceBytes, sourceKbps, targetPixels, videoPreset.quality, videoPreset.scene, profile.fps);
		return tr.value.estimate.summary(
			formatSize(estimatedBytes, appStore.frontendSettings.useIEC),
			formatSize(sourceBytes, appStore.frontendSettings.useIEC),
			getRatioText(sourceBytes, estimatedBytes),
		);
	}
	const sourceFps = Number.isFinite(videoStream?.fps) && videoStream!.fps! > 0 ? videoStream!.fps! : undefined;
	const effectiveSourceFps = sourceFps || 30;
	const targetFps = videoPreset.frameRate === 'auto'
		? getKomorebiRecommendedFrameRate(videoPreset, sourceFps, 'video') || effectiveSourceFps
		: getKomorebiEffectiveFrameRate(videoPreset.frameRate, sourceFps) || effectiveSourceFps;
	const audioKbps = videoPreset.audioSource === 'none' || videoPreset.container === 'gif' ? 0 : 192;
	const estimatedBytes = estimateVideoBytes(
		input.duration,
		sourceBytes,
		sourceKbps,
		sourceCodec,
		targetCodec,
		pixels,
		targetPixels,
		effectiveSourceFps,
		targetFps,
		videoPreset.quality,
		videoPreset.scene,
		audioKbps,
	);
	if (!Number.isFinite(estimatedBytes) || estimatedBytes < 0) {
		return tr.value.estimate.unknown;
	}
	return tr.value.estimate.summary(
		formatSize(estimatedBytes, appStore.frontendSettings.useIEC),
		formatSize(sourceBytes, appStore.frontendSettings.useIEC),
		getRatioText(sourceBytes, estimatedBytes),
	);
});

const chooseExternalAudio = async (target: 'video' | 'remux') => {
	const [file] = await nodeBridge.showOpenDialog({
		properties: ['openFile'],
		filters: [{ name: 'Audio', extensions: ['mp3', 'flac', 'wav', 'aac', 'm4a', 'ogg', 'opus', 'wma', 'ac3', 'mp2'] }],
	});
	if (file) {
		if (target === 'video') appStore.komorebi.video.externalAudio = file;
		if (target === 'remux') appStore.komorebi.remux.externalAudio = file;
	}
};

const chooseOutputDir = async (target: 'video' | 'audio' | 'remux' | 'ncm') => {
	const [dir] = await nodeBridge.showOpenDialog({ properties: ['openDirectory', 'createDirectory'] });
	if (!dir) {
		return;
	}
	if (target === 'video') appStore.komorebi.video.outputDir = dir;
	if (target === 'audio') appStore.komorebi.audio.outputDir = dir;
	if (target === 'remux') appStore.komorebi.remux.outputDir = dir;
	if (target === 'ncm') appStore.komorebi.ncm.outputDir = dir;
};

const pickFirstEnabled = <T extends { value: string | number; disabled?: boolean }>(items: T[], current: string | number) => {
	if (items.some((item) => item.value === current && !item.disabled)) {
		return current;
	}
	return items.find((item) => !item.disabled)?.value || current;
};
const pickClosestFrameRate = (items: Array<{ value: KomorebiFrameRate; disabled?: boolean }>, current: KomorebiFrameRate | string | number | undefined) => {
	const normalizedCurrent = typeof current === 'string' && current !== 'auto' ? Number(current) as KomorebiFrameRate : current;
	if (items.some((item) => item.value === normalizedCurrent && !item.disabled)) {
		return normalizedCurrent || 'auto';
	}
	return 'auto';
};
const pulseInteraction = () => {
	interactionPulseKey.value++;
};
const replayInteractionPulse = async () => {
	pulseInteraction();
	await nextTick();
};
const chooseOutputDirWithPulse = async (target: 'video' | 'audio' | 'remux' | 'ncm') => {
	pulseInteraction();
	await chooseOutputDir(target);
};
const chooseExternalAudioWithPulse = async (target: 'video' | 'remux') => {
	pulseInteraction();
	await chooseExternalAudio(target);
};

const metadataRefreshKeys = new Set<string>();
let metadataRefreshSerial = 0;
watch(
	() => ({
		id: selectedTaskId.value,
		path: firstTaskInputPath.value,
		serverId: appStore.currentServer?.data.id,
	}),
	async ({ id, path, serverId }) => {
		if (id === undefined || !path || !serverId) {
			metadataRefreshPending.value = false;
			return;
		}
		const server = appStore.currentServer;
		if (!server?.entity?.refreshTaskMetadata) {
			metadataRefreshPending.value = false;
			return;
		}
		const key = `${serverId}:${id}:${path}`;
		if (metadataRefreshKeys.has(key)) {
			metadataRefreshPending.value = false;
			return;
		}
		metadataRefreshKeys.add(key);
		const serial = ++metadataRefreshSerial;
		metadataRefreshPending.value = true;
		const before = await server.entity.refreshTaskMetadata(id).catch(() => undefined);
		if (serial === metadataRefreshSerial && appStore.currentServer?.data.id === serverId && selectedTaskId.value === id) {
			metadataRefreshPending.value = false;
		}
		const hasMediaInfo = before?.some((input) => input.streams?.length);
		if (!hasMediaInfo) {
			metadataRefreshKeys.delete(key);
			return;
		}
		const task = appStore.currentServer?.data.tasks[id];
		if (serial === metadataRefreshSerial && appStore.currentServer?.data.id === serverId && task) {
			task.before = before;
		}
	},
	{ immediate: true },
);
watch(videoContainerOptions, (items) => {
	appStore.komorebi.video.container = pickFirstEnabled(items, appStore.komorebi.video.container) as any;
}, { immediate: true });
watch(() => appStore.komorebi.video.container, () => {
	const normalized = normalizeKomorebiVideoPreset(appStore.komorebi.video);
	appStore.komorebi.video.codec = normalized.codec;
	appStore.komorebi.video.audioSource = normalized.audioSource;
}, { immediate: true });
watch(videoCodecSelectOptions, (items) => {
	appStore.komorebi.video.codec = pickFirstEnabled(items, appStore.komorebi.video.codec) as any;
}, { immediate: true });
watch(videoFrameRateOptions, (items) => {
	const nextFrameRate = pickClosestFrameRate(items, appStore.komorebi.video.frameRate || appStore.komorebi.video.gifFps);
	appStore.komorebi.video.frameRate = nextFrameRate;
	appStore.komorebi.video.gifFps = nextFrameRate;
}, { immediate: true });
watch(remuxFrameRateOptions, (items) => {
	appStore.komorebi.remux.frameRate = pickClosestFrameRate(items, appStore.komorebi.remux.frameRate);
}, { immediate: true });
watch(videoResolutionOptions, (items) => {
	appStore.komorebi.video.resolution = pickFirstEnabled(items, appStore.komorebi.video.resolution || 'source') as KomorebiVideoResolution;
}, { immediate: true });
watch(remuxResolutionOptions, (items) => {
	appStore.komorebi.remux.resolution = pickFirstEnabled(items, appStore.komorebi.remux.resolution || 'source') as KomorebiVideoResolution;
}, { immediate: true });
watch(encodeSpeedOptions, (items) => {
	appStore.komorebi.video.encodeSpeed = pickFirstEnabled(items, appStore.komorebi.video.encodeSpeed || 'balanced') as any;
	appStore.komorebi.remux.encodeSpeed = pickFirstEnabled(items, appStore.komorebi.remux.encodeSpeed || 'balanced') as any;
}, { immediate: true });
watch(audioFormatOptions, (items) => {
	appStore.komorebi.audio.format = pickFirstEnabled(items, appStore.komorebi.audio.format) as any;
}, { immediate: true });
watch(remuxContainerOptions, (items) => {
	appStore.komorebi.remux.container = pickFirstEnabled(items, appStore.komorebi.remux.container) as any;
}, { immediate: true });
watch(ncmFormatOptions, (items) => {
	appStore.komorebi.ncm.targetFormat = pickFirstEnabled(items, appStore.komorebi.ncm.targetFormat) as any;
}, { immediate: true });
watch(() => [videoInputInfo.value?.path, videoInputInfo.value?.size, firstTaskInputPath.value] as const, async ([metadataPath, metadataSize, taskInputPath]) => {
	actualSourceBytes.value = undefined;
	if (Number.isFinite(metadataSize) && metadataSize > 0) {
		actualSourceBytes.value = metadataSize;
		return;
	}
	const path = metadataPath || taskInputPath;
	const size = await getLocalFileSize(path);
	if (videoInputInfo.value?.path === metadataPath && firstTaskInputPath.value === taskInputPath) {
		actualSourceBytes.value = size;
	}
}, { immediate: true });
watch(
	() => {
		const task = firstSelectedTask.value;
		return {
			status: task?.status,
			outputFiles: task?.outputFiles?.join('|') || '',
			serverIp: appStore.currentServer?.entity.ip,
		};
	},
	async ({ status, outputFiles, serverIp }) => {
		actualOutputBytes.value = undefined;
		if (status !== TaskStatus.finished || serverIp !== 'localhost' || !outputFiles) {
			return;
		}
		const files = outputFiles.split('|').filter(Boolean);
		const sizes = await Promise.all(files.map((file) => getLocalFileSize(file)));
		const total = sizes.reduce((sum, size) => sum + (size || 0), 0);
		const task = firstSelectedTask.value;
		if (
			task?.status === TaskStatus.finished &&
			task.outputFiles?.join('|') === outputFiles &&
			appStore.currentServer?.entity.ip === serverIp
		) {
			actualOutputBytes.value = total > 0 ? total : undefined;
		}
	},
	{ immediate: true },
);
</script>

<template>
	<div class="komorebi-normal">
		<Transition name="hintPulse" mode="out-in">
			<div class="compat-hint" :key="`${appStore.frontendSettings.language}-${selectionHint}`">{{ selectionHint }}</div>
		</Transition>
		<section v-if="appStore.komorebi.workflow === 'video-compress'" class="panel">
			<Transition name="estimatePulse" mode="out-in">
				<div class="estimate summary" :key="`${estimateVideoSize}-${interactionPulseKey}`">{{ estimateVideoSize }}</div>
			</Transition>
			<div class="grid">
				<label>
					<span>{{ tr.fields.scene }}</span>
					<select v-model="appStore.komorebi.video.scene" @change="replayInteractionPulse">
						<option value="anime">{{ tr.options.sceneAnime }}</option>
						<option value="screen">{{ tr.options.sceneScreen }}</option>
						<option value="live">{{ tr.options.sceneLive }}</option>
					</select>
				</label>
				<label>
					<span>{{ tr.fields.encoder }}</span>
					<select v-model="appStore.komorebi.video.codec" :disabled="isGifVideoContainer" @change="replayInteractionPulse">
						<option v-for="item in videoCodecSelectOptions" :key="item.value" :value="item.value" :disabled="item.disabled">{{ item.label }}</option>
					</select>
				</label>
				<label>
					<span>{{ tr.fields.quality }}</span>
					<select v-model.number="appStore.komorebi.video.quality" @change="replayInteractionPulse">
						<option :value="1">{{ tr.options.qualityHigh }}</option>
						<option :value="2">{{ tr.options.qualityBalanced }}</option>
						<option :value="3">{{ tr.options.qualitySmall }}</option>
						<option :value="4">{{ tr.options.qualityTiny }}</option>
					</select>
				</label>
				<label>
					<span>{{ tr.fields.container }}</span>
					<select v-model="appStore.komorebi.video.container" @change="replayInteractionPulse">
						<option v-for="item in videoContainerOptions" :key="item.value" :value="item.value" :disabled="item.disabled">{{ item.label }}</option>
					</select>
				</label>
				<label>
					<span>{{ tr.fields.encodeSpeed }}</span>
					<select v-model="appStore.komorebi.video.encodeSpeed" @change="replayInteractionPulse">
						<option v-for="item in encodeSpeedOptions" :key="item.value" :value="item.value">{{ item.label }}</option>
					</select>
				</label>
				<label>
					<span>{{ tr.fields.frameRate }}</span>
					<select v-model="appStore.komorebi.video.frameRate" @change="() => { appStore.komorebi.video.gifFps = appStore.komorebi.video.frameRate; replayInteractionPulse(); }">
						<option v-for="item in videoFrameRateOptions" :key="item.value" :value="item.value" :disabled="item.disabled">{{ item.label }}</option>
					</select>
				</label>
				<label>
					<span>{{ tr.fields.aspectRatio }}</span>
					<select v-model="appStore.komorebi.video.aspectRatio" @change="replayInteractionPulse">
						<option v-for="item in videoAspectRatioOptions" :key="item.value" :value="item.value">{{ item.label }}</option>
					</select>
				</label>
				<label>
					<span>{{ tr.fields.resolution }}</span>
					<select v-model="appStore.komorebi.video.resolution" @change="replayInteractionPulse">
						<option v-for="item in videoResolutionOptions" :key="`${item.value}-${item.label}`" :value="item.value" :disabled="item.disabled">{{ item.label }}</option>
					</select>
				</label>
				<label :class="{ disabled: isGifVideoContainer }">
					<span>{{ tr.fields.audioTrack }}</span>
					<select v-model="appStore.komorebi.video.audioSource" :disabled="isGifVideoContainer" @change="replayInteractionPulse">
						<option value="source">{{ tr.options.keepSourceAudio }}</option>
						<option value="none">{{ tr.options.muteVideo }}</option>
						<option value="external">{{ tr.options.useExternalAudio }}</option>
					</select>
				</label>
				<label :class="{ disabled: !hasVideoExternalAudio }">
					<span>{{ tr.fields.externalAudio }}</span>
					<div class="path-row">
						<input v-model="appStore.komorebi.video.externalAudio" :disabled="!hasVideoExternalAudio" :placeholder="tr.placeholders.externalAudio" @input="pulseInteraction" />
						<button :disabled="!hasVideoExternalAudio" @click="chooseExternalAudioWithPulse('video')">{{ tr.actions.choose }}</button>
					</div>
				</label>
				<label>
					<span>{{ tr.fields.outputDir }}</span>
					<div class="path-row">
						<input v-model="appStore.komorebi.video.outputDir" :placeholder="tr.placeholders.outputToSourceDir" @input="pulseInteraction" />
						<button @click="chooseOutputDirWithPulse('video')">{{ tr.actions.choose }}</button>
					</div>
				</label>
				<label>
					<span>{{ tr.fields.outputName }}</span>
					<input v-model="appStore.komorebi.video.outputNameTemplate" :placeholder="tr.placeholders.videoOutputName" @input="pulseInteraction" />
				</label>
			</div>
		</section>

		<section v-else-if="appStore.komorebi.workflow === 'audio-convert'" class="panel">
			<div class="grid">
				<label>
					<span>{{ tr.fields.targetFormat }}</span>
					<select v-model="appStore.komorebi.audio.format" @change="replayInteractionPulse">
						<option v-for="item in audioFormatOptions" :key="item.value" :value="item.value" :disabled="item.disabled">{{ item.label }}</option>
					</select>
				</label>
				<label>
					<span>{{ tr.fields.qualityPreset }}</span>
					<select v-model.number="appStore.komorebi.audio.quality" @change="replayInteractionPulse">
						<option :value="1">{{ tr.options.audioLossless320 }}</option>
						<option :value="2">{{ tr.options.audio192 }}</option>
						<option :value="3">{{ tr.options.audio128 }}</option>
						<option :value="4">{{ tr.options.audio64 }}</option>
					</select>
				</label>
				<label>
					<span>{{ tr.fields.outputDir }}</span>
					<div class="path-row">
						<input v-model="appStore.komorebi.audio.outputDir" :placeholder="tr.placeholders.outputToSourceDir" @input="pulseInteraction" />
						<button @click="chooseOutputDirWithPulse('audio')">{{ tr.actions.choose }}</button>
					</div>
				</label>
				<label>
					<span>{{ tr.fields.outputName }}</span>
					<input v-model="appStore.komorebi.audio.outputNameTemplate" :placeholder="tr.placeholders.audioOutputName" @input="pulseInteraction" />
				</label>
			</div>
		</section>

		<section v-else-if="appStore.komorebi.workflow === 'remux'" class="panel">
			<div class="grid">
				<label>
					<span>{{ tr.fields.targetContainer }}</span>
					<select v-model="appStore.komorebi.remux.container" @change="replayInteractionPulse">
						<option v-for="item in remuxContainerOptions" :key="item.value" :value="item.value" :disabled="item.disabled">{{ item.label }}</option>
					</select>
				</label>
				<label>
					<span>{{ tr.fields.aspectRatio }}</span>
					<select v-model="appStore.komorebi.remux.aspectRatio" @change="replayInteractionPulse">
						<option v-for="item in videoAspectRatioOptions" :key="item.value" :value="item.value">{{ item.label }}</option>
					</select>
				</label>
				<label>
					<span>{{ tr.fields.resolution }}</span>
					<select v-model="appStore.komorebi.remux.resolution" @change="replayInteractionPulse">
						<option v-for="item in remuxResolutionOptions" :key="`${item.value}-${item.label}`" :value="item.value" :disabled="item.disabled">{{ item.label }}</option>
					</select>
				</label>
				<label>
					<span>{{ tr.fields.frameRate }}</span>
					<select v-model="appStore.komorebi.remux.frameRate" @change="replayInteractionPulse">
						<option v-for="item in remuxFrameRateOptions" :key="item.value" :value="item.value" :disabled="item.disabled">{{ item.label }}</option>
					</select>
				</label>
				<label>
					<span>{{ tr.fields.encodeSpeed }}</span>
					<select v-model="appStore.komorebi.remux.encodeSpeed" @change="replayInteractionPulse">
						<option v-for="item in encodeSpeedOptions" :key="item.value" :value="item.value">{{ item.label }}</option>
					</select>
				</label>
				<label>
					<span>{{ tr.fields.externalAudio }}</span>
					<select v-model="appStore.komorebi.remux.audioSource" @change="replayInteractionPulse">
						<option value="source">{{ tr.options.noExternalAudio }}</option>
						<option value="external">{{ tr.options.addExternalAudio }}</option>
					</select>
				</label>
				<label :class="{ disabled: !hasRemuxExternalAudio }">
					<span>{{ tr.fields.externalAudioFile }}</span>
					<div class="path-row">
						<input v-model="appStore.komorebi.remux.externalAudio" :disabled="!hasRemuxExternalAudio" :placeholder="tr.placeholders.externalAudio" @input="pulseInteraction" />
						<button :disabled="!hasRemuxExternalAudio" @click="chooseExternalAudioWithPulse('remux')">{{ tr.actions.choose }}</button>
					</div>
				</label>
				<label>
					<span>{{ tr.fields.outputDir }}</span>
					<div class="path-row">
						<input v-model="appStore.komorebi.remux.outputDir" :placeholder="tr.placeholders.outputToSourceDir" @input="pulseInteraction" />
						<button @click="chooseOutputDirWithPulse('remux')">{{ tr.actions.choose }}</button>
					</div>
				</label>
				<label>
					<span>{{ tr.fields.outputName }}</span>
					<input v-model="appStore.komorebi.remux.outputNameTemplate" :placeholder="tr.placeholders.remuxOutputName" @input="pulseInteraction" />
				</label>
			</div>
			<Transition name="hintPulse" mode="out-in">
				<div class="note" :key="`${appStore.frontendSettings.language}-remux`">{{ tr.notes.remux }}</div>
			</Transition>
		</section>

		<section v-else class="panel ncm-panel">
			<Transition name="hintPulse" mode="out-in">
				<div class="ncm-hint" :key="`${appStore.frontendSettings.language}-ncm`">{{ tr.notes.ncm }}</div>
			</Transition>
			<div class="grid">
				<label>
					<span>{{ tr.fields.convertFormat }}</span>
					<select v-model="appStore.komorebi.ncm.targetFormat" @change="replayInteractionPulse">
						<option v-for="item in ncmFormatOptions" :key="item.value" :value="item.value" :disabled="item.disabled">{{ item.label }}</option>
					</select>
				</label>
				<label>
					<span>{{ tr.fields.qualityPreset }}</span>
					<select v-model="appStore.komorebi.ncm.qualityMode" @change="replayInteractionPulse">
						<option value="copy">{{ tr.options.ncmCopy }}</option>
						<option value="standard">{{ tr.options.ncmStandard }}</option>
						<option value="small">{{ tr.options.ncmSmall }}</option>
					</select>
				</label>
				<label>
					<span>{{ tr.fields.outputDir }}</span>
					<div class="path-row">
						<input v-model="appStore.komorebi.ncm.outputDir" :placeholder="tr.placeholders.outputToSourceRoot" @input="pulseInteraction" />
						<button @click="chooseOutputDirWithPulse('ncm')">{{ tr.actions.choose }}</button>
					</div>
				</label>
				<label>
					<span>{{ tr.fields.outputName }}</span>
					<input v-model="appStore.komorebi.ncm.outputNameTemplate" :placeholder="tr.placeholders.ncmOutputName" @input="pulseInteraction" />
				</label>
				<label class="check">
					<input type="checkbox" v-model="appStore.komorebi.ncm.recursive" @change="pulseInteraction" />
					<span>{{ tr.options.recursive }}</span>
				</label>
				<label class="check danger">
					<input type="checkbox" v-model="appStore.komorebi.ncm.deleteSource" @change="pulseInteraction" />
					<span>{{ tr.options.deleteSource }}</span>
				</label>
			</div>
		</section>

		<div class="actions" v-if="appStore.komorebi.workflow !== 'ncm'">
			<button class="secondary" @click="() => { pulseInteraction(); appStore.applyKomorebiNormalPreset('global'); }">{{ tr.actions.setGlobal }}</button>
			<button class="primary" :disabled="!selectedTaskCount" @click="() => { pulseInteraction(); appStore.applyKomorebiNormalPreset('selected'); }">{{ tr.actions.applySelected }}</button>
		</div>
		<div class="actions" v-else>
			<button class="secondary" @click="() => { pulseInteraction(); appStore.applyKomorebiNcmPreset('global'); }">{{ tr.actions.setGlobal }}</button>
			<button class="primary" :disabled="!selectedNcmTaskCount" @click="() => { pulseInteraction(); appStore.applyKomorebiNcmPreset('selected'); }">{{ tr.actions.applySelected }}</button>
		</div>
	</div>
</template>

<style scoped lang="less">
.komorebi-normal {
	height: 100%;
	box-sizing: border-box;
	padding: 12px 18px 14px;
	overflow: auto;
	color: var(--33);
	scrollbar-gutter: stable;
	.compat-hint {
		max-width: 1120px;
		margin: 0 auto 8px;
		text-align: left;
		font-size: 12px;
		line-height: 20px;
		color: var(--66);
		transition: color var(--motion-standard) ease, transform var(--motion-standard) var(--ease-elegant), opacity var(--motion-standard) ease;
	}
	.panel {
		max-width: 1120px;
		margin: 0 auto;
		padding: 16px;
		border-radius: 8px;
		background: hwb(var(--bg99) / 0.78);
		border: 1px solid hwb(var(--bg90) / 0.46);
		box-shadow: 0 1px 4px hwb(var(--hoverShadow) / 0.08);
		animation: panelSettle var(--motion-panel) var(--ease-elegant);
		transform-origin: top center;
		will-change: transform, opacity;
	}
	.grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
		gap: 12px 16px;
	}
	label {
		display: flex;
		flex-direction: column;
		gap: 6px;
		font-size: 13px;
		animation: fieldSettle var(--motion-soft) var(--ease-elegant) both;
		transition: opacity var(--motion-panel) ease, transform var(--motion-panel) var(--ease-elegant);
		will-change: transform, opacity;
		&:nth-child(2) { animation-delay: 0.05s; }
		&:nth-child(3) { animation-delay: 0.1s; }
		&:nth-child(4) { animation-delay: 0.15s; }
		&:nth-child(5) { animation-delay: 0.2s; }
		&:nth-child(6) { animation-delay: 0.25s; }
		&:nth-child(7) { animation-delay: 0.3s; }
		&:nth-child(8) { animation-delay: 0.35s; }
		&:nth-child(9) { animation-delay: 0.4s; }
		&:nth-child(10) { animation-delay: 0.45s; }
		span {
			color: var(--66);
			transition: color var(--motion-standard) ease, opacity var(--motion-standard) ease;
		}
		&.disabled {
			opacity: 0.55;
			transform: translateY(1px);
		}
	}
	input, select {
		height: 30px;
		min-width: 0;
		box-sizing: border-box;
		border: 1px solid hwb(var(--bg90) / 0.55);
		border-radius: 6px;
		padding: 0 9px;
		background: hwb(var(--bg100) / 0.86);
		color: var(--33);
		outline: none;
		box-shadow: 0 1px 2px hwb(var(--hoverShadow) / 0.05);
		transition: border-color var(--motion-panel) ease, box-shadow var(--motion-panel) ease, background var(--motion-panel) ease, transform var(--motion-panel) var(--ease-elegant), opacity var(--motion-standard) ease;
		will-change: transform;
		&:hover {
			border-color: hwb(var(--primaryColor) / 0.28);
			transform: translateY(-1px);
		}
		&:focus {
			border-color: hwb(var(--primaryColor) / 0.48);
			box-shadow: 0 0 0 3px hwb(var(--primaryColor) / 0.10);
			transform: translateY(-1px);
		}
		&:active {
			transform: scale(0.995);
			transition-duration: var(--motion-press);
		}
		&:disabled {
			opacity: 0.62;
			transform: none;
		}
		option:disabled {
			color: #888;
		}
	}
	.path-row {
		display: grid;
		grid-template-columns: minmax(0, 1fr) 56px;
		gap: 8px;
		button {
			height: 30px;
			border: 1px solid hwb(var(--primaryColor) / 0.26);
			border-radius: 6px;
			background: hwb(var(--primaryColor) / 0.08);
			color: hwb(var(--primaryColor));
			transition: background var(--motion-standard) ease, transform var(--motion-standard) var(--ease-elegant), box-shadow var(--motion-standard) ease, opacity var(--motion-standard) ease;
			will-change: transform;
			&:hover:not(:disabled) {
				background: hwb(var(--primaryColor) / 0.13);
				box-shadow: 0 5px 12px hwb(var(--primaryColor) / 0.12);
				transform: translateY(-1px);
			}
			&:active:not(:disabled) {
				transform: scale(0.98);
				transition-duration: var(--motion-press);
			}
			&:disabled {
				opacity: 0.55;
			}
		}
	}
	.check {
		height: 30px;
		flex-direction: row;
		align-items: center;
		margin-top: 21px;
		input {
			width: 16px;
			height: 16px;
			accent-color: hwb(var(--primaryColor));
			transition: transform var(--motion-standard) var(--ease-elegant), filter var(--motion-standard) ease;
			&:checked {
				transform: scale(1.05);
				filter: drop-shadow(0 2px 4px hwb(var(--primaryColor) / 0.18));
			}
		}
	}
	.danger span {
		color: hwb(0 10% 10%);
	}
	.note, .ncm-hint, .estimate {
		font-size: 13px;
		color: var(--66);
	}
	.note, .ncm-hint {
		margin-top: 12px;
	}
	.estimate {
		align-self: end;
		min-height: 30px;
		line-height: 20px;
		padding: 0 10px;
		border-radius: 6px;
		background: hwb(var(--bg97) / 0.6);
		display: flex;
		align-items: center;
		box-sizing: border-box;
		transition: background var(--motion-standard) ease, color var(--motion-standard) ease, transform var(--motion-standard) var(--ease-elegant), box-shadow var(--motion-standard) ease;
		&.summary {
			margin: 0 0 14px;
			min-height: 34px;
			background: hwb(var(--primaryColor) / 0.08);
			border: 1px solid hwb(var(--primaryColor) / 0.16);
			color: var(--44);
			box-shadow: 0 6px 16px hwb(var(--primaryColor) / 0.06);
		}
	}
	.actions {
		max-width: 1120px;
		margin: 16px auto 0;
		display: flex;
		gap: 10px;
		justify-content: flex-end;
	}
	.primary, .secondary {
		height: 34px;
		min-width: 148px;
		padding: 0 18px;
		border-radius: 8px;
		font-size: 14px;
		transition: background var(--motion-standard) ease, transform var(--motion-standard) var(--ease-elegant), box-shadow var(--motion-standard) ease, opacity var(--motion-standard) ease;
		will-change: transform;
		&:hover:not(:disabled) {
			transform: translateY(-1px);
		}
		&:active:not(:disabled) {
			transform: scale(0.98);
			transition-duration: var(--motion-press);
		}
	}
	.primary {
		border: none;
		background: hwb(var(--primaryColor));
		color: #fff;
		box-shadow: 0 8px 18px hwb(var(--primaryColor) / 0.22);
		&:disabled {
			opacity: 0.45;
			box-shadow: none;
		}
	}
	.secondary {
		border: 1px solid hwb(var(--primaryColor) / 0.25);
		background: hwb(var(--primaryColor) / 0.08);
		color: hwb(var(--primaryColor));
	}
	.hintPulse-enter-active,
	.hintPulse-leave-active,
	.estimatePulse-enter-active,
	.estimatePulse-leave-active {
		transition: opacity var(--motion-panel) ease, transform var(--motion-soft) var(--ease-elegant);
	}
	.hintPulse-enter-from,
	.hintPulse-leave-to,
	.estimatePulse-enter-from,
	.estimatePulse-leave-to {
		opacity: 0;
		transform: translateY(3px);
	}
	@keyframes panelSettle {
		from {
			opacity: 0;
			transform: translateY(4px) scale(0.998);
		}
		to {
			opacity: 1;
			transform: translateY(0) scale(1);
		}
	}
	@keyframes fieldSettle {
		from {
			opacity: 0;
			transform: translateY(5px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}
}
</style>
