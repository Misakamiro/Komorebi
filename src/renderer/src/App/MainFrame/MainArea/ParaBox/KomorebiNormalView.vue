<script setup lang="ts">
import { computed, watch } from 'vue';
import { useAppStore } from '@renderer/stores/appStore';
import nodeBridge from '@renderer/bridges/nodeBridge';
import { formatSize } from '@common/utils';
import type { InputInfo, StreamInfo } from '@common/types';
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
		return '选择或拖入文件后，Komorebi 会自动识别可用格式。';
	}
	if (mediaHints.value.hasVideo && mediaHints.value.hasAudio) {
		return '已识别到视频和音频流，不兼容的格式已置灰。';
	}
	if (mediaHints.value.hasVideo) {
		return '已识别到视频流，不适合音频转换的选项已置灰。';
	}
	if (mediaHints.value.hasAudio) {
		return '已识别到音频流，不适合视频封装的选项已置灰。';
	}
	return '暂未识别到可转换媒体流。';
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
	disabled: false,
})));

const estimateVideoSize = computed(() => {
	const input = videoInputInfo.value;
	if (!input?.duration) {
		return '选中视频任务后显示预计输出大小';
	}
	const videoStream = input.streams.find(isVideoStream) as StreamInfo | undefined;
	const [width = 1920, height = 1080] = (videoStream?.resolution || '1920x1080').split('x').map((value) => Number.parseInt(value, 10));
	const pixels = Math.max(1, width * height);
	const baseKbps = pixels >= 3840 * 2160 ? 8000 : pixels >= 1920 * 1080 ? 4000 : pixels >= 1280 * 720 ? 2000 : 1000;
	const sourceBitrate = input.bitrate || videoStream?.bitrate || baseKbps * 1.5;
	const sourceCodec = (videoStream?.codec || '').toLowerCase();
	const targetCodec = appStore.komorebi.video.container === 'webm' ? 'av1' : appStore.komorebi.video.codec;
	const sourceFactor = /mpeg|h263|wmv/.test(sourceCodec) ? 0.35 : /hevc|h265|av1|vp9/.test(sourceCodec) ? 1.2 : 0.8;
	const targetFactor = targetCodec === 'av1' ? 0.5 : targetCodec === 'hevc' ? 0.65 : 1;
	const qualityFactor: Record<number, number> = { 1: 1.5, 2: 0.8, 3: 0.5, 4: 0.3 };
	const quality = qualityFactor[appStore.komorebi.video.quality] ?? 0.8;
	const sourceMb = sourceBitrate * input.duration / 8192;
	const modelBySource = sourceMb * sourceFactor * targetFactor * 1.2 * quality;
	const modelByDuration = baseKbps * targetFactor * quality * input.duration / 8192;
	const estimatedMb = Math.max((modelBySource + modelByDuration) / 2, sourceMb * 0.05);
	const compressionRate = sourceMb > 0
		? Math.max(0, Math.min(95, Math.round((1 - estimatedMb / sourceMb) * 100)))
		: 0;
	return `预计输出 ${formatSize(estimatedMb * 1024 * 1024, true)}，源文件约 ${formatSize(sourceMb * 1024 * 1024, true)}，压缩率约 ${compressionRate}%`;
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
</script>

<template>
	<div class="komorebi-normal">
		<div class="compat-hint">{{ selectionHint }}</div>
		<section v-if="appStore.komorebi.workflow === 'video-compress'" class="panel">
			<div class="grid">
				<label>
					<span>场景</span>
					<select v-model="appStore.komorebi.video.scene">
						<option value="anime">动画/二次元</option>
						<option value="screen">录屏/游戏</option>
						<option value="live">真人/电影</option>
					</select>
				</label>
				<label>
					<span>编码器</span>
					<select v-model="appStore.komorebi.video.codec">
						<option v-for="item in videoCodecSelectOptions" :key="item.value" :value="item.value" :disabled="item.disabled">{{ item.label }}</option>
					</select>
				</label>
				<label>
					<span>质量</span>
					<select v-model.number="appStore.komorebi.video.quality">
						<option :value="1">高质量</option>
						<option :value="2">均衡</option>
						<option :value="3">小体积</option>
						<option :value="4">极小体积</option>
					</select>
				</label>
				<label>
					<span>封装</span>
					<select v-model="appStore.komorebi.video.container">
						<option v-for="item in videoContainerOptions" :key="item.value" :value="item.value" :disabled="item.disabled">{{ item.label }}</option>
					</select>
				</label>
				<label>
					<span>音轨</span>
					<select v-model="appStore.komorebi.video.audioSource">
						<option value="source">保留源音轨</option>
						<option value="none">无声视频</option>
						<option value="external">使用外部音轨</option>
					</select>
				</label>
				<label :class="{ disabled: !hasVideoExternalAudio }">
					<span>外部音轨</span>
					<div class="path-row">
						<input v-model="appStore.komorebi.video.externalAudio" :disabled="!hasVideoExternalAudio" placeholder="C:/Music/audio.flac" />
						<button :disabled="!hasVideoExternalAudio" @click="chooseExternalAudio('video')">选择</button>
					</div>
				</label>
				<label>
					<span>输出目录</span>
					<div class="path-row">
						<input v-model="appStore.komorebi.video.outputDir" placeholder="留空时输出到源文件目录" />
						<button @click="chooseOutputDir('video')">选择</button>
					</div>
				</label>
				<label>
					<span>输出文件名</span>
					<input v-model="appStore.komorebi.video.outputNameTemplate" placeholder="留空默认：[filename]_komorebi" />
				</label>
				<div class="estimate">{{ estimateVideoSize }}</div>
			</div>
		</section>

		<section v-else-if="appStore.komorebi.workflow === 'audio-convert'" class="panel">
			<div class="grid">
				<label>
					<span>目标格式</span>
					<select v-model="appStore.komorebi.audio.format">
						<option v-for="item in audioFormatOptions" :key="item.value" :value="item.value" :disabled="item.disabled">{{ item.label }}</option>
					</select>
				</label>
				<label>
					<span>质量档位</span>
					<select v-model.number="appStore.komorebi.audio.quality">
						<option :value="1">320k / 无损</option>
						<option :value="2">192k</option>
						<option :value="3">128k</option>
						<option :value="4">64k</option>
					</select>
				</label>
				<label>
					<span>输出目录</span>
					<div class="path-row">
						<input v-model="appStore.komorebi.audio.outputDir" placeholder="留空时输出到源文件目录" />
						<button @click="chooseOutputDir('audio')">选择</button>
					</div>
				</label>
				<label>
					<span>输出文件名</span>
					<input v-model="appStore.komorebi.audio.outputNameTemplate" placeholder="留空默认：[filename]_audio" />
				</label>
			</div>
		</section>

		<section v-else-if="appStore.komorebi.workflow === 'remux'" class="panel">
			<div class="grid">
				<label>
					<span>目标容器</span>
					<select v-model="appStore.komorebi.remux.container">
						<option v-for="item in remuxContainerOptions" :key="item.value" :value="item.value" :disabled="item.disabled">{{ item.label }}</option>
					</select>
				</label>
				<label>
					<span>外部音轨</span>
					<select v-model="appStore.komorebi.remux.audioSource">
						<option value="source">不添加外部音轨</option>
						<option value="external">添加外部音轨</option>
					</select>
				</label>
				<label :class="{ disabled: !hasRemuxExternalAudio }">
					<span>外部音轨文件</span>
					<div class="path-row">
						<input v-model="appStore.komorebi.remux.externalAudio" :disabled="!hasRemuxExternalAudio" placeholder="C:/Music/audio.flac" />
						<button :disabled="!hasRemuxExternalAudio" @click="chooseExternalAudio('remux')">选择</button>
					</div>
				</label>
				<label>
					<span>输出目录</span>
					<div class="path-row">
						<input v-model="appStore.komorebi.remux.outputDir" placeholder="留空时输出到源文件目录" />
						<button @click="chooseOutputDir('remux')">选择</button>
					</div>
				</label>
				<label>
					<span>输出文件名</span>
					<input v-model="appStore.komorebi.remux.outputNameTemplate" placeholder="留空默认：[filename]_remux" />
				</label>
			</div>
			<div class="note">默认流复制，保留字幕和元数据；容器不兼容时会自动切换到高保真转码重试。</div>
		</section>

		<section v-else class="panel ncm-panel">
			<div class="ncm-hint">将 .ncm 文件或文件夹拖入上方任务区；文件夹会展开为单个 NCM 任务。</div>
			<div class="grid">
				<label>
					<span>转换格式</span>
					<select v-model="appStore.komorebi.ncm.targetFormat">
						<option v-for="item in ncmFormatOptions" :key="item.value" :value="item.value" :disabled="item.disabled">{{ item.label }}</option>
					</select>
				</label>
				<label>
					<span>质量档位</span>
					<select v-model="appStore.komorebi.ncm.qualityMode">
						<option value="copy">只解密，不压缩</option>
						<option value="standard">标准压缩</option>
						<option value="small">小体积压缩</option>
					</select>
				</label>
				<label>
					<span>输出目录</span>
					<div class="path-row">
						<input v-model="appStore.komorebi.ncm.outputDir" placeholder="留空时输出到源目录" />
						<button @click="chooseOutputDir('ncm')">选择</button>
					</div>
				</label>
				<label>
					<span>输出文件名</span>
					<input v-model="appStore.komorebi.ncm.outputNameTemplate" placeholder="留空使用 ncmdump 默认文件名" />
				</label>
				<label class="check">
					<input type="checkbox" v-model="appStore.komorebi.ncm.recursive" />
					<span>递归目录</span>
				</label>
				<label class="check danger">
					<input type="checkbox" v-model="appStore.komorebi.ncm.deleteSource" />
					<span>转换成功后删除源文件</span>
				</label>
			</div>
		</section>

		<div class="actions" v-if="appStore.komorebi.workflow !== 'ncm'">
			<button class="secondary" @click="appStore.applyKomorebiNormalPreset('global')">设为全局参数</button>
			<button class="primary" :disabled="!selectedTaskCount" @click="appStore.applyKomorebiNormalPreset('selected')">应用到选中任务</button>
		</div>
		<div class="actions" v-else>
			<button class="secondary" @click="appStore.applyKomorebiNcmPreset('global')">设为全局参数</button>
			<button class="primary" :disabled="!selectedNcmTaskCount" @click="appStore.applyKomorebiNcmPreset('selected')">应用到选中任务</button>
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
	.compat-hint {
		max-width: 1120px;
		margin: 0 auto 8px;
		text-align: left;
		font-size: 12px;
		line-height: 20px;
		color: var(--66);
	}
	.panel {
		max-width: 1120px;
		margin: 0 auto;
		padding: 16px;
		border-radius: 8px;
		background: hwb(var(--bg99) / 0.78);
		border: 1px solid hwb(var(--bg90) / 0.46);
		box-shadow: 0 1px 4px hwb(var(--hoverShadow) / 0.08);
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
		span {
			color: var(--66);
		}
		&.disabled {
			opacity: 0.55;
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
		transition: border-color 0.16s ease, box-shadow 0.16s ease, background 0.16s ease;
		&:hover {
			border-color: hwb(var(--primaryColor) / 0.28);
		}
		&:focus {
			border-color: hwb(var(--primaryColor) / 0.48);
			box-shadow: 0 0 0 3px hwb(var(--primaryColor) / 0.10);
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
			transition: background 0.16s ease, transform 0.16s ease;
			&:hover:not(:disabled) {
				background: hwb(var(--primaryColor) / 0.13);
			}
			&:active:not(:disabled) {
				transform: scale(0.98);
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
		line-height: 30px;
		padding: 0 10px;
		border-radius: 6px;
		background: hwb(var(--bg97) / 0.6);
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
		transition: background 0.16s ease, transform 0.16s ease, box-shadow 0.16s ease, opacity 0.16s ease;
		&:hover:not(:disabled) {
			transform: translateY(-1px);
		}
		&:active:not(:disabled) {
			transform: scale(0.98);
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
}
</style>
