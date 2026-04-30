import { execSync } from 'child_process';
import { Menu, MenuItem } from 'electron';

export function getOs() {
	let platform : NodeJS.Platform = process.platform;
	switch (platform) {
		case 'win32':
			return 'Windows';
		case 'linux':
			return 'Linux';
		case 'darwin':
			return 'MacOS';
		default:
			return 'unknown';
	}
};

export function convertFFBoxMenuToElectronMenuTemplate(menuStr: string, webContents: Electron.WebContents): Partial<MenuItem>[] {
	const inputObj = JSON.parse(menuStr) as any[];
	function dfs(input: any[]): Partial<MenuItem>[] {
		const output: Partial<MenuItem>[] = [];
		for (const inputMenuItem of input) {
			const value = inputMenuItem.value ?? inputMenuItem.label;
			const label = inputMenuItem.label ?? inputMenuItem.value;
			const outputMenuItem: Partial<Electron.MenuItem> = {
				checked: inputMenuItem.checked ?? false,
				enabled: inputMenuItem.disabled === true ? false : true,
				id: value,
				label,
				type: inputMenuItem.type,
				toolTip: inputMenuItem.toolTip,
				click: (event: Event) => webContents.send('menuItemClicked', value),
				submenu: inputMenuItem.subMenu ? dfs(inputMenuItem.subMenu) as any : undefined,
			};
			output.push(outputMenuItem);
		}
		return output;
	}
	const outputObj = dfs(inputObj);
	return outputObj;
}

export function getMachineId() {
	const execPath = {
        darwin: 'ioreg -rd1 -c IOPlatformExpertDevice',
        win32: `%windir%/System32/REG.exe ` +
            'QUERY HKEY_LOCAL_MACHINE\\SOFTWARE\\Microsoft\\Cryptography ' +
            '/v MachineGuid',
        linux: '( cat /var/lib/dbus/machine-id /etc/machine-id 2> /dev/null || hostname ) | head -n 1 || :',
        freebsd: 'kenv -q smbios.system.uuid || sysctl -n kern.hostuuid',
    } as any;
	try {
		const execResult = execSync(execPath[process.platform]).toString();
		function extract (result: string) {
			switch (process.platform) {
				case 'darwin':
					return result
						.split('IOPlatformUUID')[1]
						.split('\n')[0].replace(/\=|\s+|\"/ig, '')
						.toLowerCase();
				case 'win32':
					return result
						.toString()
						.split('REG_SZ')[1]
						.replace(/\r+|\n+|\s+/ig, '')
						.toLowerCase();
				case 'linux':
					return result
						.toString()
						.replace(/\r+|\n+|\s+/ig, '')
						.toLowerCase();
				case 'freebsd':
					return result
						.toString()
						.replace(/\r+|\n+|\s+/ig, '')
						.toLowerCase();
				default:
					throw new Error(`Unsupported platform: ${process.platform}`);
			}
		}
		return extract(execResult);
	} catch (error) {
		return undefined;		
	}
}
