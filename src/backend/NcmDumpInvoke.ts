import { spawn, ChildProcess } from 'child_process';
import EventEmitter from 'events';
import { spawnInvoker } from '@common/spawnInvoker';
import { TypedEventEmitter } from '@common/utils';
import { log } from './utils';
import osBridge from './osBridge';

interface NcmDumpMessage {
	message: string;
	type: 'normal' | 'error';
}

interface NcmDumpEvent {
	data: (arg: { content: string }) => void;
	closed: (errorCode: number, runningResult: 'success' | 'failed' | undefined) => void;
}

export class NcmDump extends (EventEmitter as new () => TypedEventEmitter<NcmDumpEvent>) {
	public process: ChildProcess | null = null;
	public messages: NcmDumpMessage[] = [];
	private runningResult: 'success' | 'failed' | undefined;
	private paused = false;
	private requireStop = false;

	constructor(path = 'ncmdump', params: Array<string> = []) {
		super();
		log.dev('启动 ncmdump', params.join(', '));
		spawnInvoker(path, params, {
			detached: false,
			shell: false,
		})
			.then((_process) => {
				log.dev(`ncmdump 进程启动，pid: ${_process.pid}`);
				this.process = _process;
				this.mountSpawnEvents();
			})
			.catch((reason) => {
				const message = `ncmdump 启动失败：${reason}`;
				this.messages.push({ message, type: 'error' });
				this.emit('data', { content: message });
				this.emit('closed', 1, 'failed');
			});
	}

	private mountSpawnEvents(): void {
		this.process!.stdout!.on('data', (data) => this.handleData(data));
		this.process!.stderr!.on('data', (data) => this.handleData(data, true));
		this.process!.on('close', (code) => {
			if (!this.requireStop) {
				this.runningResult = code === 0 ? 'success' : 'failed';
			}
			this.emit('closed', code ?? 0, this.runningResult);
		});
	}

	private handleData(data: Buffer | string, isError = false): void {
		const content = data.toString();
		if (!content) {
			return;
		}
		this.messages.push({ message: content, type: isError ? 'error' : 'normal' });
		this.emit('data', { content });
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
					log.warn(`ncmdump force kill failed: ${error}`);
					finish();
				}
				break;
			default:
				try {
					currentProcess.kill('SIGKILL');
				} catch (error) {
					log.warn(`ncmdump force kill failed: ${error}`);
					finish();
				}
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
				log.warn(`ncmdump resume before exit failed: ${error}`);
			}
		}
		this.requireStop = true;
		this.once('closed', finish);
		try {
			currentProcess.kill();
		} catch (error) {
			log.warn(`ncmdump soft exit failed: ${error}`);
			finish();
		}
	}

	pause(): void {
		if (!this.process || this.paused) {
			return;
		}
		const pid = this.process.pid;
		if (!pid) {
			throw new Error('ncmdump process pid missing');
		}
		switch (process.platform) {
			case 'win32':
				osBridge.pauseNresumeProcess(true, pid).catch((error) => {
					log.warn(`ncmdump pause failed for pid ${pid}: ${error}`);
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
					log.warn(`ncmdump pause failed for pid ${pid}: ${error}`);
					throw error;
				}
				break;
		}
		this.paused = true;
	}

	resume(): void {
		if (!this.process) {
			return;
		}
		const pid = this.process.pid;
		if (!pid) {
			throw new Error('ncmdump process pid missing');
		}
		switch (process.platform) {
			case 'win32':
				osBridge.pauseNresumeProcess(false, pid).catch((error) => {
					log.warn(`ncmdump resume failed for pid ${pid}: ${error}`);
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
					log.warn(`ncmdump resume failed for pid ${pid}: ${error}`);
					throw error;
				}
				break;
		}
		this.paused = false;
	}
}
