import { getSingleArgvValue } from '@common/utils';
import { FFBoxService } from './FFBoxService';
import UIBridge from './uiBridge';
import { version } from '@common/constants';
import { log } from './utils';
import { NotificationLevel } from '@common/types';

let service: FFBoxService;
let lastUncaughtNotice = 0;
const helpText = `
Options:
  -?, -h, --help        显示 Komorebi 服务帮助文档
  --port [number]       指定监听端口
  --loglevel [0|3|5|6]  信息显示级别（无|错误|事件|调试）
`;

process.on('uncaughtException', (err) => {
	log.error('发生未捕获异常，以下为错误信息');
	console.error(err);
	const now = Date.now();
	if (now - lastUncaughtNotice <= 3000) {
		return;
	}
	lastUncaughtNotice = now;
	if (service) {
		service.setNotification(-1, 'Komorebi 本地服务发生未捕获异常。', NotificationLevel.error);
	}
});

console.log(`KomorebiService 版本 ${version} - Komorebi 本地服务`);
console.log(`\x1b[2m如需帮助，请使用 --help 参数\x1b[0m`);

if (['-h', '-?', '--help'].some((t) => getSingleArgvValue(t))) {
	console.log(helpText);
} else {
	service = new FFBoxService();
	service.on('serverError', () => {
		process.exit();
	});
	service.on('serverClose', () => {
		process.exit();
	});

	UIBridge.init(service);
	UIBridge.listen();
}
