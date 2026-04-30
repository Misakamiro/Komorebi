import { FFmpegFilterDetail, FilterLine, FilterNode } from '@common/types';

export const filtersList: FFmpegFilterDetail[] = [];

// 通过 lines 中的连接信息，将 nodes 中的输入输出和端口进行关联
export const associateNodesAndLines = (nodes: FilterNode[], lines: FilterLine[]) => {
	// 先将 nodes 转换为映射，方便后续查找
	const nodeMap: Record<number, FilterNode> = {};
	nodes.forEach((node) => {
		nodeMap[node.id] = node;
		if (!node.prevs) {
			node.prevs = [];
		}
		if (!node.nexts) {
			node.nexts = [];
		}
	});
	// 然后用 line 将 node 连接起来
	for (const line of lines) {
		if (!line) {
			continue;
		}
		// 找 node
		const fromNode = nodeMap[line.prevNodeId];
		const toNode = nodeMap[line.nextNodeId];
		if (!fromNode || !toNode) {
			console.warn(`滤镜线段 ${line} 连接的节点不存在：${fromNode}, ${toNode}`);
			continue;
		}
		// 连接
		fromNode.nexts[line.prevNodePortIndex] = line;
		toNode.prevs[line.nextNodePortIndex] = line;
	}
};

export const associateNodesAndDetails = (nodes: FilterNode[]) => {
	for (const node of nodes) {
		if (!node.name.match(/(in)?(out)?_\d+/)) {
			const filterDetailItem = filtersList.find((filter) => filter.name === node.name);
			if (filterDetailItem) {
				node.detail = filterDetailItem;
			}
		}
	}
}

export const getFilterParam = (nodes: FilterNode[], lines: FilterLine[]) => {
	// filter_complex 只需要处理每个普通滤镜的节点即可，因为每个分号之间代表一个滤镜的配置（含输入和输出标签）
	// 最终输出不在这个函数做，而是在后面的函数中，遍历每个输出节点，然后 -map
	const filterLines = [];
	for (const node of nodes) {
		if (node.name.match(/^(in)|(out)_\d+$/)) {
			continue;
		}
		const inputLines = node.prevs.filter((prevLine) => prevLine);
		const inputLabels = inputLines.length ? inputLines.map((line) => `[${line.name}]`).join('') : '';
		const outputLines = node.nexts.filter((nextLine) => nextLine);
		const outputLabels = outputLines.length ? outputLines.map((line) => `[${line.name}]`).join('') : '';
		const paramsStr = Object.entries(node.params).filter(([key, value]) => value !== undefined && value !== '').map(([key, value]) => `${key}=${value}`).join(':');
		const filterParam = `${node.name}${paramsStr.length ? `=${paramsStr}` : ''}`;
		filterLines.push(`${inputLabels}${filterParam}${outputLabels}`);
	}

	return filterLines.length ? filterLines.join(';') : '';
}

// #region 滤镜图操作

export const getNodeInputPoints: (node: FilterNode) => { type: 'V' | 'A' | 'N' | 'U' }[] = (node) => {
	if (node.detail) {
		if (node.detail.inputType === '|') {
			return [];
		} else if (node.detail.inputType === 'N') {
			return new Array((node.prevs ?? []).length + 1).fill(
				{ type: node.detail.inputType },
			);
		} else {
			return node.detail.inputType.split('').map((type) => ({ type }));
		}
	} else if (node.name.match(/out_\d+/)) {
		return new Array(node.prevs.filter((line) => line).length + 1).fill({ type: 'U' });
	}
	return [];
};
export const getNodeOutputPoints: (node: FilterNode) => { type: 'V' | 'A' | 'N' | 'U' }[] = (node) => {
	if (node.detail) {
		if (node.detail.outputType === '|') {
			return [];
		} else if (node.detail.outputType === 'N') {
			return new Array((node.nexts ?? []).length + 1).fill(
				{ type: node.detail.outputType },
			);
		} else {
			return node.detail.outputType.split('').map((type) => ({ type }));
		}
	} else if (node.name.match(/in_\d+/)) {
		return new Array(node.nexts.filter((line) => line).length + 1).fill({ type: 'U' });
	}
	return [];
};

