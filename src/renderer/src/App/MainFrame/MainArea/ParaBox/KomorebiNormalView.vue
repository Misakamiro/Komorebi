<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import { useAppStore } from '@renderer/stores/appStore';
import nodeBridge from '@renderer/bridges/nodeBridge';
import { formatSize } from '@common/utils';
import { TaskStatus, type InputInfo, type StreamInfo } from '@common/types';
import i11n from '@common/i11n/i11n';
import {
	getKomorebiMediaHints,
	isKomorebiAudioFormatAvailable,
	isKomorebiRemuxContainerAvailable,
	isKomorebiVideoCodecAvailable,
	isKomorebiVideoContainerAvailable,
	komorebiAudioFormats,
	komorebiNcmFormats,
	komorebiRemuxContainers,
	komorebiVideoContainers,
	normalizeKomorebiVideoPreset,
} from '@common/komorebiPresets';

const appStore = useAppStore();

const selectedTaskCount = computed(() => appStore.selectedTask.size);
const selectedNcmTaskCount = computed(() => [...appStore.selectedTask].filter((id) => appStore.currentServer?.data.tasks[id]?.kind === 'ncm').length);
const hasVideoExternalAudio = computed(() => appStore.komorebi.video.audioSource === 'external');
const hasRemuxExternalAudio = computed(() => appStore.komorebi.remux.audioSource === 'external');
const isVideoStream = (stream: StreamInfo) => `${stream.type || ''}`.toLowerCase() === 'video';
const isAudioStream = (stream: StreamInfo) => `${stream.type || ''}`.toLowerCase() === 'audio';
const tr = computed(() => {
	appStore.frontendSettings.language;
	return i11n.frontend.komorebi;
});
const interactionPulseKey = ref(0);
const actualSourceBytes = ref<number>();
const actualOutputBytes = ref<number>();

