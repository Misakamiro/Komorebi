/* eslint-disable no-fallthrough */
import { OutputParams, ServiceTask, Task, TaskStatus } from '@common/types';
import { UITask } from '@renderer/types';
import { deleteNode } from './params/filter';

// #region 格式转换区

/**
 * 传入秒数，返回 --:--:--.--
 */
export function formatTimeToFFmpegStyle(second: number): string {
	if (!isNaN(second) && second !== -1) {
		const Hour = Math.floor(second / 3600);
		const Minute = Math.floor((second - Hour * 3600) / 60);
		const Second = second - Hour * 3600 - Minute * 60;
		return ('0' + Hour).slice(-2) + ':' + ('0' + Minute).slice(-2) + ':' + ('0' + Second.toFixed(2)).slice(-5);
	} else {
		return '时长未知';
	}
}

/**
 * 传入 ffmpeg 支持的时间格式（如 --:--:--.-- 或 ---.--），返回秒数（如格式错误则返回 -1）
 */
export function parseTimeString(timeString: string): number {
	if (timeString === 'N/A') {
		return -1;
	}
	let exp: RegExpExecArray;
	if (exp = /^(\d+):([0-5]?[0-9]):([0-5]?[0-9])(.\d+)?$/.exec(timeString)) {
		// (时):(分):(秒)(.小)
		const hour = Number(exp[1]);
		const minute = Number(exp[2]);
		const second = Number(exp[3]);
		const mili = Number(exp[4] ?? '0');
		if (minute >= 60 || second >= 60) {
			return -1;
		}
		return hour * 3600 + minute * 60 + second + Number(mili);
	} else if (exp = /^([0-5]?[0-9]):([0-5]?[0-9])(.\d+)?$/.exec(timeString)) {
		// (分):(秒)(.小)
		const minute = Number(exp[1]);
		const second = Number(exp[2]);
		const mili = Number(exp[3] ?? '0');
		if (minute >= 60 || second >= 60) {
			return -1;
		}
		return minute * 60 + second + Number(mili);
	} else if (/^(\d+)(.\d+)?$/.test(timeString)) {
		// (秒)(.小)
		return Number(timeString);
	}
	return -1;
}

/**
 * 将字节大小转换为人类可读数字
 */
export function formatSize(B: number, useIEC?: boolean) {
	if (useIEC) {
		if (B >= 10 * 1024 ** 3) {
			return (B / 1024 ** 3).toFixed(1) + ' GiB';
		} else if (B >= 1024 ** 3) {
			return (B / 1024 ** 3).toFixed(2) + ' GiB';
		} else if (B >= 100 * 1024 ** 2) {
			return (B / 1024 ** 2).toFixed(0) + ' MiB';
		} else if (B >= 10 * 1024 ** 2) {
			return (B / 1024 ** 2).toFixed(1) + ' MiB';
		} else {
			return (B / 1024 ** 2).toFixed(2) + ' MiB';
		}
	} else {
		if (B >= 10 * 1000 ** 3) {
			return (B / 1000 ** 3).toFixed(1) + ' GB';
		} else if (B >= 1000 ** 3) {
			return (B / 1000 ** 3).toFixed(2) + ' GB';
		} else if (B >= 100 * 1000 ** 2) {
			return (B / 1000 ** 2).toFixed(0) + ' MB';
		} else if (B >= 10 * 1000 ** 2) {
			return (B / 1000 ** 2).toFixed(1) + ' MB';
		} else {
			return (B / 1000 ** 2).toFixed(2) + ' MB';
		}
	}
}

// #endregion

// #region 字符串转换区

/**
 * 传入头尾字符串，抽取字符串中间的部分，并返回字符串和抽取后的位置
 * @param {string} text  输入字符串
 * @param {string} pre   要识别的前缀
 * @param {string} post  要识别的后缀
 * @param {number} begin 识别开始的位置
 * @param {boolean} includePostLength   返回的识别结束后的位置是否包含后缀长度
 * @returns {text: string, pos: number} 抽取的部分和抽取后的位置
 */