// 在移动节点、（可变节点的）增删节点或者增删线段时修正端口上的线的位置
export const fixNodePortPosition = (node: FilterNode) => {
	const outputPoints = getNodeOutputPoints(node);
	const inputPoints = getNodeInputPoints(node);
	const maxOutputPointsIndexHalf = (outputPoints.length - 1) / 2;
	const maxInputPointsIndexHalf = (inputPoints.length - 1) / 2;
	for (let i = 0; i < node.prevs.length; i++) {
		const line = node.prevs[i];
		if (line) {
			line.nextXY = [node.x - 45, node.y + 15 * (i - maxInputPointsIndexHalf)];
		}
	}
	for (let i = 0; i < node.nexts.length; i++) {
		const line = node.nexts[i];
		if (line) {
			line.prevXY = [node.x + 45, node.y + 15 * (i - maxOutputPointsIndexHalf)];
		}
	}
};

/**
 * 从图中删除节点，删除其前后连接线，并释放连接线另一端占用的端口，（由于节点高度会发生改变）并修复该端口上所有端口的坐标。
 * 该函数会原地修改 nodes 和 lines
 * @param node 要删除的节点
 * * 如果删除的是选中节点，请另行去除选中状态
 * * 如果删除的是输出节点，请另行删除 appStore.globalParams.outputs 中的项，另行改变当前选中的输出索引
 */
export const deleteNode = (nodes: FilterNode[], lines: FilterLine[], node: FilterNode) => {
	const nodeIndex = nodes.findIndex((n) => n.id === node.id);
	nodes.splice(nodeIndex, 1);
	// 删除前连接线的同时，要把连接线前的节点的占用端口释放
	for (const line of node.prevs) {
		const prevNode = nodes.find((node) => node.id === line.prevNodeId);
		prevNode.nexts.splice(line.prevNodePortIndex, 1);
		let needToFixPrevNodePort = prevNode.name.match(/^in_\d+$/) || ['U', 'N'].includes(prevNode.detail.outputType[0]);	// 需要修复的第一个条件是端口数量是动态的（isPrevNodeOutputOrUN）
		// 前连接线连接的节点的输出端口清除后，在其后面的端口会往前挪一位。这会导致这个端口往后的所有【线段】所记录的 portIndex 都 -1
		for (let i = line.prevNodePortIndex; i < prevNode.nexts.length; i++) {
			prevNode.nexts[i].prevNodePortIndex--;
			needToFixPrevNodePort = true;
		}
		if (needToFixPrevNodePort) {
			fixNodePortPosition(prevNode);
		}
	}
	// 删除后连接线的同时，要把连接线后的节点的占用端口释放
	for (const line of node.nexts) {
		const nextNode = nodes.find((node) => node.id === line.nextNodeId);
		nextNode.prevs.splice(line.nextNodePortIndex, 1);
		let needToFixNextNodePort = nextNode.name.match(/^out_\d+$/) || ['U', 'N'].includes(nextNode.detail.inputType[0]);	// 需要修复的第一个条件是端口数量是动态的（isNextNodeOutputOrUN）
		// 后连接线连接的节点的输入端口清除后，在其后面的端口会往前挪一位。这会导致这个端口往后的所有【线段】所记录的 portIndex 都 -1
		for (let i = line.nextNodePortIndex; i < nextNode.prevs.length; i++) {
			nextNode.prevs[i].nextNodePortIndex--;
			needToFixNextNodePort = true;
		}
		if (needToFixNextNodePort) {
			fixNodePortPosition(nextNode);
		}
	}
	// 删除前后连接线
	for (let i = lines.length - 1; i >= 0; i--) {
		const line = lines[i];
		if (!line || line.prevNodeId === node.id || line.nextNodeId === node.id) {
			lines.splice(i, 1);
		}
	}
	// 如果删除的是输出节点，其编号后的节点名称编号将全部 -1
	const outMatch = node.name.match(/^out_(\d+)$/);
	if (outMatch) {
		let i = +outMatch[1] + 1;
		while (true) {
			const outputNode = nodes.find((node) => node.name === `out_${i}`);
			if (!outputNode) {
				break;	// 没有后续输出节点了
			}
			outputNode.name = `out_${i - 1}`;
			i++;
		}
	}
	// 如果删除的是输入节点，其编号后的节点名称编号将全部 -1，连线名称上的编号也 -1
	const inMatch = node.name.match(/^in_(\d+)$/);
	if (inMatch) {
		let i = +inMatch[1] + 1;
		while (true) {
			const inputNode = nodes.find((node) => node.name === `in_${i}`);
			if (!inputNode) {
				break;	// 没有后续输出节点了
			}
			inputNode.name = `in_${i - 1}`;
			for (const nextLine of inputNode.nexts) {
				const [inputNodeIndexStr, mediaType, mediaIndex] = nextLine.name.split(':');
				nextLine.name = `${+inputNodeIndexStr - 1}:${mediaType}${mediaIndex !== undefined ? `:${mediaIndex}` : ''}`;
			}
			i++;
		}
	}
};

// #endregion
