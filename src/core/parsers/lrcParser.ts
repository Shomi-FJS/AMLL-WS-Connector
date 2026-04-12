export interface LrcLine {
	/**
	 * 单位为毫秒
	 */
	time: number;
	text: string;
}

const METADATA_KEYWORDS = [
	"作词",
	"作詞",
	"作曲",
	"原唱",
	"制作人",
	"編曲",
	"编曲",
	"吉他",
	"木吉他",
	"贝斯",
	"鼓手",
	"鼓",
	"键盘",
	"钢琴",
	"打击乐",
	"萨克斯",
	"长笛",
	"单簧管",
	"合成器",
	"小号",
	"长号",
	"合唱",
	"和声",
	"和音",
	"配乐",
	"弦乐",
	"混音",
	"母带",
	"录制",
	"录音",
	"演唱",
	"人声",
	"封面",
	"监制",
	"監制",
	"总监",
	"发行",
	"發行",
	"企划",
	"企劃",
	"词",
	"詞",
	"曲",
	"音乐制作",
	"音乐统筹",
	"音乐总监",
	"制作行政",
	"音乐营销",
	"录音工作室",
	"混音工作室",
	"母带后期",
	"后期",
	"出品",
	"项目协力",
	"统筹",
	"来源",
	"营销",
	"总策划",
	"本歌曲来自",
	"视觉设计",
	"宣传发行",
	"企划营销",
	"制作协力",
	"协力",
	"配唱制作",
	"配唱制作人",
	"配唱编写",
	"民乐编写",
	"音频编辑",
	"编程",
	"制作助理",
	"录音助理",
	"指挥",
	"乐队",
	"乐队配器",
	"二胡",
	"古筝",
	"笛子",
	"琵琶",
	"唢呐",
	"扬琴",
	"阮",
	"柳琴",
	"笙",
	"箫",
	"葫芦丝",
	"马头琴",
	"京胡",
	"板胡",
	"三弦",
	"巴乌",
	"第一小提琴",
	"第二小提琴",
	"中提琴",
	"大提琴",
	"小提琴",
	"录音棚",
	"音乐监制",
	"录音师",
	"声音工程师",
	"混音师",
	"混音助理",
	"母带制作",
	"conductor",
	"orchestra",
	"orchestrator",
	"recording studio",
	"music supervisor",
	"recording engineer",
	"sound engineer",
	"mixing engineer",
	"mixing assistant",
	"mastering engineer",
	"engineered",
	"erhu",
	"guzheng",
	"dizi",
	"pipa",
	"suoona",
	"yangqin",
	"ruan",
	"liuqin",
	"sheng",
	"xiao",
	"hulusi",
	"matouqin",
	"violin",
	"electric guitar",
	"keyboards",
	"drums",
	"bass",
	"guitar",
	"percussion",
	"strings arranged",
	"author",
	"arranger",
	"released on",
	"programming",
	"midi program",
	"production assistant",
	"op",
	"sp",
	"isrc",
	"pgm",
	"rap",
	"sample",
	"composer",
	"prod",
	"composed by",
	"produced by",
];

/**
 * 英文元数据前缀 — 用于匹配无冒号的英文制作人信息行
 * 如 "Beat prod by Rainbow"、"Produced by xxx"、"Mixed by xxx"
 */
const ENGLISH_METADATA_PREFIXES = [
	"prod by",
	"produced by",
	"beat prod",
	"composed by",
	"recorded by",
	"recorded at",
	"vocals recorded at",
	"mixed by",
	"mixed at",
	"mastered by",
	"engineered by",
	"assisted by",
];

/**
 * 短码元数据前缀 — 无冒号时出现在行首的缩写代码
 * 如 "ISRC XX-XX-XX-XXXX"、"OP : Warner"、"SP : BMG"
 */
const METADATA_CODE_PREFIXES = [
	"isrc",
	"op",
	"sp",
];

