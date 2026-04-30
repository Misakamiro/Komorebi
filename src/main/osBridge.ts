import { BrowserWindow, Menu } from 'electron';

export default {
	initPipe(): Promise<void> {
		return Promise.resolve();
	},
	sendLoadStatus(_type: 'main' | 'renderer' | 'show' | 'app' | 'service'): void {},
	setBlurBehindWindow(mainWindow: BrowserWindow, value: number): Promise<void> {
		try {
			if (process.platform === 'win32' && typeof (mainWindow as any).setBackgroundMaterial === 'function') {
				(mainWindow as any).setBackgroundMaterial(value ? 'mica' : 'none');
			}
		} catch {}
		return Promise.resolve();
	},
	triggerSystemMenu(): Promise<void> {
		const focusedWindow = BrowserWindow.getFocusedWindow();
		if (focusedWindow) {
			Menu.getApplicationMenu()?.popup({ window: focusedWindow });
		}
		return Promise.resolve();
	},
	triggerSnapLayout(): Promise<void> {
		return Promise.resolve();
	},
}