export function selectString(text: string, pre: string, post = '', begin = 0, includePostLength = false) {
	let outText;
	let outPos = -1;
	const prePos = text.indexOf(pre, begin);
	if (prePos !== -1) {
		let postPos;
		if (post === '') {
			postPos = text.length;
		} else {
			postPos = text.indexOf(post, prePos + pre.length);
		}
		if (postPos !== -1) {
			outText = text.slice(prePos + pre.length, postPos);
			outPos = postPos;
			if (includePostLength) {
				outPos += post.length;
			}
		}
	}
	return { text: outText, pos: outPos };
}

/**
 * 带初始位置和结束位置的 replace
 * @param {string} text  输入字符串
 * @param {string} searchValue  要搜索的部分
 * @param {string} replaceValue 搜索到的内容替换为此部分
 * @param {number} start 识别开始的位置
 * @param {number} end   识别结束的位置
 * @returns {string} 替换后的字符串
 */
export function replaceString(text: string, searchValue: string, replaceValue: string, start: number, end: number): string {
	const front = text.slice(0, start);
	let mid = text.slice(start, end);
	while (mid.indexOf(searchValue) != -1) {
		mid = mid.replace(searchValue, replaceValue);
	}
	const rear = text.slice(end);
	return front + mid + rear;
}

/**
 * 仿 scanf 的功能，结果以数组形式返回
 * 注意其与 C 语言的 scanf 表现有所不同：%d %f 被视为同一类型；可自定义分隔符作为字符串的结束，空格和换行在格式和输入数字的前方忽略；格式中不支持转义符
 * @param {string} input  输入字符串
 * @param {string} format 格式
 * @param {string} splitter 用于作为 %s 结束标记的分隔符
 */
export function scanf(input: string, format: string, splitter = ' '): Array<any> {
	let i = 0, j = 0;
	let c = '', f = '';		// c：正在匹配的输入字符		f：正在匹配的格式字符
	let status = 0;			// 0：正常逐位匹配		1：正在匹配字符串		2：正在匹配数字		4：匹配结束
	let str = '';			// 字符串或数字匹配过程中的字符串
	const returnList: Array<any> = [];
	while (status != 4) {
		switch (status) {
			case 0:			// 正常逐位匹配
				f = format[j++];
				switch (f) {
					case '%':		// 读到 %，再读取一次已确定进入何种状态
						f = format[j++];
						switch (f) {
							case 's':		// 进入字符串匹配
								status = 1;
								break;
							case 'd': case 'f':	// 进入数字匹配
								status = 2;
								break;
							case 'c':		// 字符匹配，直接再读取一次
								c = input[i++];
								if (c != undefined) {
									returnList.push(c.charCodeAt(0));
								} else {
									status = 4;
								}
								break;
							default:		// 格式错误或为空
								status = 4;
								break;
						}
						break;
					case ' ':		// 忽略空格
						break;
					case undefined:	// 为空
						status = 4;
						break;
					default:		// 逐位匹配
						while (true) {		// 清除输入前置空白符
							c = input[i++];
							if (c != ' ' && c != '\n') { break }
						}
						if (f != c) {
							status = 4;
						}
						break;
				}
				break;
			case 1:			// 字符串匹配
				while (true) {	// 清除输入前置空白符
					c = input[i++];
					if (c != ' ' && c != '\n') {
						i--;
						break;
					}
				}
				while (status == 1) {
					c = input[i++];
					switch (c) {
						case splitter:
							returnList.push(str);
							str = '';
							status = 0;
							i--;
							break;
						case undefined:
							status = 4;
							break;
						default:
							str += c;
							break;
					}
				}
			case 2:			// 数字匹配
				while (true) {	// 清除前置空白符
					c = input[i++];
					if (c != ' ' && c != '\n') {
						i--;
						break;
					}
				}
				while (status == 2) {
					c = input[i++];
					switch (c) {
						case '0': case '1': case '2': case '3': case '4': case '5': case '6': case '7': case '8': case '9': case '.':
							str += c;
							break;
						case '-':		// 如果负号在开头
							if (str == '') {
								str += c;
								break;
							}
						case 'N':		// NaN | N/A
							str += c + input[i] + input[i + 1]
							if (str == 'NaN' || str == 'N/A') {
								returnList.push(NaN);
								str = "";
								status = 0;
								i++;
								i++;
							}
							break;
						default:		// 否则当作非数字处理，input 回退一位
							if (str == '') {
								status = 4;
								break;
							} else {
								if (str.includes('.')) {
									returnList.push(parseFloat(str));
								} else {
									returnList.push(parseInt(str));
								}
								str = "";
								status = 0;
								i--;
							}
							break;
					}
				}
			default:
				break;
		}
	}
	return returnList;
}

