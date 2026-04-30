import { useAppStore } from '../stores/appStore';

export function getLimitaion(type: 'maxMediaDuration' | 'maxWorkingDuration' | 'maxUploadSizeGB' | 'maxTaskListCount' | 'maxThreads' | 'maxFilterNodeCount', functionLevel?: number): number {
	const appStore = useAppStore();
	const n = functionLevel !== undefined ? functionLevel : appStore.functionLevel;
	switch (type) {
		case 'maxMediaDuration':
			return n < 50 ? 671 : undefined;
		case 'maxWorkingDuration':
			return n < 45 ? 671 : 40271;
		case 'maxUploadSizeGB':
			return n < 15 ? 1 : n < 30 ? 4 : n < 45 ? 10 : n < 65 ? 32 : 1024;
		case 'maxTaskListCount':
			return n < 20 ? 20 : n < 55 ? 99 : n < 70 ? 256 : 2048;
		case 'maxThreads':
			return n < 20 ? 4 : n < 35 ? 6 : n < 50 ? 9 : n < 70 ? 99 : 256;
		case 'maxFilterNodeCount':
			return n < 20 ? 20 : n < 40 ? 66 : n < 60 ? 99 : 999;
		default:
			break;
	}
}
