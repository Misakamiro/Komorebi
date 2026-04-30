import CryptoJS from 'crypto-js';

type RequestData = { buffer: Uint8Array, index: number };
// worker 的消息监听
self.onmessage = async (event) => {
	// 注意 CryptoJS 要转 WordArray
	let wordArray = CryptoJS.lib.WordArray.create(event.data.buffer as any);
	const hash = CryptoJS.SHA1(wordArray).toString();
	wordArray = undefined;	// 明确告知 V8 可以回收。不加这句虽然也能触发回收但明显更容易在校验中途 OOM
	(self as any).postMessage({ index: event.data.index, hash, buffer: event.data.buffer }, [ event.data.buffer ]);
};