/**
 * 获取随机字符串
 */
export function randomString(length = 6, dictionary = 'abcdefghijklmnopqrstuvwxyz'): string {
	let result = '';
	for (let i = length; i > 0; --i) result += dictionary[Math.floor(Math.random() * dictionary.length)];
	return result;
}

// #endregion

// #region 任务转换区

export function getInitialTask(fileName: string, outputParams?: OutputParams): Task {
	const task: Task = {
		taskName: fileName,
		before: [],
		after: {
			input: {
				files: [],
			},
			filter: {
				nodes: [],
				lines: [],
			},
			outputs: [
				{
					video: {
						vcodec: '自动',
						detail: {}
					},
					audio: {
						acodec: '',
						detail: {}
					},
					mux: {
						format: '',
						moveflags: false,
						filePath: '',
						detail: {},
					},
				}
			],
			extra: {},
		},
		paraArray: [],
		status: TaskStatus.idle,
		progressLog: {
			time: [],
			frame: [],
			size: [],
			lastStarted: new Date().getTime() / 1000,
			elapsed: 0,
			lastPaused: new Date().getTime() / 1000,	// 用于暂停后恢复时计算速度
		},
		cmdData: '',
		errorInfo: [],
		// notifications: [],
		outputFiles: [],
	}
	if (outputParams) {
		Object.assign(task, { after: outputParams });
	}
	return task;
}

export function getInitialServiceTask(fileName: string, outputParams?: OutputParams): ServiceTask {
	const task: ServiceTask = {
		...getInitialTask(fileName, outputParams),
		...{
			ffmpeg: null,
			remoteTask: false,
		},
	};
	return task;
}

export function getInitialUITask(fileName: string, outputParams?: OutputParams): UITask {
	const task: UITask = {
		...getInitialTask(fileName, outputParams),
		...{
			dashboard: {
				progress: 0,
				bitrate: 0,
				speed: 0,
				time: 0,
				frame: 0,
				size: 0,
			},
			dashboard_smooth: {
				progress: 0,
				bitrate: 0,
				speed: 0,
				time: 0,
				frame: 0,
				size: 0,
			},
			dashboardTimer: NaN,
		},
	};
	return task;
}

export function getOutputDuration(task: Task): number {
	let duration = task.before[0]?.duration || NaN;
	if (isNaN(duration)) {
		return NaN;
	}
	const firstInput = task.after.input.files[0];
	const firstOutput = task.after.outputs[0].mux;
	if (!firstInput || !firstOutput) {
		return NaN;
	}
	if (firstInput.begin || firstInput.end) {
		const begin = firstInput.begin ? parseTimeString(firstInput.begin) : 0;
		let end = firstInput.end ? parseTimeString(firstInput.end) : duration;
		if (begin === -1 || end === -1 || begin > end || begin > duration) {
			return NaN;
		}
		end = Math.min(end, duration);
		duration = end - begin;
	}
	if (firstOutput.begin || firstOutput.end) {
		const begin = firstOutput.begin ? parseTimeString(firstOutput.begin) : 0;
		let end = firstOutput.end ? parseTimeString(firstOutput.end) : duration;
		if (begin === -1 || end === -1 || begin > end || begin > duration) {
			return NaN;
		}
		end = Math.min(end, duration);
		duration = end - begin;
	}
	return duration;
}

