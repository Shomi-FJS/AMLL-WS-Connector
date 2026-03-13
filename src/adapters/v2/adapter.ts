import { feature } from "bun:bundle";
import type { v2 } from "@/types/ncm";
import type { AmllLyricContent, AmllLyricLine } from "@/types/ws";
import { parseYrcStr } from "@/utils/lyricParser";
import { BaseLyricAdapter } from "../BaseLyricAdapter";

export class V2LyricAdapter extends BaseLyricAdapter {
	private originalGe: v2.NejEventBus["Ge"] | null = null;
	private eventBus: v2.NejEventBus | null = null;

	private baseLyric: AmllLyricContent | null = null;
	private currentOffset: number = 0;

	public async init(): Promise<boolean> {
		const bus = window.NEJ?.P(
			/* 名字空间申明 */ "nej.v" /* 事件接口名字空间 */,
		);

		if (
			bus &&
			typeof bus.Ge /* _$dispatchEvent */ === "function" &&
			typeof bus.Ge.e9 /* _$aop */ === "function"
		) {
			this.eventBus = bus;
			this.originalGe = bus.Ge;

			this.eventBus.Ge /* _$dispatchEvent */ = this.originalGe.e9(
				/* _$aop */ (event) => {
					const eventName = event.args[1];
					const payload = event.args[2];

					if (typeof eventName !== "string") return;

					try {
						if (eventName === "lrcload") {
							if (feature("DEV")) {
								console.log("截获 lrcload", payload);
							}

							this.handleLrcLoad(payload as v2.NcmV2LyricPayload);
						} else if (eventName === "lrctimeupdate") {
							this.handleLrcTimeUpdate(payload as v2.LrcTimeUpdatePayload);
						}
					} catch (err) {
						console.error(`[V2LyricAdapter] 处理事件 ${eventName} 失败`, err);
					}
				},
			);

			return true;
		}

		console.warn(
			"[V2LyricAdapter] 未找到 NEJ 框架或无法应用 AOP 拦截。请检查当前版本是否为 2.10.13。",
		);
		return false;
	}

	public destroy(): void {
		if (this.eventBus && this.originalGe) {
			this.eventBus.Ge = this.originalGe;
			this.originalGe = null;
			this.eventBus = null;
		}
		this.baseLyric = null;
		this.currentOffset = 0;
	}

	public fetchLyric(): void {
		// V2 版本似乎无论是否需要展示歌词都会自己去获取歌词
	}

	private handleLrcLoad(payload: v2.NcmV2LyricPayload) {
		if (!payload || !payload.lyric) return;

		this.baseLyric = this.parseV2Payload(payload.lyric);
		if (!this.baseLyric) return;

		this.currentOffset = payload.lyric.lrc?.offset ?? 0;

		this.emitAdjustedLyric();
	}

	private handleLrcTimeUpdate(payload: v2.LrcTimeUpdatePayload): void {
		if (!this.baseLyric || !payload.result) return;

		const newOffset = payload.result.offset ?? 0;

		if (newOffset !== this.currentOffset) {
			this.currentOffset = newOffset;
			this.emitAdjustedLyric();
		}
	}

	private emitAdjustedLyric(): void {
		if (!this.baseLyric || !this.onLyricUpdate) return;

		if (this.currentOffset === 0) {
			this.onLyricUpdate(this.baseLyric);
			return;
		}

		const adjustedLyric = this.applyOffset(this.baseLyric, this.currentOffset);
		this.onLyricUpdate(adjustedLyric);
	}

	/**
	 * 时间轴平移计算
	 *
	 * 正数 offset 表示歌词提前显示
	 */
	private applyOffset(
		baseLyric: AmllLyricContent,
		offset: number,
	): AmllLyricContent {
		if (baseLyric.format !== "structured") {
			return baseLyric;
		}

		const adjustedLines: AmllLyricLine[] = baseLyric.lines.map((line) => {
			return {
				...line,
				startTime: Math.max(0, line.startTime - offset),
				endTime: Math.max(0, line.endTime - offset),
				words: line.words?.map((word) => ({
					...word,
					startTime: Math.max(0, word.startTime - offset),
					endTime: Math.max(0, word.endTime - offset),
				})),
			};
		});

		return {
			format: "structured",
			lines: adjustedLines,
		};
	}

	private parseV2Payload(
		lyricObj: NonNullable<v2.NcmV2LyricPayload["lyric"]>,
	): AmllLyricContent | null {
		if (lyricObj.yrc?.lyric) {
			const yrcLines = parseYrcStr(lyricObj.yrc.lyric);

			if (yrcLines.length > 0) {
				// 网易云已经帮我们关联好了翻译罗马音和主歌词，直接按索引匹配即可，下同
				const transLines = lyricObj.tlyric?.lines || [];
				const romaLines = lyricObj.romalrc?.lines || [];

				for (let i = 0; i < yrcLines.length; i++) {
					yrcLines[i].translatedLyric = transLines[i]?.lyric || "";
					yrcLines[i].romanLyric = romaLines[i]?.lyric || "";
				}

				return { format: "structured", lines: yrcLines };
			}
		}

		if (
			lyricObj.lrc &&
			Array.isArray(lyricObj.lrc.lines) &&
			lyricObj.lrc.lines.length > 0
		) {
			const lines = lyricObj.lrc.lines;
			const parsedLines: AmllLyricLine[] = [];

			const transLines = lyricObj.tlyric?.lines || [];
			const romaStrLines = lyricObj.romalrc?.lines || [];

			for (let i = 0; i < lines.length; i++) {
				const current = lines[i];
				const text = current.lyric.trim();
				const startTime = Math.max(0, Math.floor(current.time * 1000));

				if (!text) {
					if (parsedLines.length > 0) {
						const prevLine = parsedLines[parsedLines.length - 1];
						const safeEndTime = Math.max(prevLine.startTime, startTime);
						prevLine.endTime = safeEndTime;
						prevLine.words[0].endTime = safeEndTime;
					}
					continue;
				}

				const next = lines[i + 1];
				const defaultEndTime = next
					? Math.max(0, Math.floor(next.time * 1000))
					: startTime + 100000;
				const safeEndTime = Math.max(startTime, defaultEndTime);

				parsedLines.push({
					startTime,
					endTime: safeEndTime,
					translatedLyric: transLines[i]?.lyric || "",
					romanLyric: romaStrLines[i]?.lyric || "",
					words: [
						{
							startTime,
							endTime: safeEndTime,
							word: current.lyric,
						},
					],
				});
			}

			return { format: "structured", lines: parsedLines };
		}

		return null;
	}
}
