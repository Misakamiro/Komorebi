import CryptoJS from 'crypto-js';
import { EventEmitter } from 'events';
import os from 'os';
import fs from 'fs';
import fsPromise from 'fs/promises';
import { utimes } from 'utimes';
import path from 'path';
import { ServiceTask, TaskStatus, OutputParams, FFBoxServiceEvent, Notification, NotificationLevel, FFmpegProgress, WorkingStatus, FFBoxServiceInterface, FFmpegInfo, EncoderDetail, FFmpegCodecDetail, FFmpegFilterDetail, FFmpegMuxerDetail, FFmpegDemuxerDetail, NcmTaskParams, InputInfo } from '@common/types';
import i11n from '@common/i11n/i11n';
import { genTaskOutputFiles, getFFmpegParaArray } from '@common/getFFmpegParaArray';
import { buildKomorebiFFmpegArgs, buildKomorebiRemuxFallbackParams, buildNcmDumpArgs, getKomorebiMediaHints, shouldKomorebiRemuxTranscode } from '@common/komorebiPresets';
import localConfig from '@common/localConfig';
import { parseFFmpegCodecsToCodecsList, parseFFmpegMuDeMuxersToList } from '@common/params/parser';
import { getInitialServiceTask, TypedEventEmitter, replaceOutputParams, randomString, getOutputDuration, parseTimeString, getOutputFileTime } from '@common/utils';
import { getMachineId, log } from './utils';
import { FFmpeg } from './FFmpegInvoke';
import { NcmDump } from './NcmDumpInvoke';
import { webhookManager } from './utils/webhookManager';

export interface FFBoxServerEvent {
	serverReady: () => void;
	serverError: (arg: { error: Error }) => void;
	serverClose: () => void;
}

export class FFBoxService extends (EventEmitter as new () => TypedEventEmitter<FFBoxServiceEvent & FFBoxServerEvent>) implements FFBoxServiceInterface {
	public tasklist: ServiceTask[] = [];
	private latestTaskId = 0;
	public workingStatus: WorkingStatus = WorkingStatus.idle;
	public ffmpegPath = '';
	public ncmdumpPath = '';
	public ffmpegInfo: FFmpegInfo = { version: '', scanning: false, videoEncodersCount: 0, audioEncodersCount: 0, filtersCount: 0, muxersCount: 0, demuxersCount: 0 };
	public ffmpegCodecs: { video: FFmpegCodecDetail[], audio: FFmpegCodecDetail[]; };
	public ffmpegFormats: { muxer: FFmpegMuxerDetail[], demuxer: FFmpegDemuxerDetail[]; };
	public ffmpegFilters: FFmpegFilterDetail[] = [];
	public notifications: Notification[] = [];
	private latestNotificationId = 0;
	public functionLevel = 100;
	public machineId: string;
	// 设置部分
	private maxThreads = 2;
	private customFFmpegPath: string;
	private preserveUnfinishedTasks = true;
	private deleteFinishedTasks = false;
	// 帧扫描状态跟踪：key = `${id}_${fileIndex}_${videoStreamIndex}_${filePath}`
	private frameScanStatus: Map<string, {
		status: 'scanning' | 'completed';
		promise?: Promise<void>;
	}> = new Map();

	private getAvailableEncoderNames(): string[] {
		return (this.ffmpegCodecs?.video || []).flatMap((codec) => codec.encoders.map((encoder) => encoder.name));
	}

	private async canExecute(filePath: string): Promise<boolean> {
		try {
			await fsPromise.access(filePath, fs.constants.X_OK);
			return true;
		} catch {
			return false;
		}
	}

	private getBundledToolCandidates(exeName: string): string[] {
		const candidates = [
			path.join(process.execPath, '..', exeName),
			process.resourcesPath ? path.join(process.resourcesPath, exeName) : '',
			process.resourcesPath ? path.join(process.resourcesPath, '..', exeName) : '',
			path.join(process.cwd(), exeName),
			path.join(__dirname, exeName),
			path.resolve(process.cwd(), 'tools', exeName),
			path.resolve(__dirname, '..', '..', 'tools', exeName),
			path.resolve(__dirname, '..', '..', '..', 'tools', exeName),
		].filter(Boolean);
		return [...new Set(candidates)];
	}

	private async firstExecutable(candidates: string[], fallback: string): Promise<string> {
		for (const candidate of candidates) {
			if (candidate && await this.canExecute(candidate)) {
				return candidate;
			}
		}
		return fallback;
	}

	private getPrimaryInputInfo(task: ServiceTask): InputInfo | undefined {
		return task.before?.[0];
	}

	private normalizeKomorebiTaskBeforeStart(id: number, task: ServiceTask): void {
		const preset = task.after.extra?.komorebiPreset;
		if (task.after.extra?.komorebiWorkflow !== 'remux' || !preset || task.after.extra?.komorebiFallbackTried) {
			return;
		}
		const hints = getKomorebiMediaHints(this.getPrimaryInputInfo(task));
		const reason = shouldKomorebiRemuxTranscode(preset.container, hints);
		if (!reason) {
			return;
		}
		task.after.extra.komorebiFallbackTried = true;
		this.setNotification(id, `任务「${task.taskName}」的源${reason === 'video' ? '视频' : '音频'}编码与 ${preset.container.toUpperCase()} 容器不兼容，已自动切换为高保真转码。`, NotificationLevel.warning);
	}

	private async waitForKomorebiMetadata(id: number, task: ServiceTask): Promise<void> {
		if (!task.after.extra?.komorebiWorkflow || this.getPrimaryInputInfo(task)?.streams?.length) {
			return;
		}
		await Promise.race([
			Promise.allSettled(this.getFileMetadata(id, task)),
			new Promise((resolve) => setTimeout(resolve, 1200)),
		]);
	}

	private applyKomorebiThreadLimit(args: string[]): string[] {
		if (this.maxThreads <= 1 || args.includes('-threads')) {
			return args;
		}
		const threadCount = Math.max(1, Math.floor((Math.max(2, os.cpus().length) - 1) / this.maxThreads));
		const outputIndex = args[args.length - 1] === '-y' ? args.length - 2 : args.length - 1;
		args.splice(Math.max(0, outputIndex), 0, '-threads', `${threadCount}`);
		return args;
	}

	private buildTaskFFmpegArgs(task: ServiceTask, forceCpu = false): string[] {
		const outputFile = task.outputFiles?.[0];
		if (outputFile && task.after.extra?.komorebiWorkflow) {
			const args = buildKomorebiFFmpegArgs(task.after, outputFile, this.getAvailableEncoderNames(), forceCpu, getKomorebiMediaHints(this.getPrimaryInputInfo(task)));
			if (args) {
				return this.applyKomorebiThreadLimit(args);
			}
		}
		return getFFmpegParaArray({ outputParams: task.after });
	}

	constructor() {
		super();
		log.info('正在初始化 FFBox 服务。');
		setTimeout(async () => {
			this.initActivationInfo();
			await this.initSettings();
			webhookManager.load();
			// this.initFFmpeg();	// 在 initSetting 中已调用
		}, 0);
	}

	private async initActivationInfo() {
		this.machineId = getMachineId();
		const activationCode = await localConfig.get('userInfo.activationCode') as string;
		let result;
		if (activationCode) {
			result = this.activate(activationCode);
		}
		this.functionLevel = 100;
		log.info(activationCode ? (result ? '已读取激活信息' : '激活信息无效') : '未读取到激活信息');
	}

	/**
	 * 从本地存储初始化设置
	 */
	public async initSettings(): Promise<void> {
		const currentMaxThreads = (await localConfig.get('service.maxThreads') as number) || 2;
		this.maxThreads = Math.max(2, currentMaxThreads);
		log.info(`设定最大同时运行任务数为 ${this.maxThreads}`);

		const customFFmpegPath = await localConfig.get('service.customFFmpegPath');
		// 发生了变更，或者初始化时 ffmpegPath 为空（如果之前已经初始化过，那么 customFFmpegPath 两者之一不为空）
		if (this.customFFmpegPath !== customFFmpegPath || !this.ffmpegPath && !customFFmpegPath) {
			this.customFFmpegPath = customFFmpegPath as any || undefined;
			this.initFFmpeg();
		}
		this.customFFmpegPath = customFFmpegPath as any || undefined;
		await this.initNcmdump();

		const preserveUnfinishedTasks = await localConfig.get('service.preserveUnfinishedTasks') === false ? false : true;
		const lastStatusTasks = await localConfig.get('lastStatus.tasks') as { taskName: string; after: OutputParams; }[];
		if (preserveUnfinishedTasks) {
			try {
				if (lastStatusTasks.length) {
					this.setNotification(undefined, `服务器上次退出时有未完成任务 ${lastStatusTasks.length} 个，正在重新添加到任务列表`, NotificationLevel.info);
				}
				log.info(`正在恢复上次退出时未完成的 ${lastStatusTasks.length} 个任务`);
				for (const task of lastStatusTasks) {
					this.taskAdd(task.taskName, task.after);
				}
				await localConfig.set('lastStatus.tasks', []);
			} catch (error) {}
		} else {
			try {
				if (lastStatusTasks.length) {
					await localConfig.set('lastStatus.tasks', []);
				}
			} catch (error) {}
		}

		this.deleteFinishedTasks = await localConfig.get('service.deleteFinishedTasks') === true ? true : false;
	}