export function getDefaultInputVideo(task: Task) {
	return task.before[0]?.streams?.find((stream) => stream.type === 'Video' && stream.isDefault);
}
export function getDefaultInputAudio(task: Task) {
	return task.before[0]?.streams?.find((stream) => stream.type === 'Audio' && stream.isDefault);
}

/**
 * 根据任务配置返回新文件时间（仅计算，不进行文件操作）
 */
export function getOutputFileTime(task: Task, index: number) {
	let ok = true;	// 仅代表计算是否成功，不代表是否已修改时间
	const output = task.after.outputs[index];
	const mux = output.mux;
	let { accessTime, createTime, modifyTime, duration: originalDuration } = task.before[0] || { accessTime: 0, createTime: 0, modifyTime: 0, duration: 0 };

	if (mux.keepFileTime === 'original') {
	} else {
		const startTime1 = parseTimeString(task.after.input.files[0].begin);
		const startTime2 = parseTimeString(mux.begin);
		const startTime = ((startTime1 === -1 ? 0 : startTime1) + (startTime2 === -1 ? 0 : startTime2)) * 1000;
		const duration = (getOutputDuration(task) || 0) * 1000; // 假设 getOutputDuration 可接收 index
		if (mux.keepFileTime === 'autoShift') {
			// 复制修正后的文件时间（依创建时间）。输出文件的创建时间、修改时间将以创建时间为基准，按照剪裁位置自动调整后进行修改
			const newCreateTime = createTime + startTime;
			const newModifyTime = createTime + startTime + duration;
			[createTime, modifyTime] = [newCreateTime, newModifyTime];
		} else if (mux.keepFileTime === 'fixCTbyMTandShift' && originalDuration > 0) {
			// 复制修正后的文件时间（依修改时间）。输出文件的创建时间、修改时间将以修改时间为基准，按照剪裁位置自动调整后进行修改，用于修复拷贝后创建时间丢失的问题
			const newCreateTime = modifyTime - originalDuration * 1000 + startTime;
			const newModifyTime = modifyTime - originalDuration * 1000 + startTime + duration;
			[createTime, modifyTime] = [newCreateTime, newModifyTime];
		} else if (mux.keepFileTime === 'fixByFilenameAndShift') {
			const originalFilePath = task.after.input.files[0]?.filePath;
			// 根据文件名修正新文件时间。用于修复文件时间丢失的问题，将通过文件名作为创建时间，根据剪裁位置自动调整后进行修改
			const regExp1 = /(\d\d\d\d).?([01]\d).?([0123]\d).?([012]\d).?([0-5]\d).?([0-5]\d)?/;
			const regExp2 = /(\d\d\d\d) ?年? ?([01]?\d) ?月? ?([0123]?\d) ?日? ?([012]?\d) ?时? ?([0-5]?\d) ?分? ?([0-5]?\d)? ?秒? ?/;
			const r = originalFilePath.match(regExp1) || originalFilePath.match(regExp2);
			if (r) {
				const oldCreateTime = new Date(`${r[1]}-${r[2]}-${r[3]} ${r[4]}:${r[5]}:${r[6] || 0}`);
				if (!isNaN(oldCreateTime.getTime())) {
					const newCreateTime = oldCreateTime.getTime() + startTime;
					const newModifyTime = oldCreateTime.getTime() + startTime + duration;
					[createTime, modifyTime] = [newCreateTime, newModifyTime];
				} else {
					ok = false;
				}
			} else {
				ok = false;
			}
		} else {
			ok = false;
		}
	}
	return { accessTime, createTime, modifyTime, ok };
}

