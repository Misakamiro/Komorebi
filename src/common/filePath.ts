const hasProtocol = (value: string) => /^[a-z][a-z0-9+.-]*:\/\//i.test(value);

export const stripOuterQuotes = (value?: string) => {
	let normalized = (value || '').trim();
	while (
		normalized.length >= 2 &&
		((normalized.startsWith('"') && normalized.endsWith('"')) ||
			(normalized.startsWith("'") && normalized.endsWith("'")))
	) {
		normalized = normalized.slice(1, -1).trim();
	}
	return normalized;
};

export const isUncPath = (value?: string) => /^\\\\[^\\]+\\[^\\]+/.test(stripOuterQuotes(value));

export const isForwardSlashUncPath = (value?: string) => {
	const normalized = stripOuterQuotes(value);
	return /^\/\/[^/]+\/[^/]+/.test(normalized) && !hasProtocol(normalized);
};

export const isWindowsDrivePath = (value?: string) => /^[A-Za-z]:[\\/]/.test(stripOuterQuotes(value));

export const normalizeFilesystemPathForKomorebi = (value?: string) => {
	const normalized = stripOuterQuotes(value);
	if (!normalized) {
		return normalized;
	}
	if (hasProtocol(normalized) || normalized.toLowerCase().startsWith('file:')) {
		return normalized;
	}
	if (isForwardSlashUncPath(normalized)) {
		return `\\\\${normalized.slice(2).replace(/\//g, '\\')}`;
	}
	if (isUncPath(normalized) || isWindowsDrivePath(normalized)) {
		return normalized.replace(/\//g, '\\');
	}
	return normalized;
};

const trimTrailingSeparators = (value: string) => {
	if (/^[A-Za-z]:[\\/]$/.test(value)) {
		return value;
	}
	let normalized = value;
	while (normalized.length > 1 && /[\\/]$/.test(normalized)) {
		if (/^\\\\[^\\]+\\[^\\]+\\?$/.test(normalized)) {
			return normalized.replace(/[\\/]$/, '');
		}
		normalized = normalized.slice(0, -1);
	}
	return normalized;
};

export const normalizeDirectoryPathForKomorebi = (value?: string) => {
	const normalized = normalizeFilesystemPathForKomorebi(value);
	return trimTrailingSeparators(normalized);
};

export const getPathBaseName = (value?: string) => {
	const normalized = trimTrailingSeparators(stripOuterQuotes(value).split(/[?#]/, 1)[0]);
	if (!normalized) {
		return '';
	}
	const index = Math.max(normalized.lastIndexOf('/'), normalized.lastIndexOf('\\'));
	return index >= 0 ? normalized.slice(index + 1) : normalized;
};

export const getPathDirName = (value?: string) => {
	const normalized = trimTrailingSeparators(stripOuterQuotes(value).split(/[?#]/, 1)[0]);
	if (!normalized) {
		return '.';
	}
	const index = Math.max(normalized.lastIndexOf('/'), normalized.lastIndexOf('\\'));
	if (index < 0) {
		return '.';
	}
	if (index === 0) {
		return normalized[0];
	}
	if (/^[A-Za-z]:[\\/]?[^\\/]*$/.test(normalized)) {
		return `${normalized.slice(0, 2)}\\`;
	}
	return normalized.slice(0, index);
};

export const joinPathPreserveUnc = (dir?: string, filename?: string) => {
	const normalizedDir = normalizeDirectoryPathForKomorebi(dir);
	const normalizedName = stripOuterQuotes(filename);
	if (!normalizedDir) {
		return normalizedName;
	}
	if (!normalizedName) {
		return normalizedDir;
	}
	const separator = normalizedDir.includes('\\') && !normalizedDir.startsWith('/') ? '\\' : '/';
	return `${normalizedDir}${/[\\/]$/.test(normalizedDir) ? '' : separator}${normalizedName}`;
};