	/**
	 * 检测 ffmpeg 版本，并 emit ffmpegInfo
	 * @emits ffmpegInfo
	 */
	private async initNcmdump(): Promise<void> {
		const exeName = process.platform === 'win32' ? 'ncmdump.exe' : 'ncmdump';
		this.ncmdumpPath = await this.firstExecutable(this.getBundledToolCandidates(exeName), 'ncmdump');
		if (this.ncmdumpPath === 'ncmdump') {
			this.setNotification(undefined, '未在应用目录中发现 ncmdump，将回退使用 PATH 中的 ncmdump。NCM 转换需要可执行文件可用。', NotificationLevel.warning);
		} else {
			log.info(`已发现 ncmdump：${this.ncmdumpPath}`);
		}
	}

	public async initFFmpeg(ignoreCustomPath = false): Promise<void> {
		const exeName = process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg';
		const systemCandidates = process.platform === 'darwin' ? ['/usr/local/bin/ffmpeg', '/opt/homebrew/bin/ffmpeg'] : [];
		const autoFFmpegPath = await this.firstExecutable([...this.getBundledToolCandidates(exeName), ...systemCandidates], 'ffmpeg');
		const requestedCustomPath = ignoreCustomPath ? undefined : this.customFFmpegPath;
		if (requestedCustomPath) {
			if (await this.canExecute(requestedCustomPath)) {
				log.info(`已手动指定 ffmpeg 路径为 ${requestedCustomPath}，检查版本。`);
				this.ffmpegPath = requestedCustomPath;
			} else {
				this.setNotification(undefined, `指定的 FFmpeg 路径不可用，已自动回退到内置 FFmpeg：${requestedCustomPath}`, NotificationLevel.warning);
				this.ffmpegPath = autoFFmpegPath;
			}
		} else {
			log.info('检查 FFmpeg 路径和版本。');
			this.ffmpegPath = autoFFmpegPath;
		}
		if (this.ffmpegPath === 'ffmpeg') {
			this.setNotification(undefined, '未在应用目录中发现内置 FFmpeg，将回退使用 PATH 中的 ffmpeg。请确认安装包包含 tools/ffmpeg.exe。', NotificationLevel.warning);
		}
		this.ffmpegInfo = { version: '', scanning: true, videoEncodersCount: 0, audioEncodersCount: 0, muxersCount: 0, demuxersCount: 0, filtersCount: 0 };
		this.emitFFmpegInfo();
		const probingPath = this.ffmpegPath;
		const ffmpeg = new FFmpeg(this.ffmpegPath, 1);
		ffmpeg.on('version', async ({ content }) => {
			if (this.ffmpegPath !== probingPath) {
				return;
			}
			if (content) {
				this.ffmpegInfo.version = content;
				const lastFFmpegVersion = await localConfig.get('ffmpegInfo.version');
				if (lastFFmpegVersion === content) {
					try {
						const storedFFmpegInfo = await localConfig.get('ffmpegInfo') as any;
						this.ffmpegInfo.audioEncodersCount = storedFFmpegInfo.audioEncodersCount ?? 0;
						this.ffmpegInfo.videoEncodersCount = storedFFmpegInfo.videoEncodersCount ?? 0;
						this.ffmpegInfo.muxersCount = storedFFmpegInfo.muxersCount ?? 0;
						this.ffmpegInfo.demuxersCount = storedFFmpegInfo.demuxersCount ?? 0;
						this.ffmpegInfo.filtersCount = storedFFmpegInfo.filtersCount ?? 0;
						this.ffmpegCodecs = {
							video: JSON.parse(storedFFmpegInfo.videoCodecs),
							audio: JSON.parse(storedFFmpegInfo.audioCodecs),
						};
						this.ffmpegFormats = {
							muxer: JSON.parse(storedFFmpegInfo.muxers),
							demuxer: JSON.parse(storedFFmpegInfo.demuxers),
						};
						this.ffmpegFilters = JSON.parse(storedFFmpegInfo.filters) || [];
						log.info(`已获取 FFmpeg 路径 ${this.ffmpegPath} 版本 ${content}。已从缓存中加载编码器和滤镜。`);
						this.ffmpegInfo.scanning = false;
						this.emitFFmpegInfo();
					} catch (error) {
						log.info(`已获取 FFmpeg 路径 ${this.ffmpegPath} 版本 ${content}。缓存中的编码器和滤镜不可用，即将获取编码器信息。`);
						setTimeout(() => {
							this.getFFmpegCodecsAndFilters();
						}, 100);							
					}
				} else {
					log.info(`已获取 FFmpeg 路径 ${this.ffmpegPath} 版本 ${content}。即将获取编码器信息。`);
					setTimeout(() => {
						this.getFFmpegCodecsAndFilters();
					}, 100);
				}
			} else {
				if (requestedCustomPath && autoFFmpegPath !== requestedCustomPath) {
					this.setNotification(undefined, `指定的 FFmpeg 无法启动，已自动回退到内置 FFmpeg：${requestedCustomPath}`, NotificationLevel.warning);
					this.initFFmpeg(true);
					return;
				}
				this.ffmpegInfo.version = '';
				this.ffmpegInfo.scanning = false;
				this.emitFFmpegInfo();
			}
		});
		setTimeout(() => {
			if (!this.ffmpegInfo.version && this.ffmpegPath === probingPath) {
				if (requestedCustomPath && autoFFmpegPath !== requestedCustomPath) {
					this.setNotification(undefined, `指定的 FFmpeg 没有返回版本信息，已自动回退到内置 FFmpeg：${requestedCustomPath}`, NotificationLevel.warning);
					this.initFFmpeg(true);
					return;
				}
				log.error(`在检查 ffmpeg 版本时，ffmpeg 成功启动，但 stdio 中没有接收到任何消息。重试。`);
				this.initFFmpeg(ignoreCustomPath);
			}
		}, 1500);
	}

	public async getFFmpegCodecsAndFilters(): Promise<void> {
		this.ffmpegInfo.scanning = true;
		this.emitFFmpegInfo();
		await new Promise((resolve, reject) => {
			// 获取 codecs
			const ffmpeg = new FFmpeg(this.ffmpegPath, 3, ['-codecs']);
			ffmpeg.on('codecs', async (codecsResult) => {
				log.info(`编码器概览扫描完成，支持视频编码 ${codecsResult.videoCodecs.length} 个、音频编码 ${codecsResult.audioCodecs.length} 个。即将扫描详细信息。`);
				console.log(codecsResult);
				const videoFinalResult: FFmpegCodecDetail[] = [];
				const audioFinalResult: FFmpegCodecDetail[] = [];
				let videoEncodersCount = 0;
				let audioEncodersCount = 0;
				for (const codec of codecsResult.videoCodecs) {
					const encoderNames = codec.encoders.length ? codec.encoders : [codec.name];
					const encoderDetails: (EncoderDetail & { name: string; })[] = [];
					videoEncodersCount += encoderNames.length;
					for (const encoderName of encoderNames) {
						// console.log(`正在读取 ${codec.name} ${encoder}`);
						await new Promise((resolve, _) => {
							const ffmpeg2 = new FFmpeg(this.ffmpegPath, 3, ['-hide_banner', '-h', `encoder=${encoderName}`]);
							ffmpeg2.on('codecs', (_, codecResult) => {
								// console.log(codecResult);
								encoderDetails.push({ name: encoderName, ...codecResult });
								resolve(0);
							});
						});
					}
					videoFinalResult.push({
						name: codec.name,
						description: codec.description,
						encoders: encoderDetails,
					});
				}
				log.info('视频编码器扫描结果', videoFinalResult);
				this.ffmpegInfo.videoEncodersCount = videoEncodersCount;
				this.emitFFmpegInfo();
				for (const codec of codecsResult.audioCodecs) {
					const encoderNames = codec.encoders.length ? codec.encoders : [codec.name];
					const encoderDetails: (EncoderDetail & { name: string; })[] = [];
					audioEncodersCount += encoderNames.length;
					for (const encoderName of encoderNames) {
						// console.log(`正在读取 ${codec.name} ${encoder}`);
						await new Promise((resolve, _) => {
							const ffmpeg2 = new FFmpeg(this.ffmpegPath, 3, ['-hide_banner', '-h', `encoder=${encoderName}`]);
							ffmpeg2.on('codecs', (_, codecResult) => {
								// console.log(codecResult);
								encoderDetails.push({ name: encoderName, ...codecResult });
								resolve(0);
							});
						});
					}
					audioFinalResult.push({
						name: codec.name,
						description: codec.description,
						encoders: encoderDetails,
					});
				}
				log.info('音频编码器扫描结果', audioFinalResult);
				this.ffmpegInfo.audioEncodersCount = audioEncodersCount;
				this.emitFFmpegInfo();
				this.ffmpegCodecs = { video: videoFinalResult, audio: audioFinalResult };
				parseFFmpegCodecsToCodecsList(this.ffmpegCodecs);
				resolve(0);
			});
		});
		await new Promise((resolve, reject) => {
			// 获取 muxers/demuxers
			const ffmpeg = new FFmpeg(this.ffmpegPath, 4, ['-formats']);
			ffmpeg.on('formats', async (formatsResult) => {
				log.info(`格式概览扫描完成，支持复用器 ${formatsResult.muxers.length} 个、解复用器 ${formatsResult.demuxers.length} 个。即将扫描详细信息。`);
				console.log(formatsResult);
				const muxerFinalResult: FFmpegMuxerDetail[] = [];
				const demuxerFinalResult: FFmpegDemuxerDetail[] = [];
				for (const muxer of formatsResult.muxers) {
					// console.log(`正在读取 ${filter.name}`);
					await new Promise((resolve, _) => {
						const ffmpeg2 = new FFmpeg(this.ffmpegPath, 4, ['-hide_banner', '-h', `muxer=${muxer.name}`]);
						ffmpeg2.on('formats', (_, formatResult) => {
							muxerFinalResult.push({
								name: muxer.name,
								description: muxer.description,
								extensions: formatResult.commonExtensions,
								defaultVideoCodec: formatResult.defaultVideoCodec,
								defaultAudioCodec: formatResult.defaultAudioCodec,
								options: formatResult.options,
							});
							resolve(0);
						});
					});
				}
				log.info('复用器扫描结果', muxerFinalResult);
				this.ffmpegInfo.muxersCount = muxerFinalResult.length;
				this.emitFFmpegInfo();
				for (const demuxer of formatsResult.demuxers) {
					// console.log(`正在读取 ${filter.name}`);
					await new Promise((resolve, _) => {
						const ffmpeg2 = new FFmpeg(this.ffmpegPath, 4, ['-hide_banner', '-h', `demuxer=${demuxer.name}`]);
						ffmpeg2.on('formats', (_, formatResult) => {
							demuxerFinalResult.push({
								name: demuxer.name,
								description: demuxer.description,
								extensions: formatResult.commonExtensions,
								isDevice: demuxer.isDevice,
								options: formatResult.options,
							});
							resolve(0);
						});
					});
				}
				log.info('解复用器扫描结果', demuxerFinalResult);
				this.ffmpegInfo.demuxersCount = demuxerFinalResult.length;
				this.emitFFmpegInfo();
				this.ffmpegFormats = { muxer: muxerFinalResult, demuxer: demuxerFinalResult };
				parseFFmpegMuDeMuxersToList(this.ffmpegFormats);
				resolve(0);
			});
		});
		await new Promise((resolve, reject) => {
			// 获取 filters
			const ffmpeg = new FFmpeg(this.ffmpegPath, 5, ['-filters']);
			ffmpeg.on('filters', async (filtersResult) => {
				log.info(`滤镜概览扫描完成，支持滤镜 ${filtersResult.length} 个。即将扫描详细信息。`);
				console.log(filtersResult);
				const result: FFmpegFilterDetail[] = [];
				for (const filter of filtersResult) {
					// console.log(`正在读取 ${filter.name}`);
					await new Promise((resolve, _) => {
						const ffmpeg2 = new FFmpeg(this.ffmpegPath, 5, ['-hide_banner', '-h', `filter=${filter.name}`]);
						ffmpeg2.on('filters', (_, codecResult) => {
							result.push({
								name: filter.name,
								description: filter.description,
								inputType: filter.inputType,
								outputType: filter.outputType,
								options: codecResult.options,
							});
							resolve(0);
						});
					});
				}
				log.info('滤镜扫描结果', result);
				this.ffmpegFilters = result;
				this.ffmpegInfo.scanning = false;
				this.ffmpegInfo.filtersCount = result.length;
				this.emitFFmpegInfo();
				resolve(0);
			});	
		});
		localConfig.set('ffmpegInfo', {
			version: this.ffmpegInfo.version,
			audioEncodersCount: this.ffmpegInfo.audioEncodersCount,
			videoEncodersCount: this.ffmpegInfo.videoEncodersCount,
			muxersCount: this.ffmpegInfo.muxersCount,
			demuxersCount: this.ffmpegInfo.demuxersCount,
			filtersCount: this.ffmpegInfo.filtersCount,
			videoCodecs: JSON.stringify(this.ffmpegCodecs.video),
			audioCodecs: JSON.stringify(this.ffmpegCodecs.audio),
			muxers: JSON.stringify(this.ffmpegFormats.muxer),
			demuxers: JSON.stringify(this.ffmpegFormats.demuxer),
			filters: JSON.stringify(this.ffmpegFilters),
		});
	}