/**
 * 来自 FFBoxService 的任务信息自网络接收后与现存的 UITask 进行合并
 */
export function mergeTaskFromService(self: UITask, remote: Task): UITask {
    const ret = self;
    Object.assign(ret, JSON.parse(JSON.stringify(remote)));
    return ret;
}

/**
 * 在不影响原有任务特有参数（如文件列表）的情况下替换 OutputParams，用于取代 JSON.parse(JSON.stringify())
 * replaceOutputParams 在 3 个地方被使用：
 * 1. service 的 setParameter，用于前端修改参数通知后端修改，需要【完全覆盖】
 * 2. applySelectedTask 前端点击任务后，用任务参数【完全覆盖】全局参数
 * 3. applyParameters 前端修改全局任务参数后将参数应用到每一个任务上：
 *   3.1 点击“应用参数到全部任务”按钮时，【部分覆盖】所有已选任务
 *   3.2 XXXView 在修改任务参数时，如果单选，则【完全覆盖】；如果多选，则【部分覆盖】
 *   3.3 loadPreset 时，【部分覆盖】
 * 【部分覆盖】的意义：参数中不仅带有转码详情，还带有输入文件的路径。其中输入文件有时候只希望更改每个文件的配置，而不是把路径和数量都改了。
 * 【部分覆盖】：原参数（to）的 input.files 的每个项中的 begin, end, hwaccel, realtime, custom 都使用参数（from）同序号的项覆盖，而 filePath 保持不动（如果两组参数 input.files 不一样，超过的直接 break）。原参数（to）的 outputs 直接使用新字段的项覆盖。原参数（to）的 filter 使用新字段的项覆盖，但是检查 nodes 和 lines：nodes 中存在“输入”节点，其 node.name 规则为 in_\d。如果原参数并没有这么多输入，就删掉多余的 node；lines 记录了 node 之间的链接，如果删掉了 node，那么某些 line 的 line.prevNodeId 在 nodes 中就没有了。这种 line 也删掉。
 * @param from 新的参数列表
 * @param to 任务原有的参数列表
 * 以下函数由 ChatGPT 4o 生成
 */
export function replaceOutputParams(from: OutputParams, to: OutputParams, fullyReplace: boolean): OutputParams {
	if (fullyReplace) {
		// 全量替换，直接用 from 深拷贝
		return JSON.parse(JSON.stringify(from));
	}

	// 部分替换：保留 to 的整体结构，仅替换部分内容
	const ret: OutputParams = JSON.parse(JSON.stringify(to));

	// input.files 部分字段替换：仅替换 begin, end, hwaccel, realtime, custom，不改 filePath
	for (let i = 0; i < Math.min(to.input.files.length, from.input.files.length); i++) {
		const fromFile = from.input.files[i];
		const toFile = ret.input.files[i];
		toFile.begin = fromFile.begin;
		toFile.end = fromFile.end;
		toFile.hwaccel = fromFile.hwaccel;
		toFile.realtime = fromFile.realtime;
		toFile.custom = fromFile.custom;
	}

	// outputs 整个替换
	ret.outputs = JSON.parse(JSON.stringify(from.outputs));

	// filter 替换，并处理 nodes/lines 清理逻辑
	ret.filter = JSON.parse(JSON.stringify(from.filter));
	// 将超出 to 文件数量的输入节点去掉
	const inputNodeCount = ret.input.files.length;
	for (let i = ret.filter.nodes.length - 1; i >= 0; i--) {
		const node = ret.filter.nodes[i];
		const match = node.name?.match(/^in_(\d+)$/);
		if (!match) {
			continue;	// 保留非输入节点
		}
		if (+match[1] >= inputNodeCount) {
			// 删除这个输入节点
			deleteNode(ret.filter.nodes, ret.filter.lines, node);
		}
	}

	// extra 部分完整覆盖
	ret.extra = JSON.parse(JSON.stringify(from.extra));

	return ret;
}


