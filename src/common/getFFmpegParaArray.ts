import path from './path';
import { associateNodesAndLines, getFilterParam } from './params/filter';
import { getInputFFmpegParam, builtInMuxers, allMuxers, getMuxFFmpegParam } from './params/formats';
import { getVideoFFmpegParam } from './params/vcodecs';
import { getAudioFFmpegParam } from './params/acodecs';
import { OutputParams } from '@common/types';
import { randomString } from './utils';
import { getMenuItemByValue } from './menu';

const { trimExt, dirname, basename } = path;

/**
 * 获取命令行参数
 * 如果不提供 outputFileName 或 outputDir，则自动从 outputParams.input.files[0].filePath 中提取
 * outputFileName、outputDir 两项目前没有任何地方在使用
 * 如果任务是网络任务，输出路径是 taskName + random + ext，不包含目录（具体输出位置在 taskStart 时才生成给 ffmpeg），此时指定 task.outputFiles 为 overrideFilePath
 */
export function getFFmpegParaArray(params: { outputParams: OutputParams, withQuotes?: boolean, inputDir?: string, outputFileName?: string, outputDir?: string, overrideFilePaths?: string[] }) {
	const ret: Array<string> = [];
	let { outputParams, withQuotes, inputDir, outputFileName, outputDir, overrideFilePaths } = params;

	const inputFilePath = outputParams.input.files[0]?.filePath;	// 暂时以第一个输入文件定目录
	outputFileName = outputFileName || trimExt(basename(inputFilePath || '[输出文件名]'));	// 暂时以第一个输入文件的 fileName 定义输出文件名
	outputDir = outputDir || dirname(inputFilePath || '[输出目录]');
	
	ret.push('-hide_banner');
	ret.push(...getInputFFmpegParam(outputParams.input, withQuotes, inputDir));

	if (!outputParams.filter?.nodes || !outputParams.filter?.lines) outputParams.filter = { nodes: [], lines: [] };	// 从类型定义上来说不应该会执行这一条，这里的处理是防范外部 API 调用不遵守规范
	associateNodesAndLines(outputParams.filter.nodes, outputParams.filter.lines);
	const filterStr = getFilterParam(outputParams.filter.nodes, outputParams.filter.lines);
	if (filterStr) {
		ret.push('-filter_complex', withQuotes ? `"${filterStr}"` : filterStr);
	}
	/**
	 * 在 filter 图中找到所有输出节点进行遍历
	 *   如果有，并且有连线，那么对每个有连线的节点都 -map [最后一条线.name] 然后进行 video/audio/output 的参数生成。
	 *   如果一个都没有，说明滤镜图不完整，则不需要进行 map，直接在后面放 video/audio/output 的参数生成
	 * 因为 [最后一条线.name] 就是 -map 的参数，所以不用关心它中间有没有放 filter。这是 filter_complex 相关代码要处理的内容，这里只需要处理 -map
	 */
	if (!outputParams.outputs.length) {
		// 默认情况下这里数量最低为 1，不允许再删除。但如果后面代码真允许删除，那参数就到此为止了
		return ret;
	}
	const outputNodes = outputParams.filter.nodes.filter((node) => node.name.match(/^out_\d+$/));
	if (outputNodes.length) {	// 只要有输出节点就认为用户启用了滤镜图
		for (let outputIndex = 0; outputIndex < outputNodes.length; outputIndex++) {
			const outputNode = outputNodes[outputIndex];
			// 一个 outputNode 是一个输出文件，可以由多个输入共同组成，因此这里要遍历 lines（对应 ffmpeg 中括号内的字符串）
			for (let outputNodeIndex = 0; outputNodeIndex < outputNode.prevs?.length; outputNodeIndex++) {
				const line = outputNode.prevs[outputNodeIndex];
				if (line) {
					ret.push('-map');
					ret.push(line.name.match(/^\d+(:[vasdt])?(:\d+)?$/) ? line.name : `[${line.name}]`);
				}
			}
			if (outputNode.prevs?.length) {
				// 至少需要有连线才能输出
				ret.push(...getVideoFFmpegParam(outputParams.outputs[outputIndex].video));
				ret.push(...getAudioFFmpegParam(outputParams.outputs[outputIndex].audio));
				ret.push(...getMuxFFmpegParam(outputParams.outputs[outputIndex].mux, outputDir, outputFileName, withQuotes, overrideFilePaths?.[outputIndex]));
			}
		}
	} else {
		ret.push(...getVideoFFmpegParam(outputParams.outputs[0].video));
		ret.push(...getAudioFFmpegParam(outputParams.outputs[0].audio));
		ret.push(...getMuxFFmpegParam(outputParams.outputs[0].mux, outputDir, outputFileName, withQuotes, overrideFilePaths?.[0]));
	}
	ret.push('-y');
	return ret;
}

/**
 * 对于本地文件，直接按配置返回 task.outputFiles
 * 对于远程文件，需要给出 remoteDownloadDir，这个函数每调用一次就生成一个新的 hash
 */
export function genTaskOutputFiles(outputParams: OutputParams, remoteDownloadDir?: string): string[] {
	// 本地任务：取第一个输入文件路径作为输出 basename（若没有输入文件则使用占位符）
	const inputFilePath = outputParams.input.files[0]?.filePath || '[输出文件名]';
	let localOutputDir = dirname(inputFilePath || '[输出目录]');
    let localOutputFileName = trimExt(basename(inputFilePath));

    return outputParams.outputs.map((output) => {
        let extension = '';

        if (output.mux.format?.length && output.mux.format !== '无') {
			let formatItem = getMenuItemByValue(builtInMuxers, output.mux.format);
			if (!formatItem) {
				formatItem = getMenuItemByValue(allMuxers, output.mux.format);
			}
            extension = formatItem ? (formatItem.value as string).match(/(.+) \(.+\)/)?.[1] || formatItem.value : output.mux.format;
        }

		if (remoteDownloadDir !== undefined) {
			// 联机任务：直接拼路径和随机名（暂时只允许不同输出文件使用不同格式，因为 basename 会被完全忽略）
			const randomBase = `${Date.now()}${randomString(3)}`;
			const filename = extension ? `${randomBase}.${extension}` : randomBase;
			return `${remoteDownloadDir ? remoteDownloadDir + '/' : ''}${filename}`;
		} else {
			let outputFilePath = output.mux.filePath;
			outputFilePath = outputFilePath.replace(/\[filedir\]/g, localOutputDir);
			outputFilePath = outputFilePath.replace(/\[filename\]/g, localOutputFileName);
			outputFilePath = outputFilePath.replace(/\[fileext\]/g, extension);
			return outputFilePath;
		}
    });
}