	/**
	 * 向所有客户端更新当前 ffmpeg 版本
	 * @emits ffmpegInfo
	 */
	private emitFFmpegInfo(): void {
		this.emit('ffmpegInfo', this.ffmpegInfo);
	}

	/**
	 * 向所有客户端更新单个任务
	 * @param id 任务 id
	 * @param task 直接传入 task 可减少一次内存查找
	 */
	private emitTaskUpdate(id: number, task?: ServiceTask): void {
		const _task = task || this.tasklist[id];
		if (_task) {
			this.emit('taskUpdate', {
				taskId: id,
				task: {
					kind: _task.kind ?? 'ffmpeg',
					taskName: _task.taskName,
					before: _task.before,
					after: _task.after,
					ncm: _task.ncm,
					paraArray: _task.paraArray,
					status: _task.status,
					progressLog: _task.progressLog,
					// cmdData: _task.cmdData,
					errorInfo: _task.errorInfo,
					outputFiles: _task.outputFiles,
				} as any,
			});
		}
	}

	/**
	 * 新增任务
	 * @param isRemote 该值由 uiBridge 传入，前端无法指定
	 * @emits tasklistUpdate
	 */
	public taskAdd(taskName: string, outputParams: OutputParams, isRemote?: boolean): Promise<number> {
		const id = this.latestTaskId++;
		const firstFilePath = outputParams.input.files?.[0]?.filePath;
		const task = getInitialServiceTask(taskName, outputParams);
		task.kind = 'ffmpeg';

		// 更新命令行参数
		if (isRemote) {
			task.outputFiles = genTaskOutputFiles(task.after, ``);
			task.paraArray = getFFmpegParaArray({ outputParams: task.after, withQuotes: true, overrideFilePaths: task.outputFiles });
			task.status = TaskStatus.initializing;
			task.remoteTask = true;
		} else {
			task.outputFiles = genTaskOutputFiles(task.after);
			task.paraArray = this.buildTaskFFmpegArgs(task);
			if (firstFilePath?.length) {
				this.getFileMetadata(id, task);
			}
		}
	
		log.info(`[任务 ${id}] 新增任务：${taskName}（${firstFilePath ? '单输入普通任务' : '多输入/网络任务'}）。`);
		this.tasklist[id] = task;
		this.emit('tasklistUpdate', { content: Object.keys(this.tasklist).map(Number) });

		webhookManager.triggerTaskEvent('task.created', id, { taskId: id, task: this.tasklist[id] as any }).catch(() => {});
		webhookManager.triggerGlobalEvent('tasklist.added', { taskId: id, task: this.tasklist[id] as any }).catch(() => {});
		webhookManager.triggerGlobalEvent('tasklist.changed', { taskIds: Object.keys(this.tasklist).map(Number) });

		return Promise.resolve(id);
	}

	/**
	 * 新增任务时调用 FFmpeg 获取输入文件信息、文件时间（仅本地模式在此处读取时间，远程模式在 mergeUploaded 接收时间）
	 */
	public taskAddNcm(params: NcmTaskParams): Promise<number> {
		const inputs = params.inputs.map((input) => input.trim()).filter(Boolean);
		if (!inputs.length) {
			this.setNotification(undefined, 'NCM 转换需要至少一个输入文件。', NotificationLevel.warning);
			return Promise.resolve(-1);
		}
		const normalizedParams: NcmTaskParams = {
			inputs,
			outputDir: params.outputDir?.trim() || undefined,
			outputNameTemplate: params.outputNameTemplate?.trim() || undefined,
			recursive: !!params.recursive,
			deleteSource: !!params.deleteSource,
			targetFormat: params.targetFormat || 'auto',
			qualityMode: params.qualityMode || 'copy',
		};
		const id = this.latestTaskId++;
		const task = getInitialServiceTask(
			inputs.length === 1 ? `NCM 转换：${path.basename(inputs[0])}` : `NCM 批量转换：${inputs.length} 项`,
		);
		task.kind = 'ncm';
		task.ncm = normalizedParams;
		task.after.input.files = inputs.map((filePath) => ({
			filePath,
			demuxer: 'ncm',
			hwaccel: '不使用',
			detail: {},
		}));
		task.paraArray = [this.ncmdumpPath || 'ncmdump', ...buildNcmDumpArgs(normalizedParams)];
		this.tasklist[id] = task;
		this.emit('tasklistUpdate', { content: Object.keys(this.tasklist).map(Number) });
		this.emitTaskUpdate(id, task);
		webhookManager.triggerTaskEvent('task.created', id, { taskId: id, task: this.tasklist[id] as any }).catch(() => {});
		webhookManager.triggerGlobalEvent('tasklist.added', { taskId: id, task: this.tasklist[id] as any }).catch(() => {});
		webhookManager.triggerGlobalEvent('tasklist.changed', { taskIds: Object.keys(this.tasklist).map(Number) });
		return Promise.resolve(id);
	}

	public async setNcmParameters(ids: number[], params: NcmTaskParams): Promise<void> {
		for (const id of ids) {
			const task = this.tasklist[id];
			if (!task || task.kind !== 'ncm' || !task.ncm || task.status === TaskStatus.running) {
				continue;
			}
			task.ncm = {
				...task.ncm,
				outputDir: params.outputDir?.trim() || undefined,
				outputNameTemplate: params.outputNameTemplate?.trim() || undefined,
				recursive: !!params.recursive,
				deleteSource: !!params.deleteSource,
				targetFormat: params.targetFormat || 'auto',
				qualityMode: params.qualityMode || 'copy',
			};
			task.paraArray = [this.ncmdumpPath || 'ncmdump', ...buildNcmDumpArgs(task.ncm)];
			this.emitTaskUpdate(id, task);
		}
	}

