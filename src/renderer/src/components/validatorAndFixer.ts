/**
 * 该 utils 用于进行输入框的文本校验和更正
 * 注意传入类型必须为字符串，不能为 undefined 等值
 */
import { parseTimeString } from '@common/utils';

const INVALID_TEXT = '默认输入不合法提示';

export function getValidator(type: string) {
	if (['int', 'int64'].includes(type)) {
		return numberValidator.integer;
	} else if (['float', 'double'].includes(type)) {
		return numberValidator;
	} else if (type === 'duration') {
		return durationValidator;
	} else if (['dictionary', 'flags', 'color', 'image_size', 'rational'].includes(type)) {
		return undefined;	// TODO 未来补充
	}
}

export function notEmptyValidator(value: string) {
	return value.length ? undefined : INVALID_TEXT;
}

export function durationValidator(value: string) {
	return parseTimeString(value) >= 0 || !value.length ? undefined : INVALID_TEXT;
}

export function numberValidator(value: string) {
	return value.match(/^-?\d+(.\d+)?$/) ? undefined : INVALID_TEXT;
}
numberValidator.integer = function(value: string) {
	return value.match(/^-?\d+$/) ? undefined : INVALID_TEXT;
}
numberValidator.integerEmptyable = function(value: string) {
	return value === undefined || value === '' || value.match(/^-?\d+$/) ? undefined : INVALID_TEXT;
}

export function framerateValidator(value: string) {
	return value == '' || value.match(/^\d+(.\d+)?i?$/) || value === '不改变' ? undefined : INVALID_TEXT;
}

export function durationFixer(value: string) {
	return value.replaceAll('：', ':').replaceAll('。', '.').replace(/[a-z]/g, '');
}

export function posIntegerFixer(value: string) {
	return value.replace(/[^0-9]/g, '');
}
