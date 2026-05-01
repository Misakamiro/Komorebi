// const utils = require('../common/utils.js');
// import from 或者 require 然后 . 引用都行
// const selectString  = utils.selectString;
// const replaceString = utils.replaceString;
// const scanf = utils.scanf;
import { spawn, ChildProcess } from 'child_process';
import EventEmitter from 'events';
import { ChapterInfo, EncoderDetail, InputInfo, StreamInfo, Frame } from '@common/types';
import i11n from '@common/i11n/i11n';
import { spawnInvoker } from '@common/spawnInvoker';
import { selectString, replaceString, scanf, TypedEventEmitter } from '@common/utils';
import { log } from './utils';
import osBridge from './osBridge';

interface FFmpegMessage {
	stage: 'preparingDemuxer' | 'preparingMuxer' | 'transcoding';
	sender?: string;
	message: string;
	translatedMessage?: string;
	type: 'normal' | 'error';
}

interface CodecsResult {
	videoCodecs: {
		name: string;
		description: string;
		encoders: string[];
	}[];
	audioCodecs: {
		name: string;
		description: string;
		encoders: string[];
	}[];
};
interface FormatsResult {
	muxers: {
		name: string;
		description: string;
	}[];
	demuxers: {
		name: string;
		description: string;
		isDevice: boolean;
	}[];
}

interface FilterResult {
	name: string;
	inputType: string;
	outputType: string;
	description: string;
}

type EncoderOption = EncoderDetail['options'][number];

interface FFmpegInvokerEvent {
	data: (arg: { content: string }) => void;
	status: (arg: { frame: number; fps: number; q: number; size: number; time: number; bitrate: number; speed: number }) => void;
	version: (arg: { content?: string }) => void;
	metadata: (arg: { content: InputInfo[] }) => void;
	codecs: (codecsResult?: CodecsResult, detail?: EncoderDetail) => void;
	formats: (formatsResult?: FormatsResult, detail?: EncoderDetail) => void;
	filters: (filtersResult?: FilterResult[], detail?: EncoderDetail) => void;
	frameInfo: (arg: { frames: Frame[] }) => void;
	closed: (errorCode: number, runningResult: 'success' | 'failed' | undefined) => void;
	warning: (arg: { content: string }) => void;
}

const parseNumber = (value?: string) => {
	if (!value || value === 'N/A') {
		return NaN;
	}
	const parsed = Number.parseFloat(value);
	return Number.isFinite(parsed) ? parsed : NaN;
};

const parseProgressTime = (value?: string) => {
	if (!value || value === 'N/A') {
		return NaN;
	}
	const match = value.match(/^(\d+):(\d+):(\d+(?:\.\d+)?)$/);
	if (!match) {
		return NaN;
	}
	return Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]);
};

const parseProgressSize = (value?: string) => {
	if (!value || value === 'N/A') {
		return NaN;
	}
	const match = value.match(/(-?\d+(?:\.\d+)?)\s*([KMGT]?i?B|[kKmMgGtT]?B)?/);
	if (!match) {
		return NaN;
	}
	const size = Number.parseFloat(match[1]);
	const unit = (match[2] || 'kB').toLowerCase();
	const factor = unit === 'b' ? 1 / 1000
		: unit === 'kb' || unit === 'kib' ? 1
			: unit === 'mb' || unit === 'mib' ? 1024
				: unit === 'gb' || unit === 'gib' ? 1024 ** 2
					: unit === 'tb' || unit === 'tib' ? 1024 ** 3
						: 1;
	return Number.isFinite(size) ? size * factor : NaN;
};

const parseProgressBitrate = (value?: string) => {
	if (!value || value === 'N/A') {
		return NaN;
	}
	const match = value.match(/(-?\d+(?:\.\d+)?)\s*([kKmMgG]?bits\/s)?/);
	if (!match) {
		return NaN;
	}
	const bitrate = Number.parseFloat(match[1]);
	const unit = (match[2] || 'kbits/s').toLowerCase();
	const factor = unit.startsWith('mbits') ? 1000 : unit.startsWith('gbits') ? 1000 ** 2 : 1;
	return Number.isFinite(bitrate) ? bitrate * factor : NaN;
};

const parseProgressStatus = (line: string) => {
	const fields: Record<string, string> = {};
	for (const match of line.matchAll(/([A-Za-z]+)=\s*(\S+)/g)) {
		fields[match[1]] = match[2];
	}
	return {
		frame: parseNumber(fields.frame),
		fps: parseNumber(fields.fps),
		q: parseNumber(fields.q),
		size: parseProgressSize(fields.size || fields.Lsize),
		time: parseProgressTime(fields.time),
		bitrate: parseProgressBitrate(fields.bitrate),
		speed: parseNumber(fields.speed?.replace(/x$/, '')),
	};
};

export class FFmpeg extends (EventEmitter as new () => TypedEventEmitter<FFmpegInvokerEvent>) {
	public process: ChildProcess | null = null;
	private mode: 'direct' | 'version' | 'metadata' | 'getCodecs' | 'getFormats' | 'getFilters' | 'getFrameInfo';
	private runningResult: 'success' | 'failed' | undefined;	// 受状态机识别的错误都应设定此值。如果未设值而退出，则为异常退出
	private paused: boolean = false;
	private sm: any = 0; // 状态机状态码，详见下方说明
	private requireStop = false; // 如果请求提前停止，那就不触发 finished 事件
	public messages: FFmpegMessage[] = [];
	private encoderDetail: EncoderDetail = { options: [] };	// 同时被 codecs 和 filters 使用
	private codecsResult: CodecsResult = { videoCodecs: [], audioCodecs: [] };
	private formatsResult: FormatsResult = { muxers: [], demuxers: [] };
	private filtersResult: FilterResult[] = [];
	private framesResult: Frame[] = [];
	private readingAVOption: EncoderOption;
	private readingInputsInfoBuffer: string[] = [];
	private inputsInfo: InputInfo[] = [];