	private getFileMetadata(id: number, task: ServiceTask): Promise<any>[] {
		// FFmpeg 读取媒体信息
		log.info(`[任务 ${id}] 读取输入媒体信息。`);
		const filePromises = (task.after.input.files || []).map((file, inputIndex) => {
			const filePath = file.filePath;
			const realFilePath = task.remoteTask ? `${os.tmpdir()}/FFBoxUploadCache/${filePath}` : filePath;
			const promise1 = new Promise((resolve) => {
				const ffmpeg = new FFmpeg(this.ffmpegPath, 2, ['-hide_banner', '-i', realFilePath, '-f', 'null']);
				ffmpeg.on('data', ({ content }) => {
					this.setCmdText(id, content);
				});
				ffmpeg.on('metadata', ({ content }) => {
					task.before[inputIndex] = { ...task.before[inputIndex], ...content[0] };	// 目前的逻辑是即使是多输入也是逐个输入跑 metadata
					resolve(0);
				});
			})
			const promise2 = new Promise(async (resolve) => {
				if (!task.remoteTask) {
					try {
						await fsPromise.access(realFilePath, fs.constants.R_OK);
						const { atime, birthtime, mtime } = fs.statSync(realFilePath);
						task.before[inputIndex] = {
							...task.before[inputIndex],
							accessTime: atime.getTime(),
							createTime: birthtime.getTime(),
							modifyTime: mtime.getTime(),
						};
					} catch {}
					resolve(0);
				}
				resolve(0);
	
			});
			return new Promise((resolve) => {
				Promise.allSettled([promise1, promise2]).then(() => resolve([promise1, promise2]));
			})
		});

		Promise.allSettled(filePromises).then(() => this.emitTaskUpdate(id, task));
		return filePromises;
	}

	/**
	 * 对于远程文件，上传完成后调用此函数合并文件
	 * 前端无论检查到已缓存还是未缓存都使用相同的参数调用。前端和后端各自判断文件是否已上传过。若使用过，前端不再上传，后端不再进行分片读取合并
	 * @param fileBaseName 文件名参数不包含 hash，仅用于作为 input.files[].filePath 最终文件名的一部分供用户识别。相同 hash 但文件名不同的话，服务器会保留多份
	 * @param inputName 在新建任务上传文件之前，或添加输入文件上传之前，hash 尚未得知，因此前端应发起修改输入参数的调用，生成这个上传文件的一个临时占位符。上传完毕后，往 inputName 传入生成的占位符，以便后端将其替换为真实文件名
	 * @emits taskUpdate
	 */
	public async mergeUploaded(id: number, hashs: string[], fileBaseName: string, inputName: string, fileTime?: { accessTime: number, createTime: number, modifyTime: number }): Promise<void> {
		const task = this.tasklist[id];
		if (!task) {
			// 上传完成之前删除了任务
			return;
		}
		const uploadDir = os.tmpdir() + '/FFBoxUploadCache'; // 文件上传目录
		const concatedHash = CryptoJS.enc.Utf8.parse(hashs.join(''));
		const fileHash = CryptoJS.SHA1(concatedHash).toString();
		const destName = `${fileBaseName}⬝${fileHash}`;
		const destPath = `${uploadDir}/${destName}`;
		let fileExists = false;
		try {
			await fs.accessSync(destPath, fs.constants.R_OK);	
			fileExists = true;
		} catch (error) {}
		if (!fileExists) {
			// 将分片合并为一个文件（无论分片数量均会执行此逻辑，因此即使 1 个分片，最终文件名也是按分片 hash 的 hash 命名）
			fs.writeFile(destPath, '', (err) => {
				if (err) {
					this.setNotification(id, task.taskName + '：合并文件写入失败', NotificationLevel.error);
					return;
				}
				for (const hash of hashs) {
					const source = uploadDir + '/' + hash;
					fs.appendFileSync(destPath, fs.readFileSync(source) as any);
					fs.rmSync(source);
				}
			});
		}
		// 将 inputName 占位符改成 destName 真实文件名
		const inputIndex = task.after.input.files.findIndex((file) => file.filePath === inputName);
		if (inputIndex >= 0) {
			task.after.input.files[inputIndex].filePath = destName;	// 远程任务隐藏目录结构，运行时才 override 输入参数
			// 记录由前端传过来的文件时间（远程文件时间不能由后端读取，而是由前端传入）
			if (fileTime) {
				task.before[inputIndex] = {
					accessTime: fileTime.accessTime,
					createTime: fileTime.createTime,
					modifyTime: fileTime.modifyTime,
				} as any;	// 看看这样会不会出 bug
			}
		}
		task.paraArray = getFFmpegParaArray({ outputParams: task.after, withQuotes: true, overrideFilePaths: task.outputFiles });
		this.setNotification(id, `任务「${task.taskName}」输入文件「${fileBaseName}」上传完成`, NotificationLevel.info);
		this.emitTaskUpdate(id, task);
	}

	/**
	 * 切换任务状态的初始化或待命状态
	 */
	public async setUploadStatus(id: number, isUploading: boolean): Promise<void> {
		const task = this.tasklist[id];
		if (isUploading && task.status === TaskStatus.idle) {
			task.status = TaskStatus.initializing;
			this.emitTaskUpdate(id, task);
		} else if (!isUploading && task.status === TaskStatus.initializing) {
			task.status = TaskStatus.idle;
			this.emitTaskUpdate(id, task);
			setTimeout(() => {
				this.getFileMetadata(id, task);
			}, 150);	// 正常顺序是 mergeUploaded -> setUploadStatus，但函数并不等待而是接连调用，再考虑网络因素，稍微等待再 getFileMetadata 可避免输入文件名还没改过来就进行信息读取
		}
	}

	/**
	 * 获取、清除指定目录的缓存大小和文件数量（不递归）
	 */
	public async getCacheInfo(needDelete: boolean) {
		const uploadDir = path.join(os.tmpdir(), 'FFBoxUploadCache');
		const downloadDir = path.join(os.tmpdir(), 'FFBoxDownloadCache');
		let uploadSize = 0, uploadCount = 0;
		let downloadSize = 0, downloadCount = 0;
		try {
			const uploadFiles = await fs.promises.readdir(uploadDir);
			for (const file of uploadFiles) {
				const filePath = path.join(uploadDir, file);
				const stat = await fs.promises.stat(filePath);
				if (stat.isFile()) {
					uploadSize += stat.size;
					uploadCount++;
					if (needDelete) await fs.promises.unlink(filePath);
				}
			}
		} catch (err) {
			log.error(err);	// ENOENT 不存在
		}
		try {
			const downloadFiles = await fs.promises.readdir(downloadDir);
			for (const file of downloadFiles) {
				const filePath = path.join(downloadDir, file);
				const stat = await fs.promises.stat(filePath);
				if (stat.isFile()) {
					downloadSize += stat.size;
					downloadCount++;
					if (needDelete) await fs.promises.unlink(filePath);
				}
			}
		} catch (err) {
			log.error(err);
		}
		return { uploadCount, uploadSize, downloadCount, downloadSize };
	}

	/**
	 * 【initializing / idle / idle_queued / finished / error】 => 【deleted】
	 * @param id 任务 id
	 * @emits tasklistUpdate
	 */
	public async taskDelete(id: number): Promise<void> {
		const task = this.tasklist[id];
		if (!task) {
			log.error(`[任务 ${id}] 删除：任务不存在！`);
			return;
		}
		if (!task || !([TaskStatus.initializing, TaskStatus.idle, TaskStatus.idle_queued, TaskStatus.finished, TaskStatus.error].includes(task.status))) {
			log.error(`[任务 ${id}] 删除：任务当前状态为 ${task.status}，操作不合法但允许执行！`);
		} else {
			log.info(`[任务 ${id}] 删除任务。`);
		}
		task.status = TaskStatus.deleted;
		delete this.tasklist[id];

		// 清理帧扫描状态
		for (const key of this.frameScanStatus.keys()) {
			if (key.startsWith(`${id}_`)) {
				this.frameScanStatus.delete(key);
			}
		}

		this.emit('tasklistUpdate', { content: Object.keys(this.tasklist).map(Number) });

		webhookManager.triggerTaskEvent('task.deleted', id, { taskId: id });
		webhookManager.triggerGlobalEvent('tasklist.removed', { taskId: id });
		webhookManager.triggerGlobalEvent('tasklist.changed', { taskIds: Object.keys(this.tasklist).map(Number) });
	}

