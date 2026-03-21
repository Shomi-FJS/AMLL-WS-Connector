import { feature } from "bun:bundle";
import type { LrcLine } from "@/core/parsers/lrcParser";
import {
	buildAmllLyricLines,
	mergeSubLyrics,
} from "@/core/parsers/lyricBuilder";
import { parseYrc } from "@/core/parsers/yrcParser";
import type { v2 } from "@/types/ncm";
import type { AmllLyricContent, AmllLyricLine } from "@/types/ws";
import { extractRawLyricData } from "@/utils/format-lyric";
import { LYRIC_SOURCE_UUID_BUILTIN_NCM } from "@/utils/source";
import { BaseLyricAdapter } from "../BaseLyricAdapter";

export class V2LyricAdapter extends BaseLyricAdapter {
	public readonly id = LYRIC_SOURCE_UUID_BUILTIN_NCM;

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

							this.handleLrcLoad(payload as v2.LrcLoadPayload);
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
		if (this.baseLyric) {
			this.emitAdjustedLyric();
		}
	}

	private handleLrcLoad(payload: v2.LrcLoadPayload) {
		if (!payload || !payload.lyric) {
			this.dispatch("rawlyric", null);
			return;
		}

		const rawLyricData = extractRawLyricData({
			yrc: payload.lyric.yrc?.lyric,
			lrcLines: payload.lyric.lrc?.lines,
			trans: payload.lyric.tlyric?.lines,
			roma: payload.lyric.romalrc?.lines,
		});

		this.dispatch("rawlyric", rawLyricData);

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
		if (!this.baseLyric) return;

		if (this.currentOffset === 0) {
			this.dispatch("update", this.baseLyric);
			return;
		}

		const adjustedLyric = this.applyOffset(this.baseLyric, this.currentOffset);
		this.dispatch("update", adjustedLyric);
	}

	/**
	 * 时间轴平移计算
	 *
	 * 正数 offset 表示歌词提前显示
	 *
	 * 和 v3 不同，v3 修改 offset 后会直接修改 store 中的歌词时间戳，
	 * 但 v2 只会修改负载属性，需要手动计算
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
		lyricObj: NonNullable<v2.LrcLoadPayload["lyric"]>,
	): AmllLyricContent | null {
		if (lyricObj.yrc?.lyric) {
			const yrcLines = parseYrc(lyricObj.yrc.lyric);

			if (yrcLines.length > 0) {
				const tTexts = lyricObj.tlyric?.lines?.map((l) => l.lyric) ?? [];
				const romaTexts = lyricObj.romalrc?.lines?.map((l) => l.lyric) ?? [];

				return {
					format: "structured",
					lines: mergeSubLyrics(yrcLines, tTexts, romaTexts),
				};
			}
		}

		if (
			lyricObj.lrc &&
			Array.isArray(lyricObj.lrc.lines) &&
			lyricObj.lrc.lines.length > 0
		) {
			const rawLrc: LrcLine[] = lyricObj.lrc.lines.map((l) => ({
				time: l.time * 1000,
				text: l.lyric,
			}));
			const tTexts = lyricObj.tlyric?.lines?.map((l) => l.lyric) ?? [];
			const romaTexts = lyricObj.romalrc?.lines?.map((l) => l.lyric) ?? [];

			return {
				format: "structured",
				lines: buildAmllLyricLines(rawLrc, tTexts, romaTexts),
			};
		}

		return null;
	}
}