// #endregion

// #region 实用功能

/**
 * 拷贝自 https://www.npmjs.com/package/typed-emitter
 */
export type Arguments<T> = [T] extends [(...args: infer U) => any]
	? U
	: [T] extends [void] ? [] : [T];

export interface TypedEventEmitter<Events> {
	addListener<E extends keyof Events>(event: E, listener: Events[E]): this
	on<E extends keyof Events>(event: E, listener: Events[E]): this
	once<E extends keyof Events>(event: E, listener: Events[E]): this
	prependListener<E extends keyof Events>(event: E, listener: Events[E]): this
	prependOnceListener<E extends keyof Events>(event: E, listener: Events[E]): this

	off<E extends keyof Events>(event: E, listener: Events[E]): this
	removeAllListeners<E extends keyof Events>(event?: E): this
	removeListener<E extends keyof Events>(event: E, listener: Events[E]): this

	emit<E extends keyof Events>(event: E, ...args: Arguments<Events[E]>): boolean
	eventNames(): (keyof Events | string | symbol)[]
	// eslint-disable-next-line @typescript-eslint/ban-types
	rawListeners<E extends keyof Events>(event: E): Function[];
	// eslint-disable-next-line @typescript-eslint/ban-types
	listeners<E extends keyof Events>(event: E): Function[];
	listenerCount<E extends keyof Events>(event: E): number;

	getMaxListeners(): number;
	setMaxListeners(maxListeners: number): this;
}

export function getTimeString(date: Date, showMs = true): string {
	return `${date.getFullYear()}-${(date.getMonth() + 1 + '').padStart(2, '0')}-${(date.getDate() + '').padStart(2, '0')} ${(date.getHours() + '').padStart(2, '0')}:${(date.getMinutes() + '').padStart(2, '0')}:${(date.getSeconds() + '').padStart(2, '0')}${showMs ? '.' + (date.getMilliseconds() + '').padStart(3, '0') : ''}`;
}

export function logMsg(...content: any[]): void {
	console.log(`\x1b[32m${getTimeString(new Date())}\x1b[0m`, ...content);
}
logMsg.error = function (...content: any[]) {
	console.error(`\x1b[31m${getTimeString(new Date())}\x1b[0m`, ...content);
}

/**
 * 获取当前运行环境
 * 注：若 nodeIntegration 关闭，则渲染进程会获得“browser”
 */
export function getEnv(): 'browser' | 'node' | 'electron-renderer' | 'electron-main' {
	if (typeof process !== 'undefined') {
		if (process.env.IS_ELECTRON) {
			if (typeof window !== 'undefined') {
				return 'electron-renderer';
			} else {
				return 'electron-main';
			}
		} else {
			return 'node';
		}
	} else {
		return 'browser';
	}
}

/**
 * 解析当前程序的命令行参数（GNU 风格）
 * @param argName 需要获取的参数名，如“-h”、“--help”
 * @returns 若该参数的下一个值存在，且不以“-”或“--”开头，则返回该参数值，否则返回 true。若参数不存在，返回 undefined
 */
export function getSingleArgvValue(argName: string, ignoreCase = false) {
	const args = process.argv;
	const argNameIndex = args.findIndex(arg => ignoreCase ? argName.toLowerCase() === arg.toLowerCase() : argName === arg);
	if (argNameIndex >= 0 && argNameIndex < args.length) {
		const nextValue = args[argNameIndex + 1];
		if (nextValue === undefined || nextValue.startsWith('-') || nextValue.startsWith('--')) {
			return true;
		}
		return nextValue;
	}
	return undefined;
}

// #endregion
