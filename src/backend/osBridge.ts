import { spawn } from 'child_process';
import { log } from './utils';

const runPowerShell = (script: string): Promise<void> => new Promise((resolve, reject) => {
	const child = spawn('powershell.exe', [
		'-NoProfile',
		'-ExecutionPolicy',
		'Bypass',
		'-Command',
		script,
	], {
		detached: false,
		shell: false,
		windowsHide: true,
	});
	child.on('error', reject);
	child.on('close', (code) => code === 0 ? resolve() : reject(code));
});

const suspendScript = (turnOn: boolean, pid: number) => `
$signature = @"
using System;
using System.Runtime.InteropServices;
public static class NativeProcess {
	[DllImport("ntdll.dll")]
	public static extern int NtSuspendProcess(IntPtr processHandle);
	[DllImport("ntdll.dll")]
	public static extern int NtResumeProcess(IntPtr processHandle);
	[DllImport("kernel32.dll", SetLastError = true)]
	public static extern IntPtr OpenProcess(UInt32 access, Boolean inheritHandle, UInt32 processId);
	[DllImport("kernel32.dll", SetLastError = true)]
	public static extern Boolean CloseHandle(IntPtr handle);
}
"@
Add-Type -TypeDefinition $signature -ErrorAction SilentlyContinue
$handle = [NativeProcess]::OpenProcess(0x0800 -bor 0x0400, $false, ${pid})
if ($handle -eq [IntPtr]::Zero) { exit 1 }
try {
	${turnOn ? '[NativeProcess]::NtSuspendProcess($handle) | Out-Null' : '[NativeProcess]::NtResumeProcess($handle) | Out-Null'}
} finally {
	[NativeProcess]::CloseHandle($handle) | Out-Null
}
`;

export default {
	pauseNresumeProcess(turnON: boolean, pid: number): Promise<void> {
		if (process.platform !== 'win32') {
			return Promise.resolve();
		}
		return runPowerShell(suspendScript(turnON, pid)).catch((error) => {
			log.warn(`Windows process ${turnON ? 'pause' : 'resume'} failed for pid ${pid}: ${error}`);
		});
	},
};