	/**
	 * 启动单个任务
	 * 【idle / idle_queued / error】 => 【running】 => 【finished / error】
	 * @param id 任务 id
	 * @emits taskUpdate
	 */
	public async taskStart(id: number): Promise<void> {
		const task = this.tasklist[id];
		if (!task) {
			log.error(`[任务 ${id}] 启动：任务不存在！`);
			return;
		}
		if (!([TaskStatus.idle, TaskStatus.idle_queued, TaskStatus.error].includes(task.status))) {
			log.error(`[任务 ${id}] 启动：任务当前状态为 ${task.status}，操作不合法但允许执行！`);
		} else {
			log.info(`[任务 ${id}] 启动。`);
		}
		task.status = TaskStatus.running;
		task.progressLog = {
			time: [],
			frame: [],
			size: [],
			lastStarted: new Date().getTime() / 1000,
			elapsed: 0,
			lastPaused: new Date().getTime() / 1000,
		};
		this.emit('progressUpdate', {
			taskId: id,
			time: new Date().getTime() / 1000,
		});
		this.setCmdText(id, '', false);
		if (task.kind === 'ncm') {
			this.startNcmTask(id, task);
			return;
		}
		await this.waitForKomorebiMetadata(id, task);
		this.normalizeKomorebiTaskBeforeStart(id, task);
		// const filePath = task.after.input.files[0].filePath!; // 需要上传完成，状态为 TASK_STOPPED 时才能开始任务，因此 filePath 非空
		let newFFmpeg: FFmpeg;
		if (task.remoteTask) {
			const remoteArgs = getFFmpegParaArray({ outputParams: task.after, inputDir: `${os.tmpdir()}/FFBoxUploadCache`, overrideFilePaths: task.outputFiles.map((fileBaseName) => `${os.tmpdir()}/FFBoxDownloadCache/${fileBaseName}`) });
			task.paraArray = remoteArgs;
			newFFmpeg = new FFmpeg(
				this.ffmpegPath,
				0,
				remoteArgs
			);
		} else {
			task.outputFiles = genTaskOutputFiles(task.after);	// 本地任务的 outputFiles 在任务开始时才生成，而远程任务则是在添加和修改参数时就刷新
			const args = this.buildTaskFFmpegArgs(task, !!task.after.extra?.komorebiCpuFallbackTried);
			task.paraArray = args;
			newFFmpeg = new FFmpeg(this.ffmpegPath, 0, args);
		}
		newFFmpeg.on('closed', async (errorCode, runningResult) => {
			if (errorCode) {
				if (
					task.after.extra?.komorebiRemuxFallback &&
					!task.after.extra?.komorebiFallbackTried &&
					task.status !== TaskStatus.stopping
				) {
					this.setCmdText(id, '\nDirect stream copy failed; retrying with high-fidelity transcode.\n');
					this.setNotification(id, `任务「${task.taskName}」转封装失败，正在自动切换为高保真转码重试。`, NotificationLevel.warning);
					task.after = buildKomorebiRemuxFallbackParams(task.after);
					task.status = TaskStatus.idle;
					task.ffmpeg = null;
					this.emitTaskUpdate(id, task);
					setTimeout(() => this.taskStart(id), 0);
					return;
				}
				const currentVcodec = task.after.outputs[0]?.video?.vcodec;
				const cpuFallbackCodec = currentVcodec?.includes('264')
					? 'libx264'
					: currentVcodec?.includes('265') || currentVcodec?.includes('hevc')
						? 'libx265'
						: currentVcodec?.includes('av1')
							? 'libsvtav1'
							: undefined;
				if (
					task.after.extra?.komorebiCpuFallback &&
					!task.after.extra?.komorebiCpuFallbackTried &&
					cpuFallbackCodec &&
					(task.paraArray || []).some((value) => ['_nvenc', '_qsv', '_amf', '_videotoolbox'].some((name) => value.includes(name))) &&
					task.status !== TaskStatus.stopping
				) {
					this.setCmdText(id, `\nHardware encoder ${currentVcodec} failed; retrying with ${cpuFallbackCodec}.\n`);
					this.setNotification(id, `任务「${task.taskName}」硬件编码失败，正在切换 CPU 编码重试。`, NotificationLevel.warning);
					task.after.outputs[0].video.vcodec = cpuFallbackCodec;
					task.after.extra.komorebiCpuFallbackTried = true;
					task.status = TaskStatus.idle;
					task.ffmpeg = null;
					this.emitTaskUpdate(id, task);
					setTimeout(() => this.taskStart(id), 0);
					return;
				}
				const errorMessages = newFFmpeg.messages.filter((message) => message.type === 'error').map((message) =>
					`\n${message.sender ? `【${message.sender}】` : ''}${message.translatedMessage ?? message.message}`
				);
				if (runningResult === 'failed') {
					log.error(`[任务 ${id}] 出错：${task.taskName}。`);
					this.setNotification(
						id,
						'任务「' + task.taskName + '」转码失败。' + errorMessages,
						NotificationLevel.error,
					);
				} else if (task.status == TaskStatus.stopping) {
					this.setNotification(id, '任务「' + task.taskName + '」已强制结束。', NotificationLevel.warning);
				} else {
					log.error(`[任务 ${id}] 异常终止：${task.taskName}。`);
					this.setNotification(id, '任务「' + task.taskName + '」异常终止。' + errorMessages, NotificationLevel.error);
				}
				task.status = TaskStatus.error;

				webhookManager.triggerTaskEvent('task.error', id, { taskId: id, task: task as any, error: errorMessages.join('\n') });
			} else {
				if (task.status !== TaskStatus.stopping) {
					log.info(`[任务 ${id}] 完成：${task.taskName}。`);
					const hasTimeError: string[] = [];
					// 对每个输出文件进行时间修改。但暂不支持多输入，会按第一个输入进行修改
					for (let i = 0; i < (task.remoteTask ? 0 : task.after.outputs.length); i++) {
						const output = task.after.outputs[i];
						const mux = output.mux;
						const outputFilePath = task.outputFiles[i];
						if (mux.keepFileTime) {
							try {
								// 如果输入文件不可读取，或者 utimes 失败，或者 FFBox 无法正确计算文件时间，都会产生 hasTimeError
								const { accessTime, createTime, modifyTime, ok } = getOutputFileTime(task, i);
								if (ok) {
									log.info(`[任务 ${id}] 将按照首个输入文件的时间修改任务时间。新创建时间 ${new Date(createTime).toISOString()}；新修改时间 ${new Date(modifyTime).toISOString()}；新访问时间 ${new Date(accessTime).toISOString()}。`);
									await utimes(outputFilePath, { btime: createTime, mtime: modifyTime, atime: accessTime });
								} else {
									hasTimeError.push(i + 1 + '');
								}
							} catch (error) {
								hasTimeError.push(i + 1 + '');
							}
						}
					}
					task.status = TaskStatus.finished;
					task.progressLog.elapsed = new Date().getTime() / 1000 - task.progressLog.lastStarted;
					if (hasTimeError.length) {
						this.setNotification(id, `任务「${task.taskName}」已转码完成，但修改第 ${hasTimeError.join(' ')} 个文件时间失败。`, NotificationLevel.warning);
					} else {
						this.setNotification(id, `任务「${task.taskName}」已转码完成`, NotificationLevel.ok);
					}

					webhookManager.triggerTaskEvent('task.completed', id, { taskId: id, task: task as any });

					if (this.deleteFinishedTasks) {
						setTimeout(() => {
							this.taskDelete(id);
						}, 0);
					}
				} else {
					this.setNotification(id, '任务「' + task.taskName + '」已正常中止。', NotificationLevel.warning);
				}
			}
			this.emitTaskUpdate(id, task);
			this.queueAssign();
			this.storeUnfinishedTask();		
		});
		newFFmpeg.on('status', (status: FFmpegProgress) => {
			const progressLog = task.progressLog;
			const time = new Date().getTime() / 1000 - progressLog.lastStarted + progressLog.elapsed;
			for (const parameter of ['time', 'frame', 'size']) {
				const _parameter = parameter as 'time' | 'frame' | 'size';
				progressLog[_parameter].push([time, status[_parameter]]);
			}
			this.emit('progressUpdate', {
				taskId: id,
				time,
				status,
			});
			webhookManager.triggerTaskEvent('task.progress', id, { taskId: id, progress: status });
		});
		newFFmpeg.on('data', ({ content }) => {
			this.setCmdText(id, content);
		});
		// newFFmpeg.on('error', ({ error }) => {
		// 	task.errorInfo.push(error.description);
		// });
		newFFmpeg.on('warning', (warning) => {
			this.setNotification(id, task.taskName + '：' + warning.content, NotificationLevel.warning);
		});
		for (const parameter of ['time', 'frame', 'size']) {
			const _parameter = parameter as 'time' | 'frame' | 'size';
			task.progressLog[_parameter].push([new Date().getTime() / 1000 - task.progressLog.lastStarted, 0]);
		}
		task.ffmpeg = newFFmpeg;
		this.emitTaskUpdate(id, task);

		webhookManager.triggerTaskEvent('task.started', id, { taskId: id, task: this.tasklist[id] as any });

		if (this.workingStatus === WorkingStatus.idle) {
			this.workingStatus = WorkingStatus.running;
			this.emit('workingStatusUpdate', { value: 'start' });
			webhookManager.triggerGlobalEvent('queue.started', { timestamp: Date.now() });
		}
		this.storeUnfinishedTask();
	}

	/**
	 * 将单个任务进入排队状态（不会启动调度系统改变当前的执行/暂停状态）
	 * 【idle / paused】 => 【idle_queued / paused_queued】 => 【running】
	 * @param id 
	 */
	private async findNcmOutputs(params: NcmTaskParams, startedAt: number): Promise<string[]> {
		const audioExts = new Set(['.mp3', '.flac', '.wav', '.m4a', '.aac', '.ogg', '.opus', '.wma', '.ac3', '.mp2']);
		const results: string[] = [];
		for (const input of params.inputs) {
			if (!input.toLowerCase().endsWith('.ncm')) {
				continue;
			}
			const outputDir = params.outputDir?.trim() || path.dirname(input);
			const baseName = path.basename(input, path.extname(input));
			try {
				const files = await fsPromise.readdir(outputDir);
				for (const file of files) {
					const ext = path.extname(file).toLowerCase();
					if (!audioExts.has(ext) || !path.basename(file, ext).startsWith(baseName)) {
						continue;
					}
					const fullPath = path.join(outputDir, file);
					const stat = await fsPromise.stat(fullPath);
					if (stat.mtimeMs >= startedAt - 5000) {
						results.push(fullPath);
					}
				}
			} catch {}
		}
		return [...new Set(results)];
	}

	private async getTotalFileSizeKb(files: string[]): Promise<number> {
		let total = 0;
		for (const file of files) {
			try {
				const stat = await fsPromise.stat(file);
				total += stat.size;
			} catch {}
		}
		return total / 1000;
	}

	private getUniqueOutputPath(targetPath: string, sourcePath?: string): string {
		if (sourcePath && path.resolve(targetPath).toLowerCase() === path.resolve(sourcePath).toLowerCase()) {
			return sourcePath;
		}
		const parsed = path.parse(targetPath);
		let candidate = targetPath;
		let index = 2;
		while (fs.existsSync(candidate)) {
			candidate = path.join(parsed.dir, `${parsed.name}_${index}${parsed.ext}`);
			index++;
		}
		return candidate;
	}

