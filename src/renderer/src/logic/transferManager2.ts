import EventEmitter from 'events';
import { reactive } from 'vue';
import CryptoJS from 'crypto-js';
import { Server, UploadChunk, UploadFile } from '@renderer/types';
import nodeBridge from '@renderer/bridges/nodeBridge';
import HashWorker from './transferHashWorker2?worker';
import { useAppStore } from '../stores/appStore';

const globalTaskPool: { [key: string]: Set<SingleTaskScheduler> } = {};	// 当前所有正在运行的任务的实例（某一实例无论有多少个同时执行，实例都只出现一次。比如说有 3 个 readTask，这 3 个 readTask 各自的执行数加起来不超过总并发量）
const globalTaskWorkingCount: { [key: string]: number } = {};

export class SingleTaskScheduler extends EventEmitter {
	public concurrency: number;
	public taskName?: string;	// 指定 taskName 后，任务的 concurrency 计算将不仅限于单个 SingleTaskScheduler 实例，而是在全局共享同名的 concurrency
	public task: (singleTaskscheduler: this) => Promise<any>;
	public globalPool: Set<SingleTaskScheduler>;	// 外界可以通过此值查询是否有任务在运行
	private _workingCount: number;
	private _working: boolean;
	private _count: number;		// 运行计数，第一次从 0 开始

	constructor(params: { concurrency: number, taskName: string, task: (singleTaskscheduler: SingleTaskScheduler) => Promise<any> }) {
		super();
		Object.assign(this, params);
		this._workingCount = 0;
		this._working = false;
		this._count = 0;
		if (params.taskName) {
			// 指定了 taskName 的话统一在此处检查修复存在性，后面就不需要判断了
			if (!globalTaskPool[this.taskName]) globalTaskPool[this.taskName] = new Set();
			if (!globalTaskWorkingCount[this.taskName]) globalTaskWorkingCount[this.taskName] = 0;
			this.globalPool = globalTaskPool[this.taskName];
		}
	}

	get workingCount() { return this._workingCount }
	get working() { return this._working }
	get count() { return this._count }
	get globalWorkingCount() { return globalTaskWorkingCount[this.taskName] }

	public start() {
		this._working = true;
		if (this.taskName) this.globalPool.add(this);
		this.queueTask();
	}
	public stop() {
		this._working = false;
		if (this.taskName) this.globalPool.delete(this);
	}

	private queueTask() {
		// 每次单个任务完成后，调用此函数
		if (this.taskName) {
			/**
			 * 有任务名的情况下，工作数按全局算。
			 * 循环从池中随机选择一个任务执行 doTask，直到达到最大工作数
			 * 当任务需要停止时，会从池中删除。当池中没有任何实例时，这一系列的任务就全部停止了
			 */
			if (!this.globalPool.size) {
				return;
			}
			for (; this.globalWorkingCount < this.concurrency; globalTaskWorkingCount[this.taskName]++) {
				const list = [...this.globalPool];
				const randomIndex = Math.floor(Math.random() * list.length);
				const selectedInstance = list[randomIndex];
				selectedInstance.doTask();
			}
		} else {
			/**
			 * 无任务名的情况下，只按自己的工作数算
			 * 循环 doTask，直到达到最大工作数
			 * 当任务需要停止时，设置 this._working = false，这里就不会再分配任务
			 */
			if (!this.working) {
				return;
			}
			for (; this._workingCount < this.concurrency;) {
				this.doTask();
			}
		}
	}

	public async doTask() {
		this._workingCount++;	// 只需管理自己的 _workingCount 即可。全局的 workingCount 由 queueTask 管理
		setTimeout(() => {				
			this.task(this).then(async () => {
				this._workingCount--;
				// await new Promise((r) => setTimeout(r, 100));
				if (this.taskName) globalTaskWorkingCount[this.taskName]--;

				if (!this.working && !this.workingCount) {
					this.emit('allDone');	// 已停止工作，且没有其他任务，即为全部完成
				}
				this.queueTask();
			}).catch(() => {
				// 任务失败即不再继续后续任务，剩余所有任务均执行 workingCount-- 后，最后一个完成的检查到 workingCount === 0 即停止
				this._working = false;
				this._workingCount--;
				if (this.taskName) {
					globalTaskWorkingCount[this.taskName]--;
					this.globalPool.delete(this);
				}

				if (!this._workingCount) {
					this.emit('allDone');	// 已停止工作，且没有其他任务，即为全部完成
				}
				this.queueTask();
			});

			this._count++;	// 任务开始后计数 +1（一定会在 finally 前进行）
		}, 0);
	}
}