export function isMetadataLine(text: string): boolean {
	if (!text) return false;

	// 使用 NFKC 规范化，将兼容性字符（例康熙部首 ⾳ U+2FB3）统一为标准字符（音 U+97F3）
	// 通过网络逐字查证，网易云部分歌词数据使用兼容性变体，容易导致关键词匹配失败
	const normalized = text.normalize("NFKC");
	const trimmed = normalized.trim();

	if (trimmed.length === 0) return false;

	const colonIndex = trimmed.search(/[:：]/);
	if (colonIndex > 0) {
		const label = trimmed.substring(0, colonIndex).trim();
		const labelLower = label.toLowerCase();
		for (const keyword of METADATA_KEYWORDS) {
			const kwLower = keyword.toLowerCase();
			if (keyword.length <= 1) {
				if (labelLower === kwLower) return true;
			} else {
				if (labelLower === kwLower || labelLower.includes(kwLower)) {
					return true;
				}
			}
		}
	} else {
		const trimmedLower = trimmed.toLowerCase();
		for (const keyword of METADATA_KEYWORDS) {
			if (trimmedLower === keyword.toLowerCase()) {
				return true;
			}
		}

		// 检测英文元数据前缀（无冒号的制作人信息，如 "Beat prod by Rainbow"）
		for (const prefix of ENGLISH_METADATA_PREFIXES) {
			if (trimmedLower.startsWith(prefix)) {
				return true;
			}
		}

		for (const keyword of METADATA_KEYWORDS) {
			const kwLower = keyword.toLowerCase();
			if (trimmedLower === kwLower + " by" || trimmedLower.startsWith(kwLower + " by ")) {
				return true;
			}
		}

		// 检测短码元数据前缀（无冒号的缩写代码，如 "ISRC TW-A53-01-2001"）
		for (const code of METADATA_CODE_PREFIXES) {
			if (trimmedLower.startsWith(code + " ") || trimmedLower.startsWith(code + ":") || trimmedLower.startsWith(code + "：")) {
				return true;
			}
		}

		if (
			trimmedLower.includes("未经") &&
			(trimmedLower.includes("著作权") || trimmedLower.includes("版权"))
		) {
			return true;
		}

		if (trimmed.startsWith("/") || trimmed.startsWith("©") || trimmed.startsWith("/©")) {
			return true;
		}
	}

	if (trimmed.includes("/") && (trimmed.includes("词") || trimmed.includes("曲"))) {
		const parts = trimmed.split(/[:：]/);
		if (parts.length > 0) {
			const header = parts[0].trim();
			if (header.includes("词") && header.includes("曲") && header.length <= 10) {
				return true;
			}
		}
	}

	if (trimmed.includes("/") && !trimmed.match(/\w+\/\w+/)) {
		const parts = trimmed.split("/");

		const hasKana = parts.some((part) =>
			/[\u3040-\u309F\u30A0-\u30FF]/.test(part),
		);
		if (hasKana) return false;

		const hasLongPart = parts.some((part) => part.trim().length > 10);
		if (hasLongPart) return false;

		const hasOnlyNamesAndDelimiters = parts.every((part) => {
			const cleaned = part.trim();
			return cleaned.match(/^[\u4E00-\u9FFFa-zA-Z0-9\s]+$/);
		});

		if (hasOnlyNamesAndDelimiters && parts.length >= 2) {
			return true;
		}
	}

	return false;
}

export function stripMetadataBlocks<T extends { text: string }>(lines: T[]): T[] {
	if (lines.length === 0) return lines;

	let start = 0;
	while (start < lines.length && isMetadataLine(lines[start].text)) {
		start++;
	}

	let end = lines.length - 1;
	while (end >= start && isMetadataLine(lines[end].text)) {
		end--;
	}

	return lines.slice(start, end + 1);
}

export function parseLrc(lrcStr: string, options?: { skipMetadataFilter?: boolean }): LrcLine[] {
	if (!lrcStr) return [];

	const shouldFilter = !options?.skipMetadataFilter;

	const lines = lrcStr.split("\n");
	const result: LrcLine[] = [];
	const regex =
		/\[(?<min>\d{2,3}):(?<sec>\d{2})(?:\.(?<ms>\d{2,3}))?\](?<text>.*)/;

	for (const line of lines) {
		const match = line.match(regex);
		if (match?.groups) {
			const { min, sec, ms, text } = match.groups;

			if (shouldFilter && isMetadataLine(text)) {
				continue;
			}

			const minVal = parseInt(min, 10);
			const secVal = parseInt(sec, 10);
			let msVal = 0;
			if (ms) {
				msVal = parseInt(ms, 10);
				if (ms.length === 2) msVal *= 10;
			}

			const time = minVal * 60000 + secVal * 1000 + msVal;

			result.push({ time, text });
		}
	}

	if (shouldFilter) {
		return stripMetadataBlocks(result);
	}
	return result;
}