	private buildNcmCustomOutputPath(inputFile: string, params: NcmTaskParams, targetExt: string, fallbackSuffix = 'komorebi'): string {
		const template = (params.outputNameTemplate || '').trim().replace(/[\\/]/g, '_');
		const ext = targetExt.replace(/^\./, '');
		if (!template) {
			return path.join(path.dirname(inputFile), `${path.basename(inputFile, path.extname(inputFile))}_${fallbackSuffix}.${ext}`);
		}
		const inputBase = path.basename(inputFile, path.extname(inputFile));
		const fileName = (template.includes('[fileext]') ? template : `${template}.[fileext]`)
			.replace(/\[filename\]/g, inputBase)
			.replace(/\[fileext\]/g, ext);
		return path.join(path.dirname(inputFile), fileName);
	}

	private async renameNcmOutputIfNeeded(inputFile: string, params: NcmTaskParams): Promise<string> {
		if (!params.outputNameTemplate?.trim()) {
			return inputFile;
		}
		const targetPath = this.getUniqueOutputPath(
			this.buildNcmCustomOutputPath(inputFile, params, path.extname(inputFile), ''),
			inputFile,
		);
		if (targetPath === inputFile) {
			return inputFile;
		}
		await fsPromise.rename(inputFile, targetPath);
		return targetPath;
	}

	private buildNcmPostProcessArgs(inputFile: string, params: NcmTaskParams): string[] | undefined {
		const sourceExt = path.extname(inputFile).slice(1).toLowerCase();
		const requestedFormat = params.targetFormat || 'auto';
		const qualityMode = params.qualityMode || 'copy';
		const targetFormat = requestedFormat === 'auto'
			? (qualityMode === 'copy' ? sourceExt : 'mp3')
			: requestedFormat;
		if (qualityMode === 'copy' && (requestedFormat === 'auto' || targetFormat === sourceExt)) {
			return undefined;
		}
		const outputFile = this.getUniqueOutputPath(this.buildNcmCustomOutputPath(inputFile, params, targetFormat), inputFile);
		const args = ['-hide_banner', '-i', inputFile, '-vn', '-map_metadata', '0'];
		const bitrate = qualityMode === 'small' ? '128k' : qualityMode === 'standard' ? '192k' : '320k';
		if (targetFormat === 'flac') {
			args.push('-c:a', 'flac', '-compression_level', qualityMode === 'small' ? '12' : '8');
		} else if (targetFormat === 'wav') {
			args.push('-c:a', 'pcm_s16le');
		} else if (targetFormat === 'aac' || targetFormat === 'm4a') {
			args.push('-c:a', 'aac', '-b:a', bitrate);
		} else if (targetFormat === 'ogg') {
			args.push('-c:a', 'libvorbis', '-b:a', bitrate);
		} else if (targetFormat === 'opus') {
			args.push('-c:a', 'libopus', '-b:a', bitrate, '-vbr', 'on');
		} else if (targetFormat === 'wma') {
			args.push('-c:a', 'wmav2', '-b:a', bitrate);
		} else if (targetFormat === 'ac3') {
			args.push('-c:a', 'ac3', '-b:a', bitrate);
		} else if (targetFormat === 'mp2') {
			args.push('-c:a', 'mp2', '-b:a', bitrate);
		} else {
			args.push('-c:a', 'libmp3lame', '-b:a', bitrate);
		}
		args.push(outputFile, '-y');
		return args;
	}

	private async runNcmPostProcess(id: number, task: ServiceTask, files: string[]): Promise<{ ok: boolean; outputFiles: string[] }> {
		if (!task.ncm) {
			return { ok: true, outputFiles: files };
		}
		const outputFiles: string[] = [];
		for (const file of files) {
			const args = this.buildNcmPostProcessArgs(file, task.ncm);
			if (!args) {
				outputFiles.push(await this.renameNcmOutputIfNeeded(file, task.ncm));
				continue;
			}
			const outputFile = args[args.length - 2];
			this.setCmdText(id, `\nNCM post-process: ${this.ffmpegPath} ${args.join(' ')}\n`);
			task.paraArray = [...task.paraArray, '&&', this.ffmpegPath, ...args];
			const ok = await new Promise<boolean>((resolve) => {
				const ffmpeg = new FFmpeg(this.ffmpegPath, 0, args);
				task.ffmpeg = ffmpeg;
				ffmpeg.on('data', ({ content }) => this.setCmdText(id, content));
				ffmpeg.on('status', (status: FFmpegProgress) => {
					const time = new Date().getTime() / 1000 - task.progressLog.lastStarted + task.progressLog.elapsed;
					for (const parameter of ['time', 'frame', 'size']) {
						const key = parameter as 'time' | 'frame' | 'size';
						task.progressLog[key].push([time, status[key]]);
					}
					this.emit('progressUpdate', { taskId: id, time, status });
				});
				ffmpeg.on('closed', (errorCode, runningResult) => resolve(!errorCode && runningResult !== 'failed'));
			});
			if (!ok) {
				return { ok: false, outputFiles };
			}
			outputFiles.push(outputFile);
		}
		return { ok: true, outputFiles };
	}

	private startNcmTask(id: number, task: ServiceTask): void {
		if (!task.ncm) {
			task.status = TaskStatus.error;
			task.errorInfo.push('NCM task parameters are missing.');
			this.emitTaskUpdate(id, task);
			this.queueAssign();
			return;
		}
		const startedAt = Date.now();
		const args = buildNcmDumpArgs(task.ncm);
		task.paraArray = [this.ncmdumpPath || 'ncmdump', ...args];
		const ncmdump = new NcmDump(this.ncmdumpPath || 'ncmdump', args);
		ncmdump.on('data', ({ content }) => this.setCmdText(id, content));
		ncmdump.on('closed', async (errorCode, runningResult) => {
			if (task.status === TaskStatus.stopping) {
				this.setNotification(id, `任务「${task.taskName}」已中止。`, NotificationLevel.warning);
			} else if (errorCode || runningResult === 'failed') {
				const errorMessages = ncmdump.messages.filter((message) => message.type === 'error').map((message) => message.message).join('\n');
				task.status = TaskStatus.error;
				task.errorInfo.push(errorMessages || `ncmdump exited with code ${errorCode}`);
				this.setNotification(id, `任务「${task.taskName}」NCM 转换失败。${errorMessages}`, NotificationLevel.error);
				webhookManager.triggerTaskEvent('task.error', id, { taskId: id, task: task as any, error: errorMessages });
			} else {
				const outputFiles = await this.findNcmOutputs(task.ncm, startedAt);
				const postProcessResult = await this.runNcmPostProcess(id, task, outputFiles);
				if (!postProcessResult.ok) {
					task.status = TaskStatus.error;
					task.errorInfo.push('NCM post-process failed.');
					this.setNotification(id, `任务「${task.taskName}」NCM 后处理失败。`, NotificationLevel.error);
					webhookManager.triggerTaskEvent('task.error', id, { taskId: id, task: task as any, error: 'NCM post-process failed.' });
				} else {
					const finalOutputFiles = postProcessResult.outputFiles.length ? postProcessResult.outputFiles : await this.findNcmOutputs(task.ncm, startedAt);
					const finalElapsed = Math.max(0.001, new Date().getTime() / 1000 - task.progressLog.lastStarted);
					const finalSize = await this.getTotalFileSizeKb(finalOutputFiles);
					const finalStatus = {
						frame: 0,
						fps: 0,
						q: 0,
						size: finalSize,
						time: finalElapsed,
						bitrate: finalSize > 0 ? finalSize * 8 / finalElapsed : 0,
						speed: 1,
					};
					task.progressLog.time.push([finalElapsed, finalElapsed]);
					task.progressLog.frame.push([finalElapsed, 0]);
					task.progressLog.size.push([finalElapsed, finalSize]);
					this.emit('progressUpdate', {
						taskId: id,
						time: finalElapsed,
						status: finalStatus,
					});
					task.status = TaskStatus.finished;
					task.outputFiles = finalOutputFiles.length ? finalOutputFiles : outputFiles;
					task.progressLog.elapsed = finalElapsed;
					this.setNotification(id, `任务「${task.taskName}」NCM 转换完成`, NotificationLevel.ok);
					webhookManager.triggerTaskEvent('task.completed', id, { taskId: id, task: task as any });
				}
			}
			this.emitTaskUpdate(id, task);
			this.queueAssign();
			this.storeUnfinishedTask();
		});
		task.progressLog.time.push([0, 0]);
		task.progressLog.frame.push([0, 0]);
		task.progressLog.size.push([0, 0]);
		task.ffmpeg = ncmdump;
		this.emitTaskUpdate(id, task);
		webhookManager.triggerTaskEvent('task.started', id, { taskId: id, task: this.tasklist[id] as any });
		if (this.workingStatus === WorkingStatus.idle) {
			this.workingStatus = WorkingStatus.running;
			this.emit('workingStatusUpdate', { value: 'start' });
			webhookManager.triggerGlobalEvent('queue.started', { timestamp: Date.now() });
		}
		this.storeUnfinishedTask();
	}
	public async taskReady(id: number): Promise<void> {
		const task = this.tasklist[id];
		if (!task) {
			log.error(`[任务 ${id}] 准备启动：任务不存在！`);
			return;
		}
		if (!([TaskStatus.idle, TaskStatus.paused].includes(task.status))) {
			log.error(`[任务 ${id}] 准备启动：任务当前状态为 ${task.status}，操作不合法但允许执行！`);
		} else {
			log.info(`[任务 ${id}] 准备启动。`);
		}
		if (task.status === TaskStatus.idle) {
			task.status = TaskStatus.idle_queued;
		} else if (task.status === TaskStatus.paused) {
			task.status = TaskStatus.paused_queued;
		}
		this.emitTaskUpdate(id, task);
	}