const hashWorkers: Worker[] = [];	// 所有任务共用
const hashWorkerRunningList: boolean[] = [];
const memLimit = 100 * 1000 * 1000;	// 已读取未哈希的数据量达到此值时转锁等待哈希；大小小于该值的文件读取完毕后无需清除

/**
 * 添加一个上传任务。文件大小读出后将立刻返回
 * 完成上传后此函数将自动调用 mergeUploaded，需要传入在上传前生成的占位符 inputName
 */
export async function addUploadTask(server: Server, input: string | File, taskId: number, fileBaseName: string, inputName: string) {
	let fileSize = 0;
	let accessTime = 0, createTime = 0, modifyTime = 0;
	if (typeof input === 'string') {
		const stats = await nodeBridge.getLocalFileStats(input);
		if (stats) {
			fileSize = stats.size;
			accessTime = stats.atime.getTime();
			createTime = stats.birthtime.getTime();
			modifyTime = stats.mtime.getTime();
		}
	} else {
		fileSize = input.size;
		modifyTime = input.lastModified;
	}
	if (fileSize === 0) {
		throw new Error('无法获取文件大小，上传失败');
	}
	const file: UploadFile = reactive({
		taskId,
		fileBaseName,
		chunks: [],
		url: typeof input === 'string' ? input : undefined,
		blob: typeof input === 'string' ? undefined : input,
		size: fileSize,
		status: 'waiting',
	});

	const segment = fileSize < 1 * 1000 * 1000 * 1000 ? 4 * 1000 * 1000 : 20 * 1000 * 1000;	// 小文件使用小分段，便于控制续传；大文件使用大分段，提高性能。但不能用太大的分段，否则在校验阶段会 OOM
	// 基础信息收集完成，返回 file，剩余校验和上传工作在 timeout 后进行
	setTimeout(async () => {
		const appStore = useAppStore();
		server.entity.setUploadStatus(taskId, true);

		// 对每个分片进行文件读取，若读取错误则直接退出
		file.status = 'reading';
		const readDoneChunkIndexes: number[] = [];	// 供下一轮 hash 进行消费
		let readDone = 'false';
		let memUsed = 0;	// 也可通过遍历列表获得。但存起来就减少开销
		const ts1 = new SingleTaskScheduler({
			concurrency: 1,
			taskName: 'readFile',
			task: async (sts) => {
				// 利用 sts.count 可以方便地通过运行次序知道自己应该读取哪一块，但这个值要在函数开始时马上存下来，否则会变
				// TODO 添加分块秒传校验逻辑
				const taskIndex = sts.count;
				const offset = taskIndex * segment;
				const chunkSize = Math.min(segment, fileSize - offset);
				if (chunkSize <= 0) {
					throw '读取任务即将结束';
				}
				if (memUsed >= memLimit) {
					await new Promise((resolve) => setTimeout(resolve, 150));	// 等待哈希转锁
				}
				let buffer: ArrayBuffer;
				const chunk: UploadChunk = {
					file,
					abortController: new AbortController(),
					buffer: undefined,
					status: 'reading',
					tryCount: 0,
					transferred: 0,
					size: chunkSize,
					hash: undefined,
				};
				file.chunks[taskIndex] = chunk;
				if (typeof input === 'string') {
					buffer = (await nodeBridge.getLocalFileChunk(input, offset, chunkSize)).buffer as ArrayBuffer;
				} else {
					const blob = input.slice(offset, offset + chunkSize);
					buffer = (await blob.arrayBuffer()) as any;
				}
				chunk.buffer = buffer;
				chunk.status = 'hashing';	// 其实是等待 hashing
				readDoneChunkIndexes.push(taskIndex);
				memUsed += chunk.size;
				// await new Promise(r => setTimeout(r, 1000));
			},
		});
		file.readTask = ts1;
		ts1.on('allDone', () => {
			if (file.chunks.length === Math.ceil(fileSize / segment) && file.chunks.every((chunk) => chunk.status === 'hashing')) {
				readDone = 'done';
				console.log(`【${file.fileBaseName}】读取全部完成`)
			} else {
				readDone = 'cancelled';
				console.log(`【${file.fileBaseName}】读取中止或失败`);
			}
		});
		ts1.start();

		// 根据 CPU 数量划分成若干个 worker 任务
		file.status = 'hashing';
		const cpuCount = navigator.hardwareConcurrency - 1 || 4;
		if (!hashWorkers.length) {
			for (let i = 0; i < cpuCount; i++) {
				hashWorkers.push(new HashWorker());
				hashWorkerRunningList.push(false);
			}
		}

		// 通过 task 为 worker 分配任务
		const hashDoneChunkIndexes: number[] = [];	// 供下一轮 upload 进行消费
		// let hashDone = false;
		const ts2 = new SingleTaskScheduler({
			// concurrency: 1,
			concurrency: cpuCount,
			taskName: 'hashFile',
			task: async (sts) => {
				if (readDone === 'cancelled') {
					throw '哈希计算即将中止'
				}
				if (!readDoneChunkIndexes.length) {
					if (readDone === 'done') {
						throw '哈希计算即将结束'
					} else {
						await new Promise((resolve) => setTimeout(resolve, 150));	// read 步骤还没读完，转锁
						return;
					}
				}
				// 检查哪个 worker 空闲，检查还没 hash 的任务，然后发送给 worker，等待其完成
				const idleWorkerIndex = hashWorkerRunningList.findIndex((isRunning) => !isRunning);
				const notHashedIndex = readDoneChunkIndexes.shift();
				if (idleWorkerIndex >= 0 && notHashedIndex >= 0) {
					const worker = hashWorkers[idleWorkerIndex];
					hashWorkerRunningList[idleWorkerIndex] = true;	
					await new Promise((resolve, reject) => {
						worker.onmessage = (event) => {
							file.chunks[notHashedIndex].hash = event.data.hash;
							// console.log(`【${fileBaseName}】【${notHashedIndex}】hash 已计算：${event.data.hash}`);
							if (file.size <= memLimit) {
								// 在 memLimit 之内的文件不需要清除缓存重新读取
								file.chunks[notHashedIndex].buffer = event.data.buffer;	// buffer 还回来
							} else {
								// 否则不要缓存，等下面上传前再读取
								memUsed -= file.chunks[notHashedIndex].size;
							}
							hashWorkerRunningList[idleWorkerIndex] = false;
							hashDoneChunkIndexes.push(notHashedIndex);
							resolve(0);
						}
						worker.onerror = (error) => {
							reject(`【${notHashedIndex}】哈希计算错误`);
						}
						worker.postMessage({ index: notHashedIndex, buffer: file.chunks[notHashedIndex].buffer }, [file.chunks[notHashedIndex].buffer]);
					});
				} else {
					debugger;	// 转锁应当在上面完成，出现在此处不合理
					await new Promise((resolve) => setTimeout(resolve, 150));	// read 步骤还没读完，转锁
				}
				// await new Promise(r => setTimeout(r, 1500));
			}
		})
		file.hashTask = ts2;
		ts2.start();
		// 等待所有 hash 完成
		await new Promise((resolve, reject) => {
			ts2.on('allDone', () => {
				if (readDone !== 'cancelled') {
					console.log(`【${file.fileBaseName}】哈希全部完成`);
					if (!ts2.globalPool.size) {
						hashWorkers.forEach((worker) => worker.terminate());
						hashWorkers.splice(0, hashWorkers.length);
						hashWorkerRunningList.splice(0, hashWorkerRunningList.length);
						console.log('已释放 workers');
					}
					// hashDone = true;
					resolve(0);
				} else {
					console.log(`【${file.fileBaseName}】上传中止`);
					file.status = 'error';
					reject(0);
				}
			});
		});

		// 获取到所有分片后，拼接 hash 并检查
		const concatedHash = CryptoJS.enc.Utf8.parse(file.chunks.map(c => c.hash).join(''));
		const fileHash = CryptoJS.SHA1(concatedHash).toString();
		const response = await fetch(`http://${server.entity.ip}:${server.entity.port}/api/v1/upload/check/`, {
			method: 'post',
			body: JSON.stringify({
				hashs: [`${fileBaseName}⬝${fileHash}`],	// 与服务器 mergeUploaded 的文件名逻辑保持相同
			}),
			headers: new Headers({
				'Content-Type': 'application/json',
				'Authorization': `Bearer ${server.entity.sessionId}`,
			}),
		});
		const responseText = await response.text();
		let content = JSON.parse(responseText) as number[];
		if (content[0]) {
			console.log(fileBaseName, '已缓存');
			server.entity.mergeUploaded(taskId, file.chunks.map((chunk) => chunk.hash), fileBaseName, inputName, { accessTime, createTime, modifyTime });
			const taskUpdateHandler = (arg: { taskId: number }) => {
				if (arg.taskId === taskId) {
					server.entity.off('taskUpdate', taskUpdateHandler);
					const hasOtherUploadTask = server.data.uploadFiles.some((uploadItem) => uploadItem.taskId === taskId && uploadItem.readTask);
					if (!hasOtherUploadTask) {
						server.entity.setUploadStatus(taskId, false);
					}
					// 任务上传完成后，输入文件会被后端修改为文件名·hash，如果前端选中此文件，则需要刷新显示
					if (appStore.currentServer === server && appStore.selectedTask.has(taskId)) appStore.applySelectedTask();
				}
			};
			server.entity.on('taskUpdate', taskUpdateHandler);
			for (const chunk of file.chunks) {
				chunk.buffer = undefined;		// 释放内存
				chunk.transferred = chunk.size;	// 显示上呈现完成状态
			}
			file.status = 'finished';
			file.readTask = undefined;
			file.hashTask = undefined;
			file.uploadTask = undefined;
		} else {
			console.log(fileBaseName, '未缓存');
			// 若未缓存则检查分片缓存状态对各个分片进行上传。若出错则重试
			// const isCachedList = new Array(file.chunks.length).fill(false);
			const response = await fetch(`http://${server.entity.ip}:${server.entity.port}/api/v1/upload/check/`, {
				method: 'post',
				body: JSON.stringify({
					hashs: file.chunks.map((chunk) => chunk.hash),
				}),
				headers: new Headers({
					'Content-Type': 'application/json',
					'Authorization': `Bearer ${server.entity.sessionId}`,
				}),
			});
			const responseText = await response.text();
			const isCachedList = JSON.parse(responseText) as number[];
	
			const ts3 = new SingleTaskScheduler({
				concurrency: 2,
				taskName: 'uploadFile',
				task: async (sts) => {
					const chunkIndex = sts.count;
					if (chunkIndex >= file.chunks.length) {
						throw '上传任务即将结束';
					}
					const chunk = file.chunks[chunkIndex];
					if (isCachedList[chunkIndex]) {
						// 分片已缓存，直接标记为已完成，跳过上传
						chunk.status = 'finished';
						chunk.transferred = chunk.size;
						chunk.buffer = undefined;
						return;
					}

					const offset = chunkIndex * segment;
					const chunkSize = Math.min(segment, fileSize - offset);
					if (file.size > memLimit) {
						// chunk.buffer 已在前一步骤被清除，需要重新读取文件
						if (typeof input === 'string') {
							chunk.buffer = (await nodeBridge.getLocalFileChunk(input, offset, chunkSize)).buffer as ArrayBuffer;
						} else {
							const blob = input.slice(offset, offset + chunkSize);
							chunk.buffer = (await blob.arrayBuffer()) as any;
						}
					}

					let tryCount = 0;
					while (tryCount++ < 3) {
						chunk.status = 'uploading';
						chunk.transferred = 0;
						try {
							await new Promise((resolve, reject) => {
								const form = new FormData();
								form.append('name', chunk.hash);
								// form.append('file', file);
								const file_blob = new Blob([chunk.buffer]);
								form.append('file', file_blob, chunk.hash);
								const xhr = new XMLHttpRequest();
								const abortFunc = () => xhr.abort();
								chunk.abortController.signal.addEventListener('abort', abortFunc);
								xhr.upload.addEventListener('progress', (event) => {
									// let progress = event.loaded / event.total;
									// const transferred = task.transferProgressLog.transferred;
									// transferred.push([new Date().getTime() / 1000 - lastStarted, event.loaded]);
									chunk.transferred = event.loaded;
								}, false);
								xhr.onreadystatechange = () =>{
									if (xhr.readyState !== 0) {
										if (xhr.status >= 400 && xhr.status < 500) {
											reject('网络请求故障');
										} else if (xhr.status >= 500 && xhr.status < 600) {
											reject('服务器故障');
										}
									}
								};
								xhr.onload = () => {
									console.log(`【${chunk.file.fileBaseName}】【${chunkIndex}】【${chunk.hash}】发送完成`);
									chunk.buffer = undefined; // 释放内存
									chunk.abortController.signal.removeEventListener('abort', abortFunc);
									resolve(0);
								};
								xhr.onabort = () => {
									chunk.abortController.signal.removeEventListener('abort', abortFunc);
									reject('paused');
								};
								xhr.open('post', `http://${server.entity.ip}:${server.entity.port}/api/v1/upload/file/`, true);
								// xhr.setRequestHeader('Content-Type', 'multipart/form-data');
								xhr.setRequestHeader('Authorization', `Bearer ${server.entity.sessionId}`);
								xhr.send(form);
							});
							chunk.status = 'finished';
							chunk.transferred = chunk.size;
							break;	// 离开重试循环
						} catch (e) {
							if (e.message === 'paused') {
								chunk.status = 'paused';
								file.status = 'paused';
								console.log(`【${chunk.file.fileBaseName}】【${chunkIndex}】【${chunk.hash}】上传暂停`);
								throw `【${chunk.file.fileBaseName}】【${chunkIndex}】【${chunk.hash}】${e.message}，上传暂停`;
							} else {
								chunk.status = 'error';
								file.status = 'error';
								console.log(`【${chunk.file.fileBaseName}】【${chunkIndex}】【${chunk.hash}】上传失败`);
								throw `【${chunk.file.fileBaseName}】【${chunkIndex}】【${chunk.hash}】${e.message}，上传失败`;
							}
						}
					}
					if (chunk.status !== 'finished') {
						file.status = 'error';
						throw `【${chunk.file.fileBaseName}】【${chunkIndex}】【${chunk.hash}】分片上传失败，放弃上传`;
					}
				}
			});
			file.uploadTask = ts3;
			ts3.on('allDone', () => {
				if (file.chunks.every((chunk) => chunk.status === 'finished')) {
					// 全部上传完成
					console.log(`【${file.fileBaseName}】文件上传完成`);
					file.status = 'finished';
					server.entity.mergeUploaded(file.taskId, file.chunks.map((chunk) => chunk.hash), file.fileBaseName, inputName, { accessTime, createTime, modifyTime });
					const taskUpdateHandler = (arg: { taskId: number }) => {
						if (arg.taskId === taskId) {
							server.entity.off('taskUpdate', taskUpdateHandler);
							const hasOtherUploadTask = server.data.uploadFiles.some((uploadItem) => uploadItem.taskId === taskId && uploadItem.readTask);
							if (!hasOtherUploadTask) {
								server.entity.setUploadStatus(taskId, false);
							}
							// 任务上传完成后，输入文件会被后端修改为文件名·hash，如果前端选中此文件，则需要刷新显示
							if (appStore.currentServer === server && appStore.selectedTask.has(taskId)) appStore.applySelectedTask();
						}
					};
					server.entity.on('taskUpdate', taskUpdateHandler);
					file.status = 'finished';
					file.readTask = undefined;
					file.hashTask = undefined;
					file.uploadTask = undefined;
				} else {
					console.log(`【${file.fileBaseName}】文件上传中止或失败`);
					file.status = 'error';
					file.readTask = undefined;
					file.hashTask = undefined;
					file.uploadTask = undefined;
				}
			});
			ts3.start();
		}
	}, 0);
	return file;
}

export function pauseUploadTask(file: UploadFile) {

}