	private stdoutBuffer: string = '';

	/**
	 * @param mode 0: 直接执行 ffmpeg　1: 检测 ffmpeg 版本　２：多媒体文件信息读取
	 */
	constructor(path = 'ffmpeg', mode: 0 | 1 | 2 | 3 | 4 | 5 | 6 = 0, params?: Array<string>) {
		super();
		this.mode = ['direct', 'version', 'metadata', 'getCodecs', 'getFormats', 'getFilters', 'getFrameInfo'][mode] as any;

		log.dev('启动 ffmpeg', (params || []).join(', '));
		spawnInvoker(path, params, {
			detached: false,
			// shell: mode == 1 ? true : false,	// 使用命令行以获得“'ffmpeg' 不是内部或外部命令，也不是可运行的程序”这样的提示
			shell: false,
			// encoding: 'utf8',
		})
			.then((_process) => {
				log.dev(`ffmpeg 进程启动，pid：${_process.pid}`);
				this.process = _process;
				this.mountSpawnEvents();
			})
			.catch((reason) => {
				log.error(`ffmpeg 启动失败：${reason}`);
				if (mode === 1) {
					this.emit('version', {});
				}
			});
	}
	mountSpawnEvents(): void {
		this.process!.stdout!.on('data', (data) => {
			this.stdoutProcessing(data);
		});
		this.process!.stderr!.on('data', (data) => {
			this.stdoutProcessing(data);
		});
		this.process!.on('close', (code, signal) => {
			setTimeout(() => {
				this.emit('closed', code, this.runningResult);
				if (this.mode === 'getCodecs') {
					this.emit('codecs', this.codecsResult, this.encoderDetail);
				} else if (this.mode === 'getFormats') {
					this.emit('formats', this.formatsResult, this.encoderDetail);
				} else if (this.mode === 'getFilters') {
					this.emit('filters', this.filtersResult, this.encoderDetail);
				} else if (this.mode === 'getFrameInfo') {
					this.emit('frameInfo', { frames: this.framesResult });
				}
			}, 10);
		});
	}
	stdoutProcessing(data: string): void {
		this.stdoutBuffer += data.toString();
		this.dataProcessing();
	}
	/**
	 * FFmpeg 传回的数据处理总成
	 */
	dataProcessing(): void {
		// 按逗号分割字符串，但忽略括号中的逗号
		function splitIgnoringParentheses(text: string) {
			const result = [];
			let current = '';
			let depth = 0;
			for (const char of text) {
				if (char === '(') depth++;
				if (char === ')') depth--;
				if (char === ',' && depth === 0) {
					result.push(current.trim());
					current = '';
				} else {
					current += char;
				}
			}
			if (current.trim()) result.push(current.trim());
			return result;
		}

		// 暂存所有 InputInfo 相关的行到 readingInputsInfoBuffer，放到这个函数里处理
		const parseInputInfo = () => {
			const inputInfoLine = this.readingInputsInfoBuffer[0];
			if (!inputInfoLine) {
				return;
			}
			const match = inputInfoLine.match(/Input #(\d+), ([\w,]+), from '(.+)':/);
			if (match) {
				// this.readingInputIndex = +match[1];
				const readingInputInfo: InputInfo = {
					demuxer: match[2],
					path: match[3],
					metadata: {},
					streams: [],
					chapters: [],
				}
				for (let i = 1; i < this.readingInputsInfoBuffer.length; i++) {
					const thisLine = this.readingInputsInfoBuffer[i];
					if (thisLine.includes('Duration:')) {
						const f = scanf(thisLine, 'Duration: %d:%d:%d, start: %d, bitrate: %d kb/s');
						readingInputInfo.duration = f[0] * 3600 + f[1] * 60 + f[2];
						readingInputInfo.start = f[3];
						readingInputInfo.bitrate = f[4];
					} else if (thisLine.startsWith('  Metadata:')) {
						let thisLine;
						i++;
						while ((thisLine = this.readingInputsInfoBuffer[i] || '').startsWith('    ')) {
							const match = thisLine.match(/([\w_]+) *: (.+)?/);	// value 有可能为空
							if (match) {
								readingInputInfo.metadata[match[1]] = match[2] || '';
							}
							i++;
						}
						i--;
					} else if (thisLine.includes('Stream #')) {
						const readingStreamInfo: StreamInfo = {
							type: undefined,
							metadata: {},
							sidedata: [],
						}
						const parts = thisLine.split(': ');
						const [basicInfo, type, detail] = parts;
						const basicMatch = basicInfo.match(/Stream #(\d+:\d+).*\((\w+)\)$/);
						if (basicMatch) {
							readingStreamInfo.language = basicMatch[2];
						}
						readingStreamInfo.type = type;
						const detailItems = splitIgnoringParentheses(detail || '');
						const bitrateItem = detailItems.find((item) => item.includes('kb/s'));
						readingStreamInfo.codec = detailItems[0]?.match(/\w+/)?.[0];
						if (type === 'Video') {
							readingStreamInfo.pixelFormat = detailItems[1]?.match(/\w+/)?.[0];
							readingStreamInfo.resolution = detailItems.find((item) => /\d+x\d+/.test(item))?.match(/\d+x\d+/)?.[0];
							const bitrate = +(bitrateItem?.match(/(\d+) kb\/s/)?.[1] || NaN);
							const fps = +(detailItems.find((item) => item.includes('fps'))?.match(/(\d+(\.)?\d*) fps/)?.[1] || NaN);
							readingStreamInfo.bitrate = Number.isFinite(bitrate) ? bitrate : undefined;
							readingStreamInfo.fps = Number.isFinite(fps) ? fps : undefined;
						} else if (type === 'Audio') {
							const sampleRate = +(detailItems.find((item) => item.includes('Hz'))?.match(/\d+/)?.[0] || NaN);
							readingStreamInfo.sampleRate = Number.isFinite(sampleRate) ? sampleRate : undefined;
							readingStreamInfo.channel = detailItems[2];
							readingStreamInfo.bitrate = +(bitrateItem?.match(/\d+/)?.[0] || 0) || undefined;
						} else if (type === 'Data') {
							readingStreamInfo.codec = detailItems[0];
							readingStreamInfo.bitrate = +(bitrateItem?.match(/\d+/)?.[0] || 0) || undefined;
						} else {
							readingStreamInfo.bitrate = +(bitrateItem?.match(/\d+/)?.[0] || 0) || undefined;
						}
						readingStreamInfo.isDefault = detailItems.some((item) => item.includes('default'));
						readingStreamInfo.infoText = thisLine;
						// 理论上上面这些需要做一下错误处理，比如说 debugger，或者直接跳过这行
						while (true) {
							const nextLine = this.readingInputsInfoBuffer[i + 1];
							if (nextLine && (nextLine.includes('Metadata:') || nextLine.includes('Side data:'))) {
								let thisLine;
								i += 2;
								while ((thisLine = this.readingInputsInfoBuffer[i] || '').startsWith('      ')) {
									const match = thisLine.match(/([\w_]+) *: (.+)/);
									if (nextLine.includes('Metadata:') && match) {
										readingStreamInfo.metadata[match[1]] = match[2];
									} else {
										readingStreamInfo.sidedata.push(thisLine.trim());
									}
									i++;
								}
								i--;
							} else {
								break;
							}
						}
						readingInputInfo.streams.push(readingStreamInfo);
					} else if (thisLine.includes('Chapters')) {
						i++;
						let thisLine;
						while ((thisLine = (this.readingInputsInfoBuffer[i] || '')).includes('Chapter #')) {
							const readingChapterInfo: ChapterInfo = {
								start: NaN,
								end: NaN,
								metadata: {},
							}
							const parts = thisLine.split(': ');
							const [basicInfo, detail] = parts;
							const detailItems = splitIgnoringParentheses(detail || '');
							readingChapterInfo.start = +(detailItems[0]?.match(/\d+(\.\d+)?/)?.[0] || NaN);
							readingChapterInfo.end = +(detailItems[1]?.match(/\d+(\.\d+)?/)?.[0] || NaN);
							readingChapterInfo.infoText = thisLine;
							const nextLine = this.readingInputsInfoBuffer[i + 1];
							if (nextLine && (nextLine.includes('Metadata:'))) {
								let thisLine;
								i += 2;
								while ((thisLine = this.readingInputsInfoBuffer[i] || '').startsWith('      ')) {
									const match = thisLine.match(/([\w_]+) *: (.+)/);
									if (nextLine.includes('Metadata:') && match) {
										readingChapterInfo.metadata[match[1]] = match[2];
									}
									i++;
								}
								i--;
							}
							readingInputInfo.chapters.push(readingChapterInfo);
							i++;
						}
						i--;
					} else {
						parseOtherMessage(thisLine, 'preparingDemuxer');	// 读取 Input 时遇到不认识的字符串
					}
				}
				this.inputsInfo.push(readingInputInfo);
			} else {
				debugger;	// 不应出现
			}
			this.readingInputsInfoBuffer.splice(0, Number.MAX_SAFE_INTEGER);
		}

		// 解析其他信息（主要是错误信息）
		const parseOtherMessage = (thisLine: string, stage: FFmpegMessage["stage"] = 'transcoding') => {
			const match = thisLine.match(/\[(.+) @ .+?\] (.+)/);
			let _, sender, message;
			if (match) {
				[_, sender, message] = match;
			} else {
				message = thisLine;
			}

			const beforeMessagesLength = this.messages.length;
			if (false) {
			} else if (message.includes('OpenEncodeSessionEx failed: out of memory (10)')) {
				this.messages.push({ stage, sender, message, translatedMessage: i11n.ffmpeg.内存或显存不足, type: 'error' });
			} else if (message.includes('No NVENC capable devices found')) {
				this.messages.push({ stage, sender, message, translatedMessage: i11n.ffmpeg.无硬件解码设备_nvenc, type: 'error' });
			} else if (message.includes('Failed setup for format cuda: hwaccel initialisation returned error')) {
				this.messages.push({ stage, sender, message, translatedMessage: i11n.ffmpeg.硬件解码错误回退软件_nvenc, type: 'normal' });
				this.emit('warning', { content: i11n.ffmpeg.硬件解码错误回退软件_nvenc });
			} else if (message.includes('Unrecognized hwaccel')) {
				// 例：[vist#0:0/hevc @ 00000251f4c68e00] Unrecognized hwaccel: asa.
				this.messages.push({ stage, sender, message, translatedMessage: i11n.ffmpeg.硬件编码器不存在, type: 'error' });
			} else if (message.includes('DLL amfrt64.dll failed to open')) {
				this.messages.push({ stage, sender, message, translatedMessage: i11n.ffmpeg.硬件编码器初始化失败_amd, type: 'error' });
			} else if (message.includes('CreateComponent(AMFVideoEncoderVCE_AVC) failed')) {
				this.messages.push({ stage, sender, message, translatedMessage: i11n.ffmpeg.硬件编码器初始化失败_amd, type: 'error' });
			} else if (message.includes('codec not currently supported in container')) {
				// 例：[mp4 @ 000001d2146edf00] Could not find tag for codec ansi in stream #0, codec not currently supported in container
				const codecName = selectString(message, 'for codec ', ' in stream', 0).text;
				this.messages.push({ stage, sender, message, translatedMessage: i11n.ffmpeg.复用器不支持某编码(codecName), type: 'error' });
			} else if (message.includes('unknown codec')) {
				// 例：[mov,mp4,m4a,3gp,3g2,mj2 @ 000002613bc8c540] Could not find codec parameters for stream 0 (Video: none (HEVC / 0x43564548), none, 2560x1440, 24211 kb/s): unknown codec
				this.messages.push({ stage, sender, message, translatedMessage: i11n.ffmpeg.编码无法识别, type: 'error' });
			} else if (message.includes('Starting second pass: moving the moov atom to the beginning of the file')) {
				this.messages.push({ stage, sender, message, translatedMessage: i11n.ffmpeg.移动文件信息到文件头, type: 'normal' });
				// this.emit('pending', { content: '正在移动文件信息到文件头' });
			} else if (thisLine.includes('No such file or directory')) {
				this.messages.push({ stage: 'preparingDemuxer', sender, message: thisLine, translatedMessage: i11n.ffmpeg.文件不存在, type: 'error' });
				this.runningResult = 'failed';
			} else if (thisLine.includes('Conversion failed')) {	// 错误终止并结束
				this.runningResult = 'failed';
			} else if (thisLine.includes('Error while opening encoder for output stream')) {	// 例：Error initializing output stream 0:0 -- Error while opening encoder for output stream #0:0 - maybe incorrect parameters such as bit_rate, rate, width or height
				this.messages.push({ stage: 'preparingDemuxer', sender, message: thisLine, translatedMessage: i11n.ffmpeg.编码器输出参数设置有误, type: 'error' });
				this.runningResult = 'failed';
			} else if (thisLine.includes('Invalid data found when processing input')) {
				this.messages.push({ stage: 'preparingDemuxer', sender, message: thisLine, translatedMessage: i11n.ffmpeg.输入文件无法识别, type: 'error' });
				this.runningResult = 'failed';
			} else if (thisLine.includes('Permission denied')) {	// critical：Permission denied
				this.messages.push({ stage, sender, message: thisLine, translatedMessage: i11n.ffmpeg.权限不足, type: 'error' });
				this.runningResult = 'failed';
			} else if (thisLine.includes('No space left on device')) {	// 多种部件发来的 No space left on device
				this.messages.push({ stage, sender, message: thisLine, translatedMessage: i11n.ffmpeg.外存已满, type: 'error' });
				this.runningResult = 'failed';
			} else if (thisLine.includes('FFmpeg cannot edit existing files in-place')) {
				// Output I:/Users/ttqf/Desktop/主序列.mp4 same as Input #0 - exiting
				// FFmpeg cannot edit existing files in-place.
				this.messages.push({ stage, sender, message: thisLine, translatedMessage: i11n.ffmpeg.无法原地编辑, type: 'error' });
				this.runningResult = 'failed';
			} else if (match && sender.startsWith('Parsed_showinfo_') && message.startsWith('n:')) {
				// 解析 showinfo 输出
				const nMatch = message.match(/n: *(\d+)/);
				const ptsMatch = message.match(/pts: *(\d+)/);
				const ptsTimeMatch = message.match(/pts_time: *(\d+\.?\d*)/);
				const typeMatch = message.match(/type: *([IPB])/);
				const meanMatch = message.match(/mean: *\[([^\]]+)\]/);
				const stdevMatch = message.match(/stdev: *\[([^\]]+)\]/);

				if (nMatch && ptsMatch && ptsTimeMatch && typeMatch && meanMatch && stdevMatch) {
					const frame: Frame = {
						n: parseInt(nMatch[1]),
						pts: parseInt(ptsMatch[1]),
						pts_time: parseFloat(ptsTimeMatch[1]),
						type: typeMatch[1] as 'I' | 'P' | 'B',
						mean: meanMatch[1].split(' ').map(Number),
						stdev: stdevMatch[1].split(' ').map(Number),
					};
					this.framesResult.push(frame);
					if (frame.n % 2000 === 0 && frame.n > 0) {
						log.dev(`帧扫描进度：${frame.n}`);
					}
				}
			}

			if (match && this.messages.length === beforeMessagesLength) {
				this.messages.push({ stage, sender, message: thisLine, type: 'normal' });
			}
		}

		const newLinePos = this.stdoutBuffer.indexOf('\n') >= 0 ? this.stdoutBuffer.indexOf('\n') : this.stdoutBuffer.indexOf(`\r`);
		if (newLinePos < 0) {
			// 一行没接收完
			return;
		}
		const thisLine = this.stdoutBuffer[newLinePos - 1] === '\r' ? this.stdoutBuffer.slice(0, newLinePos - 1) : this.stdoutBuffer.slice(0, newLinePos);
		this.stdoutBuffer = this.stdoutBuffer.slice(newLinePos + 1);

		/**
		 * ffmpeg 日志流程：
		 * 1. 解码。ffmpeg 会读取文件以找到合适的解码器（不受扩展名影响）。
		 *    此过程中可能产生这样的信息：[mov,mp4,m4a,3gp,3g2,mj2 @ 000002764239aa80] st: 0 edit list: moov atom not found
		 *    也有可能产生错误，如：[in#0 @ 0000014c6d6ba700] Error opening input: Invalid data found when processing input
		 *    如果文件不存在，会触发：[in#0 @ 00000185b1c1ba80] Error opening input: Invalid argument
		 *      旧版 ffmpeg 是：文件: Invalid argument
		 *    硬件解码器错误会是这样：[vist#0:0/h264 @ 0000020e9ceb76c0] Unrecognized hwaccel: 111.
		 *      旧版 ffmpeg 不会有前面中括号的内容
		 *    如果产生错误，会分别触发 Error opening input file 文件路径. 和 Error opening input files: Invalid data found when processing input
		 *      旧版 ffmpeg 直接输出一行：文件: Invalid data found when processing input，不区分它究竟是 in#0 还是 file 还是 files
		 *    如果没有错误，会进入到输入文件 metadata 环节
		 * 2. 输出每个输入文件的 metadata（metadata 环节有可能会没有，比如某些音频编码）。
		 *    Input #0, 解复用器, from '路径':
		 *      Metadata:
		 *        key             : value
		 *      Duration: 00:00:00.00, start: 0.000000, bitrate: 0 kb/s
		 *      Stream #0:0[0x1](eng): Video: hevc (Main) (hvc1 / 0x31637668), yuv420p(tv, bt709), 3840x2160 [SAR 1:1 DAR 16:9], 49708 kb/s, 30.19 fps, 30 tbr, 90k tbn (default)
		 *          Metadata:（只有 7.1 版本会多空两格，新版旧版都无此问题）
         *            key             : value
		 *      Stream #0:0: Audio: flac, 48000 Hz, stereo, (可能会有 fltp, )s16
		 * 3. 复用器准备。如果没有错误，此处应该没有消息。如果有错误，可能会是如下输出：
		 *    Could not write header for output file #0 (incorrect codec parameters ?): Invalid data found when processing input
		 *    旧版：Error initializing output stream 0:1 -- 
		 *    新版：Conversion failed!
		 * 3. Stream mapping。这一部跟复用器准备似乎是并行的，因为新旧 ffmpeg 的行为并不相同。但如果复用器出错，在 Stream mapping 或者复用器准备后就会退出。
		 *    如果没有指定输出文件，会返回 At least one output file must be specified。
		 *    如果已指定，则返回 Stream mapping: 后面每行显示 map 信息
		 *    然后显示一行 Press [q] to stop, [?] for help
		 * 4. 编码器准备。部分编码器会在此时进行 log。比如：x265 [info]: HEVC encoder version 3.5+115-3cf6c1e53
		 * 5. 输出每个输出文件的 metadata。此部分略过
		 * 6. 编码。
		 *      对于视频：frame=    0 fps=0.0 q=0.0 size=       0KiB time=N/A bitrate=N/A speed=N/A  
		 *      对于音频：size=    4471kB time=00:04:46.07 bitrate= 128.0kbits/s speed=  90x  
		 * 7. 编码完成。
		 *    复用器报告数据（6.1.1 及更新会显示复用器，旧版则直接是 video: 开头），如 [out#0/mp4 @ 0x133e08af0] video:179058KiB audio:5700KiB subtitle:0KiB other streams:0KiB global headers:2KiB muxing overhead: 0.088721%
		 *    编码器报告数据，如 x265 [info]: Weighted P-Frames: Y:15.9% UV:12.7%
		 *    如果是视频或者图片，会在上面编码那里再输出一条，但是 size 变成 Lsize。顺序不定（新旧版 ffmpeg 行为不同）
		 * 8. 如果有视频并且涉及到重新编码，会返回：encoded 4406 frames in 3029.31s (1.45 fps), 9976.67 kb/s, Avg QP:28.08
		 */
		switch (this.sm) {
			case 0:
				if (false) {
				} else if (thisLine.includes('frame=') || thisLine.includes('size=')) {	// status
					this.emit('status', parseProgressStatus(thisLine));
				} else if (thisLine.includes('Input #')) {	// metadata：获得媒体信息
					this.readingInputsInfoBuffer.push(thisLine);
					this.sm = 'inputInfoPrinting';	// 暂存当前行，转入 inputInfoPrinting，等待下一个 Input 或 StreamMapping 到达之后将所有暂存用于输入信息识别
				} else if (thisLine.includes('video:')) {	// finish
					setTimeout(() => {
						// 存储空间已满时、产生错误但仍编码到末尾时也会产生 finished，但这算是编码失败
						if (!this.requireStop && !this.messages.find((message) => message.type === 'error') && this.runningResult !== 'failed') {
							this.runningResult = 'success';
						}
					}, 100);
				} else if (thisLine.includes(`'ffmpeg'`)) {	// version（Windows）：'ffmpeg' 不是内部或外部命令，也不是可运行的程序
					this.emit('version', {});
				} else if (thisLine.includes('not found')) {	// version（Linux）：/bin/sh: 1: ffmpeg: not found
					this.emit('version', {});
				} else if (thisLine.includes('ffmpeg version')) {	// version：找到 ffmpeg，并读出版本，需要放在读取文件信息后，也要放在“Conversion”后。注意有时候 version 后会附带网址，所以以空格作为结束
					if (this.mode === 'version') {
						this.emit('version', { content: selectString(thisLine, 'version ', ' ', 0).text });
						this.runningResult = 'success';
					}
				} else if (thisLine.startsWith(' -------')) {	// ffmpeg -codecs 情况下，其下面就是列表
					this.sm = 'codecs';
				} else if (thisLine.startsWith(' ---')) {	// ffmpeg -formats 情况下，其下面就是列表（旧版本不支持显示硬件解复用器，这时候就是“--”，暂时不支持列入）
					this.sm = 'formats';
				} else if (thisLine.startsWith('  | = Source or sink filter')) {	// ffmpeg -filters 情况下，其下面就是列表
					this.sm = 'filters';
				} else if (thisLine.startsWith('    General capabilities:')) {	// 列举 encoder 功能
					this.encoderDetail.generalCapabilities = thisLine.slice(thisLine.indexOf('General capabilities:') + 22).trimEnd().split(' ');
				} else if (thisLine.startsWith('    Threading capabilities:')) {	// 列举 encoder 功能
					this.encoderDetail.threadingCapabilities = thisLine.slice(thisLine.indexOf('Threading capabilities:') + 24);
				} else if (thisLine.startsWith('    Supported pixel formats:')) {	// 列举 encoder 功能
					this.encoderDetail.supportedPixelFormats = thisLine.slice(thisLine.indexOf('Supported pixel formats:') + 25).split(' ');
				} else if (thisLine.startsWith('    Supported sample rates:')) {	// 列举 encoder 功能
					this.encoderDetail.supportedSampleRates = thisLine.slice(thisLine.indexOf('Supported sample rates:') + 24).split(' ').map(Number);
				} else if (thisLine.startsWith('    Supported sample formats:')) {	// 列举 encoder 功能
					this.encoderDetail.supportedSampleFormats = thisLine.slice(thisLine.indexOf('Supported sample formats:') + 26).split(' ');
				} else if (thisLine.startsWith('    Supported channel layouts:')) {	// 列举 encoder 功能
					this.encoderDetail.supportedChannelLayouts = thisLine.slice(thisLine.indexOf('Supported channel layouts:') + 27).split(' ');
				} else if (thisLine.startsWith('    Common extensions:')) {	// 列举 muxer 功能
					this.encoderDetail.commonExtensions = thisLine.slice(thisLine.indexOf('Common extensions:') + 19, -1).split(',');
				} else if (thisLine.startsWith('    Mine type:')) {	// 列举 muxer 功能
					this.encoderDetail.mineType = thisLine.slice(thisLine.indexOf('Mine type:') + 11, -1);
				} else if (thisLine.startsWith('    Default video codec:')) {	// 列举 muxer 功能
					this.encoderDetail.defaultVideoCodec = thisLine.slice(thisLine.indexOf('Default video codec:') + 21, -1);
				} else if (thisLine.startsWith('    Default audio codec:')) {	// 列举 muxer 功能
					this.encoderDetail.defaultAudioCodec = thisLine.slice(thisLine.indexOf('Default audio codec:') + 21, -1);
				} else if (thisLine.includes(' AVOptions')) {
					this.sm = 'avOptions';
				} else {
					parseOtherMessage(thisLine, 'transcoding');
				}
				break;
			case 'inputInfoPrinting':
				// 只要当前还在输出 Input 信息，那就不断暂存当前行，直到遇到下一个 Input 或 streamMapping 时开始解析
				if (thisLine.startsWith('  ')) {
					this.readingInputsInfoBuffer.push(thisLine);
				} else if (thisLine.startsWith('Input #')) {
					parseInputInfo();
					this.readingInputsInfoBuffer = [thisLine];
				} else if (
					thisLine.includes('Stream mapping:') ||
					thisLine.includes('At least one output file must be specified') ||
					thisLine.startsWith('Output #') ||
					thisLine.includes('Output file #')
				) {
					parseInputInfo();
					// if (this.input.vcodec == undefined && this.input.abitrate) {
					// 	this.input.abitrate = this.input.bitrate;
					// }
					// if (this.input.acodec == undefined && this.input.vbitrate) {
					// 	this.input.vbitrate = this.input.bitrate;
					// }
					// this.emit('metadata', { content: this.input });
					this.emit('metadata', { content: this.inputsInfo });
					this.sm = 0;
				}
				break;
			case 'codecs':
				if (thisLine.startsWith(' ')) {
					const basicInfoRegx = thisLine.match(/([\.D])([\.E])([VAS])([\.I])([\.L])([\.S]) (\w+) +(.+)/);
					if (!basicInfoRegx) {
						break;
					}
					// 0：全文　1. Decoding Supported　2. Encoding Supported　3. V/A/S　4. Intra frame-only codec　5. Lossy compression　6. Lossless compression　7. 编码名称　8. 描述及编码
					if (basicInfoRegx[2] !== 'E' || !['V', 'A'].includes(basicInfoRegx[3])) {
						break;
					}
					const encodersRegx = thisLine.match(/\(encoders: ([\w| |-]+)\)/);
					let encoders: string[] = [];
					if (encodersRegx) {
						encoders = encodersRegx[1].split(' ').filter((item) => item);	// 在旧版 ffmpeg 上会多出来一项空白的
					}
					const encodersStringPos = basicInfoRegx[8].indexOf(' (encoders') > 0 ? basicInfoRegx[8].indexOf(' (encoders') : Number.MAX_SAFE_INTEGER;
					const decodersStringPos = basicInfoRegx[8].indexOf(' (decoders') > 0 ? basicInfoRegx[8].indexOf(' (decoders') : Number.MAX_SAFE_INTEGER;
					const description = basicInfoRegx[8].slice(0, Math.min(encodersStringPos, decodersStringPos));
					if (basicInfoRegx[3] === 'V') {
						this.codecsResult.videoCodecs.push({ name: basicInfoRegx[7], description, encoders });
					} else if (basicInfoRegx[3] === 'A') {
						this.codecsResult.audioCodecs.push({ name: basicInfoRegx[7], description, encoders });
					}
				}
				break;
			case 'formats':
				if (thisLine.startsWith(' ')) {
					const basicInfoRegx = thisLine.match(/([ D])([ E])([ d]) ([\w,_]+) +(.+)/);
					if (!basicInfoRegx) {
						break;
					}
					// 0：全文　1. Demuxing Supported　2. Muxing Supported　3. Is a device　4. 格式名称　5. 描述
					if (basicInfoRegx[2] === 'E') {
						this.formatsResult.muxers.push({ name: basicInfoRegx[4], description: basicInfoRegx[5] });
					}
					if (basicInfoRegx[1] === 'D') {
						this.formatsResult.demuxers.push({ name: basicInfoRegx[4], description: basicInfoRegx[5], isDevice: basicInfoRegx[3] === 'd' });
					}
				}
				break;
			case 'filters':
				if (thisLine.startsWith(' ')) {
					const basicInfoRegx = thisLine.match(/([\.T])([\.S])([\.C]?) (\w+) +(\w{1,3})->(\w{1,3}) +(.+)/);
					// C = Command support，这个字段从 ffmpeg 8.0 开始出现
					if (!basicInfoRegx) {
						break;
					}
					// 0：全文　1. Timeline support　2. Slice threading　3. Command support　4. 滤镜名称　5. 输入类型　6. 输出类型　7. 描述
					this.filtersResult.push({
						name: basicInfoRegx[4],
						inputType: basicInfoRegx[5],
						outputType: basicInfoRegx[6],
						description: basicInfoRegx[7],
					});
				}
				break;
			case 'avOptions':
				if (thisLine.startsWith('     ')) {
					// 上一个参数
					const option = this.readingAVOption;
					const flagsRegx = thisLine.match(/([\w|+|-|\.]+) +([\w|\.]+) ?(.+)?/);
					const intRegx = thisLine.match(/([\w|+|-|\.]+) +([-+]?\d+) +([\w|\.]+) ?(.+)?/);
					if (!option.options) {
						option.options = [];
					}
					const value = option.type === 'flags' ? flagsRegx[1] : +intRegx?.[2];
					const name = option.type === 'int' ? intRegx[1] : undefined;
					const description = option.type === 'flags' ? flagsRegx[3] : intRegx?.[4];
					if (option.type === 'flags' && !isNaN(+option.default) && option.default == this.readingAVOption.options.length) {
						// flags 的 default 有几种表达形式：string（不用处理，default 直接就是这个 value）、string+string+…（不用处理）、int（如 h264_vulkan 的 usage）（表示选项的序号，需要把序号转换为字符串）
						this.readingAVOption.default = value;
					}
					if (option.type === 'int' && isNaN(+option.default) && option.default == intRegx?.[1]) {
						// int 则是把字符串转换为数字
						this.readingAVOption.default = +intRegx?.[2];
					}
					this.readingAVOption.options.push({
						value, name, description
					});
				} else if (thisLine.startsWith('  ')) {
					// 新的参数
					//   -preset            <int>        E..V....... (from 1 to 7) (default medium)
						//      veryfast        7            E..V.......
					//    duration          <int>        ..F.A...... How to determine the end-of-stream. (from 0 to 2) (default longest)
						//      longest         0            ..F.A...... Duration of longest input.
					const basicInfoRegx = thisLine.match(/-?([\w-]+) +(\[?<.+> *\]?) *([\w\.]+) ?(.+)?/);
					// 0：全文　1. 参数名称　2. 参数类型　3. 不知道是啥　4. 描述（含取值范围）
					const minmaxRegx = thisLine.match(/\(from ([\w+-\.]+) to ([\w+-\.]+)\)/);
					const defaultRegx = thisLine.match(/\(default "?([\w+-\.]+)\)"?/);
					const parseValue = (value: string) => {
						const direct = [-2147483648, 2147483647, Number.MIN_VALUE, Number.MAX_VALUE, false, true, NaN][['INT_MIN', 'INT_MAX', 'FLT_MIN', 'FLT_MAX', 'false', 'true', 'NaN'].indexOf(value)];
						if (direct !== undefined) {
							return direct;
						} else if (!isNaN(+value)) {
							return +value;
						} else if (value !== undefined) {
							return value;
						}
					}
					const min = minmaxRegx ? parseValue(minmaxRegx[1]) : undefined as any;
					const max = minmaxRegx ? parseValue(minmaxRegx[2]) : undefined as any;
					const defaultValue = defaultRegx ? parseValue(defaultRegx[1]) : undefined;
					const option: EncoderOption = {
						name: basicInfoRegx[1],
						type: basicInfoRegx[2].includes('[') ? basicInfoRegx[2].match(/[\w_]+/)[0] + '[]' : basicInfoRegx[2].match(/[\w+]+/)[0] as any,
						description: basicInfoRegx[4],
						min,
						max,
						default: defaultValue,
					};
					this.readingAVOption = option;	// flags 或者部分 int 情况下有多行（偶尔 boolean 也会有“auto”这种多行的情况）
					this.encoderDetail.options.push(option);
				}
				break;
			}

		this.emit('data', { content: thisLine });	// 状态机运行过后再 emit，因为状态机内部可能会递归调用 dataProcessing()
		setTimeout(() => {
			// 约等于 while (true)，但加个延迟用于 doEvents
			this.dataProcessing();
		}, 0);
	}
	kill(callback: () => void): void {
		let done = false;
		const finish = () => {
			if (done) return;
			done = true;
			callback();
		};
		const currentProcess = this.process;
		if (!currentProcess) {
			finish();
			return;
		}
		this.once('closed', finish);
		try {
			currentProcess.kill();
		} catch (error) {
			log.warn(`ffmpeg kill failed: ${error}`);
			finish();
		}
	}
	forceKill(callback: () => void): void {
		let done = false;
		const finish = () => {
			if (done) return;
			done = true;
			callback();
		};
		const currentProcess = this.process;
		if (!currentProcess) {
			finish();
			return;
		}
		this.requireStop = true;
		this.once('closed', finish);
		const pid = currentProcess.pid;
		if (!pid) {
			finish();
			return;
		}
		switch (process.platform) {
			case 'win32':
				try {
					spawn('taskkill', ['/F', '/PID', pid + ''], {
						detached: false,
						shell: false,
					});
				} catch (error) {
					log.warn(`ffmpeg force kill failed: ${error}`);
					finish();
				}
				break;
			case 'linux':
			case 'darwin':
				try {
					spawn('kill', ['-KILL', pid + ''], {
						detached: false,
						shell: false,
					});
				} catch (error) {
					log.warn(`ffmpeg force kill failed: ${error}`);
					finish();
				}
				break;
			default:
		}
	}
	exit(callback: () => void): void {
		let done = false;
		const finish = () => {
			if (done) return;
			done = true;
			callback();
		};
		const currentProcess = this.process;
		if (!currentProcess) {
			finish();
			return;
		}
		if (this.paused) {
			try {
				this.resume();
			} catch (error) {
				log.warn(`ffmpeg resume before exit failed: ${error}`);
			}
		}
		this.requireStop = true;
		this.once('closed', finish);
		try {
			if (currentProcess.stdin?.writable) {
				currentProcess.stdin.write('q');
			} else {
				currentProcess.kill();
			}
		} catch (error) {
			log.warn(`ffmpeg soft exit failed: ${error}`);
			try {
				currentProcess.kill();
			} catch {
				finish();
			}
		}
	}
	pause(): void {
		if (!this.process || this.paused) {
			return;
		}
		const pid = this.process.pid;
		if (!pid) {
			throw new Error('ffmpeg process pid missing');
		}
		switch (process.platform) {
			case 'win32':
				osBridge.pauseNresumeProcess(true, pid).catch((error) => {
					log.warn(`ffmpeg pause failed for pid ${pid}: ${error}`);
				});
				break;
			case 'linux':
			case 'darwin':
				try {
					spawn('kill', ['-STOP', pid + ''], {
						detached: false,
						shell: false,
					});
				} catch (error) {
					log.warn(`ffmpeg pause failed for pid ${pid}: ${error}`);
					throw error;
				}
				break;
			default:
		}
		this.paused = true;
	}
	resume(): void {
		if (!this.process) {
			return;
		}
		const pid = this.process.pid;
		if (!pid) {
			throw new Error('ffmpeg process pid missing');
		}
		switch (process.platform) {
			case 'win32':
				osBridge.pauseNresumeProcess(false, pid).catch((error) => {
					log.warn(`ffmpeg resume failed for pid ${pid}: ${error}`);
				});
				break;
			case 'linux':
			case 'darwin':
				try {
					spawn('kill', ['-CONT', pid + ''], {
						detached: false,
						shell: false,
					});
				} catch (error) {
					log.warn(`ffmpeg resume failed for pid ${pid}: ${error}`);
					throw error;
				}
				break;
			default:
		}
		this.paused = false;
	}
	sendKey(key: string): void {
		if (!this.process) {
			return;
		}
		this.process.stdin!.write(key);
	}
	sendSig(str: number): void {
		if (!this.process) {
			return;
		}
		this.process.kill(str);
	}
}