	/**
	 * 暂停单个任务
	 * 【running / paused_queued】 => 【paused】
	 * @param id 任务 id
	 * @emits taskUpdate
	 */
	public async taskPause(id: number): Promise<void> {
		const task = this.tasklist[id];
		if (!task) {
			log.error(`[任务 ${id}] 暂停：任务不存在！`);
			return;
		}
		if (!task.ffmpeg) {
			// ffmpeg 已退出，不应调用 pause
			log.error(`[任务 ${id}] 暂停：操作不合法！`);
			return;
		}
		if (!([TaskStatus.running, TaskStatus.paused_queued].includes(task.status))) {
			log.error(`[任务 ${id}] 暂停：任务当前状态为 ${task.status}，操作不合法但允许执行！`);
		} else {
			log.info(`[任务 ${id}] 暂停。`);
		}
		try {
			task.ffmpeg!.pause();
		} catch (error) {
			log.warn(`[任务 ${id}] 暂停进程失败：${error}`);
			this.setNotification(id, `任务「${task.taskName}」暂停失败，进程可能已经结束。`, NotificationLevel.warning);
			this.emitTaskUpdate(id, task);
			return;
		}
		const now = new Date().getTime() / 1000;
		task.status = TaskStatus.paused;
		task.progressLog.lastPaused = now;
		task.progressLog.elapsed += Math.max(0, task.progressLog.lastPaused - task.progressLog.lastStarted);
		this.emitTaskUpdate(id, task);

		webhookManager.triggerTaskEvent('task.paused', id, { taskId: id, task: task as any });

		this.queueAssign();
	}

	/**
	 * 继续执行单个任务
	 * 【paused / paused_queued】 => 【running】
	 * @param id 任务 id
	 * @emits taskUpdate
	 */
	public async taskResume(id: number): Promise<void> {
		const task = this.tasklist[id];
		if (!task) {
			log.error(`[任务 ${id}] 继续：任务不存在！`);
			return;
		}
		if (!([TaskStatus.paused, TaskStatus.paused_queued].includes(task.status))) {
			log.error(`[任务 ${id}] 继续：任务当前状态为 ${task.status}，操作不合法但允许执行！`);
		} else {
			log.info(`[任务 ${id}] 继续。`);
		}
		if (!task.ffmpeg) {
			log.warn(`[任务 ${id}] 继续：任务进程不存在。`);
			this.setNotification(id, `任务「${task.taskName}」继续失败，进程可能已经结束。`, NotificationLevel.warning);
			task.status = TaskStatus.error;
			this.emitTaskUpdate(id, task);
			return;
		}
		if (this.trailLimit_checkIsMediaWorkingTimeExceeded(id, task)) {
			task.status = TaskStatus.paused;
			this.emitTaskUpdate(id, task);
			return;
		}

		const nowRealTime = new Date().getTime() / 1000;
		try {
			task.ffmpeg!.resume();
		} catch (error) {
			log.warn(`[任务 ${id}] 继续进程失败：${error}`);
			this.setNotification(id, `任务「${task.taskName}」继续失败，进程可能已经结束。`, NotificationLevel.warning);
			task.status = TaskStatus.paused;
			this.emitTaskUpdate(id, task);
			return;
		}
		task.status = TaskStatus.running;
		task.progressLog.lastStarted = nowRealTime;
		this.emitTaskUpdate(id, task);

		webhookManager.triggerTaskEvent('task.resumed', id, { taskId: id, task: task as any });

		if (this.workingStatus === WorkingStatus.idle) {
			this.workingStatus = WorkingStatus.running;
			this.emit('workingStatusUpdate', { value: 'start' });
			webhookManager.triggerGlobalEvent('queue.started', { timestamp: Date.now() });
		}
	}

	/**
	 * 重置任务（收尾/强行，根据状态决定）
	 * 【paused / paused_queued / stopping / finished / error】 => 【idle】
	 * @param id 任务 id
	 * @emits taskUpdate
	 */
	public taskReset(id: number): Promise<void> {
		return new Promise((resolve, reject) => {
			const task = this.tasklist[id];
			if (!task) {
				log.error(`[任务 ${id}] 重置：任务不存在！`);
				reject(new Error('任务不存在'));
				return;
			}
			let settled = false;
			const resetToIdle = () => {
				if (settled) return;
				settled = true;
				task.status = TaskStatus.idle;
				task.ffmpeg = null;
				this.emitTaskUpdate(id, task);
				resolve();
				this.queueAssign();
				this.storeUnfinishedTask();
			};
			if ([TaskStatus.paused, TaskStatus.paused_queued, TaskStatus.running].includes(task.status)) {
				// 暂停状态下重置或运行状态下达到限制停止工作
				log.info(`[任务 ${id}] 重置——软停止。`);
				task.status = TaskStatus.stopping;
				if (task.ffmpeg) {
					task.ffmpeg.exit(resetToIdle);
				} else {
					resetToIdle();
				}
			} else if (task.status === TaskStatus.stopping) {
				// 正在停止状态下强制重置
				log.info(`[任务 ${id}] 重置——硬停止。`);
				task.status = TaskStatus.stopping;
				if (task.ffmpeg) {
					task.ffmpeg.forceKill(resetToIdle);
				} else {
					resetToIdle();
				}
			} else if ([TaskStatus.idle_queued, TaskStatus.finished, TaskStatus.error].includes(task.status)) {
				// 完成状态下或队列中仍未开始状态下重置
				log.info(`[任务 ${id}] 重置到初始状态。`);
				task.status = TaskStatus.idle;
				resolve();
				this.queueAssign();
			} else {
				log.error(`[任务 ${id}] 重置：任务当前状态为 ${task.status}，操作不合法！`);
				reject(new Error('操作不合法'));
			}
			this.emitTaskUpdate(id, task);
		});
	}

	private storeUnfinishedTask(): void {
		if (!this.preserveUnfinishedTasks) {
			return;
		}
		const tasks: { taskName: string; after: OutputParams; }[] = [];
		for (const [id, task] of Object.entries(this.tasklist)) {
			// 未开始或者排队的任务不需要存储
			if ([TaskStatus.initializing, TaskStatus.idle, TaskStatus.finished, TaskStatus.error].includes(task.status) || id === '-1') {
				break;
			}
			if (task.kind === 'ncm') {
				continue;
			}
			tasks.push({
				taskName: task.taskName,
				after: task.after,
			});
		}
		clearTimeout((global as any).saveStatusTimer);
		(global as any).saveStatusTimer = setTimeout(() => {
			localConfig.set('lastStatus.tasks', tasks);
			log.info(`任务状态已保存。`, tasks);
		}, 700);
	}

	/**
	 * 分配队列任务，每当任务状态更新时都应调用此函数
	 * 如果当前 workingStatus 为 running，那么挑选处于【空闲_已排队】【已暂停_已排队】的任务进入【正在运行】状态，直到【正在运行】的数量达到最大
	 * 如果安排完成后【正在运行】的任务数量依然为 0，说明所有任务均已处理完毕，workingStatus 进入 idle 状态
	 * @returns 当前正在运行的任务数
	 */
	private queueAssign(dontStop?: boolean): number {
		if (this.workingStatus === WorkingStatus.running) {
			let runningCount = Object.values(this.tasklist).reduce((prev, curr) => curr.status === TaskStatus.running ? prev + 1 : prev, 0);
			const maxThreads = Math.max(1, this.maxThreads);
			for (const [id, task] of Object.entries(this.tasklist)) {
				if (runningCount >= maxThreads || id === '-1') {
					break;
				}
				if (task.status === TaskStatus.idle_queued) {
					this.taskStart(+id);
					runningCount++;
				}
				if (task.status === TaskStatus.paused_queued) {
					this.taskResume(+id);
					// @ts-ignore
					if (task.status === TaskStatus.running) runningCount++;
				}
			}
			if (!dontStop && runningCount === 0) {
				this.workingStatus = WorkingStatus.idle;
				this.emit('workingStatusUpdate', { value: 'stop' });
				webhookManager.triggerGlobalEvent('queue.paused', { timestamp: Date.now() });
			}
			return runningCount;
		}
		return 0;
	}

	/**
	 * 开始处理队列
	 * 首先通过 queueAssign 将【空闲_已排队】【已暂停_已排队】的任务启动，然后将所有【空闲】【已暂停】的任务进入【空闲_已排队】【已暂停_已排队】状态，再次调用 queueAssign 进行任务安排
	 * 也就是优先启动已排队的任务，再将空闲任务加入排队
	 */
	public async queueStart(): Promise<void> {
		this.workingStatus = WorkingStatus.running;
		this.queueAssign(true);
		for (const [id, task] of Object.entries(this.tasklist)) {
			if (id === '-1') {
				continue;
			}
			if (task.status === TaskStatus.idle) {
				task.status = TaskStatus.idle_queued;
			} else if (task.status === TaskStatus.paused) {
				task.status = TaskStatus.paused_queued;
			}
		}
		const runningCount = this.queueAssign();
		if (runningCount) {
			this.emit('workingStatusUpdate', { value: 'start' });
			webhookManager.triggerGlobalEvent('queue.started', { timestamp: Date.now() });
		}
		for (const [id, task] of Object.entries(this.tasklist)) {
			if (id !== '-1' && [TaskStatus.idle_queued, TaskStatus.paused_queued].includes(task.status)) {
				this.emitTaskUpdate(+id, task);
			}
		}
	}