const firstSelectedTask = computed(() => {
	const id = [...appStore.selectedTask][0];
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
] as const;
const videoContainerOptions = computed(() => komorebiVideoContainers.map((item) => ({
	...item,
	disabled: !isKomorebiVideoContainerAvailable(item.value, appStore.komorebi.video.codec, hasKnownInput.value ? mediaHints.value : undefined),
})));
const videoCodecSelectOptions = computed(() => videoCodecOptions.map((item) => ({
	...item,
	disabled: !isKomorebiVideoCodecAvailable(item.value, appStore.komorebi.video.container, hasKnownInput.value ? mediaHints.value : undefined),
})));
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
	const [width = 1920, height = 1080] = (videoStream?.resolution || '1920x1080').split('x').map((value) => Number.parseInt(value, 10));
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

const estimateVideoSize = computed(() => {
	const input = videoInputInfo.value;
	const sourceBytes = input ? actualSourceBytes.value || estimateSourceBytes(input) : undefined;
	if (firstSelectedTask.value?.status === TaskStatus.finished && actualOutputBytes.value && sourceBytes) {
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
	const [width = 1920, height = 1080] = (videoStream?.resolution || '1920x1080').split('x').map((value) => Number.parseInt(value, 10));
	const pixels = Math.max(1, width * height);
	const baseKbps = pixels >= 3840 * 2160 ? 8000 : pixels >= 1920 * 1080 ? 4000 : pixels >= 1280 * 720 ? 2000 : 1000;
	const sourceBitrate = input.bitrate || videoStream?.bitrate || baseKbps * 1.5;
	if (!Number.isFinite(input.duration) || input.duration <= 0 || !Number.isFinite(sourceBitrate) || sourceBitrate <= 0) {
		return tr.value.estimate.unknown;
	}
	const sourceCodec = (videoStream?.codec || '').toLowerCase();
	const targetCodec = appStore.komorebi.video.container === 'webm' ? 'av1' : appStore.komorebi.video.codec;
	const sourceEfficiency = /mpeg|h263|wmv/.test(sourceCodec) ? 0.45
		: /h264|avc/.test(sourceCodec) ? 0.78
			: /hevc|h265/.test(sourceCodec) ? 1
				: /av1/.test(sourceCodec) ? 1.16
					: /vp9/.test(sourceCodec) ? 1.08
						: 0.9;
	const targetEfficiency = targetCodec === 'av1' ? 1.18
		: targetCodec === 'hevc' ? 1.05
			: targetCodec === 'vp9' ? 1.02
				: targetCodec === 'h264' ? 0.82
					: 0.68;
	const sceneFactor = appStore.komorebi.video.scene === 'anime' ? 0.88
		: appStore.komorebi.video.scene === 'screen' ? 0.94
			: 1;
	const qualityFactor: Record<number, number> = { 1: 1.08, 2: 0.78, 3: 0.55, 4: 0.38 };
	const quality = qualityFactor[appStore.komorebi.video.quality] ?? 0.8;
	const codecRatio = sourceEfficiency / targetEfficiency;
	if (!Number.isFinite(sourceBytes) || sourceBytes <= 0) {
		return tr.value.estimate.unknown;
	}
	const sourceActualMb = sourceBytes / 1024 / 1024;
	const sourceActualKbps = sourceBytes * 8 / 1000 / input.duration;
	const sourceAnchoredMb = sourceActualMb * codecRatio * quality * sceneFactor;
	const resolutionAnchoredMb = baseKbps * quality * sceneFactor * input.duration / 8192;
	const lowBitratePressure = Math.max(0, Math.min(1, (0.75 - sourceActualKbps / baseKbps) / 0.55));
	const highResolutionPressure = pixels >= 3840 * 2160 ? 0.15 : pixels >= 1920 * 1080 ? 0.08 : 0;
	const resolutionWeight = Math.min(0.78, 0.22 + lowBitratePressure * 0.45 + highResolutionPressure);
	const hardwareQualityReserve = pixels >= 3840 * 2160 && ['h264', 'hevc', 'av1'].includes(targetCodec) ? 1.08 : 1;
	const targetAudioMb = appStore.komorebi.video.audioSource === 'none' ? 0 : input.duration * 192 / 8192;
	const estimatedMb = Math.max(
		(sourceAnchoredMb * (1 - resolutionWeight) + resolutionAnchoredMb * resolutionWeight) * hardwareQualityReserve + targetAudioMb,
		sourceActualMb * 0.04,
	);
	if (!Number.isFinite(estimatedMb) || estimatedMb < 0) {
		return tr.value.estimate.unknown;
	}
	const estimatedBytes = estimatedMb * 1024 * 1024;
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

const pickFirstEnabled = <T extends { value: string; disabled?: boolean }>(items: T[], current: string) => {
	if (items.some((item) => item.value === current && !item.disabled)) {
		return current;
	}
	return items.find((item) => !item.disabled)?.value || current;
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

watch(videoContainerOptions, (items) => {
	appStore.komorebi.video.container = pickFirstEnabled(items, appStore.komorebi.video.container) as any;
}, { immediate: true });
watch(() => appStore.komorebi.video.container, () => {
	const normalized = normalizeKomorebiVideoPreset(appStore.komorebi.video);
	appStore.komorebi.video.codec = normalized.codec;
}, { immediate: true });
watch(videoCodecSelectOptions, (items) => {
	appStore.komorebi.video.codec = pickFirstEnabled(items, appStore.komorebi.video.codec) as any;
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
watch(() => videoInputInfo.value?.path, async (path) => {
	actualSourceBytes.value = undefined;
	const size = await getLocalFileSize(path);
	if (videoInputInfo.value?.path === path) {
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
					<select v-model="appStore.komorebi.video.codec" @change="replayInteractionPulse">
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
					<span>{{ tr.fields.audioTrack }}</span>
					<select v-model="appStore.komorebi.video.audioSource" @change="replayInteractionPulse">
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
		transition: color 0.16s ease, transform 0.16s ease, opacity 0.16s ease;
	}
	.panel {
		max-width: 1120px;
		margin: 0 auto;
		padding: 16px;
		border-radius: 8px;
		background: hwb(var(--bg99) / 0.78);
		border: 1px solid hwb(var(--bg90) / 0.46);
		box-shadow: 0 1px 4px hwb(var(--hoverShadow) / 0.08);
		animation: panelSettle 0.22s cubic-bezier(0.2, 0.9, 0.2, 1);
		transform-origin: top center;
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
		animation: fieldSettle 0.22s cubic-bezier(0.2, 0.9, 0.2, 1) both;
		transition: opacity 0.16s ease, transform 0.16s ease;
		&:nth-child(2) { animation-delay: 0.015s; }
		&:nth-child(3) { animation-delay: 0.03s; }
		&:nth-child(4) { animation-delay: 0.045s; }
		&:nth-child(5) { animation-delay: 0.06s; }
		&:nth-child(6) { animation-delay: 0.075s; }
		&:nth-child(7) { animation-delay: 0.09s; }
		&:nth-child(8) { animation-delay: 0.105s; }
		span {
			color: var(--66);
			transition: color 0.16s ease, opacity 0.16s ease;
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
		transition: border-color 0.16s ease, box-shadow 0.16s ease, background 0.16s ease, transform 0.16s cubic-bezier(0.2, 0.9, 0.2, 1), opacity 0.16s ease;
		will-change: transform, border-color, box-shadow;
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
			transition-duration: 0.06s;
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
			transition: background 0.16s ease, transform 0.16s cubic-bezier(0.2, 0.9, 0.2, 1), box-shadow 0.16s ease, opacity 0.16s ease;
			will-change: transform, background;
			&:hover:not(:disabled) {
				background: hwb(var(--primaryColor) / 0.13);
				box-shadow: 0 5px 12px hwb(var(--primaryColor) / 0.12);
				transform: translateY(-1px);
			}
			&:active:not(:disabled) {
				transform: scale(0.98);
				transition-duration: 0.06s;
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
			transition: transform 0.14s ease, filter 0.14s ease;
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
		transition: background 0.16s ease, color 0.16s ease, transform 0.16s ease, box-shadow 0.16s ease;
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
		transition: background 0.16s ease, transform 0.16s cubic-bezier(0.2, 0.9, 0.2, 1), box-shadow 0.16s ease, opacity 0.16s ease;
		will-change: transform, background;
		&:hover:not(:disabled) {
			transform: translateY(-1px);
		}
		&:active:not(:disabled) {
			transform: scale(0.98);
			transition-duration: 0.06s;
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
		transition: opacity 0.14s ease, transform 0.18s cubic-bezier(0.2, 0.9, 0.2, 1);
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
