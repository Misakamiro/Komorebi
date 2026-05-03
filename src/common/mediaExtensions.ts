import type { KomorebiWorkflow } from './komorebiPresets';

const normalizeExtension = (value: string) => value.trim().toLowerCase().replace(/^\*?\.?/, '.');
const workflowPriority: KomorebiWorkflow[] = ['video-compress', 'audio-convert', 'remux', 'ncm'];

export const komorebiVideoInputExtensions = [
	'.3g2',
	'.3gp',
	'.amv',
	'.asf',
	'.avi',
	'.av1',
	'.dav',
	'.divx',
	'.dv',
	'.dvr-ms',
	'.f4v',
	'.flv',
	'.h264',
	'.h265',
	'.hevc',
	'.ism',
	'.ismv',
	'.m1v',
	'.m2t',
	'.m2p',
	'.m2ts',
	'.m2v',
	'.m4v',
	'.mjpeg',
	'.mkv',
	'.mjpg',
	'.mod',
	'.mov',
	'.mp4',
	'.mpe',
	'.mpeg',
	'.mpg',
	'.mpegts',
	'.mts',
	'.mxf',
	'.nsv',
	'.nut',
	'.ogm',
	'.ogv',
	'.qt',
	'.rec',
	'.rm',
	'.rmvb',
	'.roq',
	'.tod',
	'.tp',
	'.trp',
	'.ts',
	'.vob',
	'.webm',
	'.wmv',
	'.wtv',
	'.y4m',
].map(normalizeExtension);

export const komorebiAudioInputExtensions = [
	'.aac',
	'.ac3',
	'.adx',
	'.aif',
	'.aiff',
	'.alac',
	'.amr',
	'.ape',
	'.au',
	'.caf',
	'.dff',
	'.dsf',
	'.dts',
	'.eac3',
	'.flac',
	'.gsm',
	'.m4a',
	'.m4b',
	'.m4p',
	'.m4r',
	'.mka',
	'.mp2',
	'.mp3',
	'.mpa',
	'.mpc',
	'.oga',
	'.ogg',
	'.opus',
	'.ra',
	'.snd',
	'.spx',
	'.tak',
	'.tta',
	'.voc',
	'.wav',
	'.weba',
	'.wma',
	'.wv',
].map(normalizeExtension);

export const komorebiNcmInputExtensions = ['.ncm'];

const unique = (items: string[]) => [...new Set(items.map(normalizeExtension))];

export const komorebiWorkflowInputExtensions: Record<KomorebiWorkflow, string[]> = {
	'video-compress': unique(komorebiVideoInputExtensions),
	'audio-convert': unique([...komorebiAudioInputExtensions, ...komorebiVideoInputExtensions]),
	remux: unique([...komorebiVideoInputExtensions, ...komorebiAudioInputExtensions]),
	ncm: unique(komorebiNcmInputExtensions),
};

export const getFileExtension = (filePath: string) => {
	const cleaned = filePath.trim().replace(/^["']|["']$/g, '').split(/[?#]/, 1)[0];
	const slashIndex = Math.max(cleaned.lastIndexOf('/'), cleaned.lastIndexOf('\\'));
	const dotIndex = cleaned.lastIndexOf('.');
	if (dotIndex <= slashIndex) {
		return '';
	}
	return cleaned.slice(dotIndex).toLowerCase();
};

export const isKomorebiDroppablePath = (workflow: KomorebiWorkflow, filePath: string) => {
	const ext = getFileExtension(filePath);
	return !!ext && (komorebiWorkflowInputExtensions[workflow] || komorebiWorkflowInputExtensions.remux).includes(ext);
};

export type KomorebiInputKind = 'video' | 'audio' | 'ncm' | 'unknown';

export const getKomorebiInputKind = (filePath: string): KomorebiInputKind => {
	const ext = getFileExtension(filePath);
	if (!ext) {
		return 'unknown';
	}
	if (komorebiNcmInputExtensions.includes(ext)) {
		return 'ncm';
	}
	if (komorebiVideoInputExtensions.includes(ext)) {
		return 'video';
	}
	if (komorebiAudioInputExtensions.includes(ext)) {
		return 'audio';
	}
	return 'unknown';
};

export const getKomorebiWorkflowsForPath = (filePath: string): KomorebiWorkflow[] => (
	workflowPriority.filter((workflow) => isKomorebiDroppablePath(workflow, filePath))
);

export const isKomorebiKnownInputPath = (filePath: string) => getKomorebiWorkflowsForPath(filePath).length > 0;

export const areKomorebiPathsCompatibleWithWorkflow = (workflow: KomorebiWorkflow, filePaths: string[]) => (
	filePaths.length > 0 && filePaths.every((filePath) => isKomorebiDroppablePath(workflow, filePath))
);

export const getKomorebiWorkflowForPaths = (filePaths: string[], currentWorkflow?: KomorebiWorkflow): KomorebiWorkflow | undefined => {
	const validPaths = filePaths.filter(isKomorebiKnownInputPath);
	if (!validPaths.length) {
		return undefined;
	}
	if (currentWorkflow && areKomorebiPathsCompatibleWithWorkflow(currentWorkflow, validPaths)) {
		return currentWorkflow;
	}
	const compatible = workflowPriority.filter((workflow) => areKomorebiPathsCompatibleWithWorkflow(workflow, validPaths));
	if (!compatible.length) {
		return undefined;
	}
	const kinds = validPaths.map(getKomorebiInputKind);
	if (kinds.every((kind) => kind === 'ncm')) {
		return compatible.includes('ncm') ? 'ncm' : compatible[0];
	}
	if (kinds.every((kind) => kind === 'audio')) {
		return compatible.includes('audio-convert') ? 'audio-convert' : compatible[0];
	}
	if (kinds.every((kind) => kind === 'video')) {
		return compatible.includes('video-compress') ? 'video-compress' : compatible[0];
	}
	if (compatible.includes('remux')) {
		return 'remux';
	}
	return compatible.includes('audio-convert') ? 'audio-convert' : compatible[0];
};