	/**
	 * 暂停处理队列，将所有【正在运行】的任务暂停、【空闲_已排队】的任务重置
	 */
	public async queuePause(): Promise<void> {
		if (this.workingStatus === WorkingStatus.running) {
			this.emit('workingStatusUpdate', { value: 'pause' });
			webhookManager.triggerGlobalEvent('queue.paused', { timestamp: Date.now() });
		}
		this.workingStatus = WorkingStatus.idle;
		for (const [id, task] of Object.entries(this.tasklist)) {
			if (id === '-1') {
				continue;
			}
			if ([TaskStatus.running, TaskStatus.paused_queued].includes(task.status)) {
				await this.taskPause(+id).catch((error) => {
					log.warn(`[任务 ${id}] 队列暂停失败：${error}`);
				});
			} else if (task.status === TaskStatus.idle_queued) {
				await this.taskReset(+id).catch((error) => {
					log.warn(`[任务 ${id}] 队列重置失败：${error}`);
				});
			}
		}
	}

	/**
	 * 删除相应通知
	 * @emits taskUpdate
	 */
	public async deleteNotification(notificationId: number): Promise<void> {
		delete this.notifications[notificationId];
		this.emit('notificationUpdate', { notificationId });
		// 此事件不需要触发 Webhook
	}

	/**
	 * 批量设置任务的输出参数，将算出的 paraArray 通过 taskUpdate 传回（这样对性能不太好）
	 * @emits taskUpdate
	 *
	 */
	public async setParameters(ids: number[], params: OutputParams[]): Promise<void> {
		for (let i = 0; i < ids.length; i++) {
			const id = ids[i];
			const param = params[i];
			const task = this.tasklist[id];
			if (task.kind === 'ncm') {
				continue;
			}
			task.after = replaceOutputParams(param, task.after, true);
			if (task.remoteTask) {
				// 如果修改了输出格式，需要重新计算 outputFile
				task.outputFiles = genTaskOutputFiles(task.after, ``);
				task.paraArray = getFFmpegParaArray({ outputParams: task.after, withQuotes: true, overrideFilePaths: task.outputFiles });
			} else {
				task.outputFiles = genTaskOutputFiles(task.after);
				task.paraArray = this.buildTaskFFmpegArgs(task);
			}
			this.emitTaskUpdate(id, task);
		}
	}

	private cmdUpdateThrottleTimers: Map<number, { start: number, timer: number }> = new Map();
	/**
	 * 收到 cmd 内容通用回调
	 * @param id 任务 id
	 * @param content 文本
	 * @param append 附加到末尾，默认 true
	 */
	private setCmdText(id: number, content: string, append = true): void {
		const task = this.tasklist[id];
		if (!append) {
			task.cmdData = content;
		} else {
			if (content.length) {
				// 若前面没结尾换行符，则先插入一个 \n，再插入内容
				if (task.cmdData.slice(-1) !== '\n' && task.cmdData.length) {
					content = '\n' + content;
				}
				task.cmdData += content;
			} else {
				// 空行
				content = '\n';
				task.cmdData += content;
			}
		}
		if (!append) {
			// 清空事件不走 throttle
			this.emit('cmdUpdate', { taskId: id, content, append });
			clearTimeout(this.cmdUpdateThrottleTimers.get(id)?.timer);
			this.cmdUpdateThrottleTimers.delete(id);
			return;
		}
		const throttleTimer = this.cmdUpdateThrottleTimers.get(id);
		// 第一次直接发送，记录发送后的起点，并添加计时器
		// 后续发送时，计时器未消失，则无需动作，等待计时器结束
		// 计时器结束时，如果有新消息，则发送从起点开始的消息，否则不动作
		if (!throttleTimer) {
			this.emit('cmdUpdate', { taskId: id, content, append });

			const start = task.cmdData.length;
			const timerFunc = () => {
				const newContent = task.cmdData.slice(start);
				if (newContent.length) {
					this.emit('cmdUpdate', {
						taskId: id,
						content: task.cmdData.slice(start),
						append,
					});
				}
				this.cmdUpdateThrottleTimers.delete(id);
			};
			this.cmdUpdateThrottleTimers.set(id, { start, timer: setTimeout(timerFunc, 120) as any })
		}
	}

	/**
	 * 任务通知，emit 事件并存储到任务中
	 * @param taskId
	 * @param content
	 * @param level
	 */
	public setNotification(taskId: number | undefined, content: string, level: NotificationLevel): void {
		const notificationId = this.latestNotificationId++;
		const notification = {
			time: new Date().getTime(),
			taskId,
			content,
			level,
		};
		this.emit('notificationUpdate', {
			notificationId,
			notification,
		});
		webhookManager.triggerGlobalEvent('notification', { notificationId, notification });
		this.notifications[notificationId] = notification;
	}

	private activate(activationCode: string): boolean {
		const fixedCode = 'd324c697ebfc42b7';
		const key = this.machineId + fixedCode;
		const decrypted = CryptoJS.AES.decrypt(activationCode, key);
		const decryptedString = CryptoJS.enc.Utf8.stringify(decrypted);
		if (parseInt(decryptedString).toString() === decryptedString) {
			this.functionLevel = 100;
			return true;
		} else {
			return false;
		}
	}

	private trailLimit_checkIsMediaWorkingTimeExceeded(_id: number, _task: ServiceTask): boolean {
		return false;
	}

	public async trailLimit_stopTranscoding(id: number, reason: 'media' | 'working', byFrontend = false): Promise<void> {
		const task = this.tasklist[id];
		if (task.status === TaskStatus.running) {
			this.setNotification(
				id,
				i11n.service.功能限制_暂停转码(task.taskName, byFrontend, reason),
				NotificationLevel.warning,
			);
			this.taskPause(id);
		} else if ([TaskStatus.paused, TaskStatus.paused_queued].includes(task.status)) {
			this.setNotification(
				id,
				i11n.service.功能限制_不能继续(task.taskName, byFrontend, reason, task.ffmpeg.process.pid),
				NotificationLevel.warning,
			);
		}
	}

	/**
	 * 扫描指定视频流的帧信息
	 * @param id 任务 ID
	 * @param fileIndex 输入文件索引（对应 Task.before[fileIndex]）
	 * @param videoStreamIndex 视频流索引（第 n 个 type 为 video 的 stream）
	 */
	public async getMediaFrameInfo(id: number, fileIndex: number, videoStreamIndex: number): Promise<void> {
		const task = this.tasklist[id];
		if (!task) {
			log.error(`[任务 ${id}] 获取帧信息：任务不存在！`);
			return;
		}
		const inputInfo = task.before[fileIndex];
		if (!inputInfo) {
			log.error(`[任务 ${id}] 获取帧信息：输入文件索引 ${fileIndex} 不存在！`);
			return;
		}
		const videoStreams = inputInfo.streams.filter(s => s.type === 'Video');
		const targetStream = videoStreams[videoStreamIndex];
		if (!targetStream) {
			log.error(`[任务 ${id}] 获取帧信息：视频流索引 ${videoStreamIndex} 不存在！`);
			return;
		}
		const filePath = task.after.input.files?.[fileIndex]?.filePath;
		if (!filePath) {
			log.error(`[任务 ${id}] 获取帧信息：输入文件路径为空！`);
			return;
		}

		// 检查扫描状态
		const scanKey = `${id}_${fileIndex}_${videoStreamIndex}_${filePath}`;
		const existingScan = this.frameScanStatus.get(scanKey);
		if (existingScan) {
			if (existingScan.status === 'completed') {
				return;	// 已完成，直接返回
			}
			if (existingScan.status === 'scanning' && existingScan.promise) {
				return existingScan.promise;	// 正在扫描，等待完成
			}
		}

		const realFilePath = task.remoteTask ? `${os.tmpdir()}/FFBoxUploadCache/${filePath}` : filePath;
		const streamIndex = inputInfo.streams.indexOf(targetStream);	// 该 stream 在原始 streams 数组中的索引（用于 -map）
		log.info(`[任务 ${id}] 开始扫描帧信息：${realFilePath}`);

		// 构造 FFmpeg 命令
		const ffmpeg = new FFmpeg(this.ffmpegPath, 6, [
			'-hide_banner',
			'-nostats',
			'-hwaccel', 'auto',
			'-i', realFilePath,
			'-map', `0:${streamIndex}`,
			'-vf', 'scale=h=160:w=-1:flags=neighbor,showinfo',
			'-f', 'null',
			'-'
		]);

		targetStream.frames = [];
		ffmpeg.on('frameInfo', ({ frames }) => {
			targetStream.frames = frames;
			log.info(`[任务 ${id}] 帧扫描完成，共 ${frames.length} 帧。`);
			this.emitTaskUpdate(id, task);
		});

		// 创建扫描 Promise 并记录状态
		const scanPromise = new Promise<void>((resolve, reject) => {
			ffmpeg.on('closed', (errorCode, runningResult) => {
				if (errorCode || runningResult === 'failed') {
					this.frameScanStatus.delete(scanKey); // 失败时删除状态，允许重试
					log.error(`[任务 ${id}] 帧扫描失败。`);
					this.setNotification(id, `任务「${task.taskName}」帧扫描失败`, NotificationLevel.error);
					reject(errorCode);
				} else {
					this.frameScanStatus.set(scanKey, { status: 'completed' }); // 标记完成
					resolve();
				}
			});
		});

		this.frameScanStatus.set(scanKey, { status: 'scanning', promise: scanPromise });
		return scanPromise;
	}
}
