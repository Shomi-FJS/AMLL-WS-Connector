import type { LyricSearchStatus, RawLyricData } from "@/store";
import type { SongInfo } from "@/types/inflink";
import type { AmllLyricContent } from "@/types/ws";
import { TypedEventTarget } from "@/utils/TypedEventTarget";

export interface LyricAdapterEventMap {
	/** 当歌词解析完成或发生时间轴偏移时派发 */
	update: CustomEvent<AmllLyricContent | null>;
	/** 歌词获取状态变更时触发 */
	statuschange: CustomEvent<Record<string, LyricSearchStatus>>;
	/** 获取到原始歌词数据时派发 */
	rawlyric: CustomEvent<RawLyricData | null>;
	/** 原始歌词数据字典变更时触发 */
	rawlyricchange: CustomEvent<Record<string, RawLyricData | null>>;
}

export abstract class BaseLyricAdapter extends TypedEventTarget<LyricAdapterEventMap> {
	/**
	 * 适配器的唯一标识符，对应 LyricSource 的 id
	 */
	public abstract readonly id: string;

	/**
	 * 初始化适配器并开始监听客户端状态
	 * @returns 是否初始化成功
	 */
	public abstract init(): Promise<boolean>;

	/**
	 * 销毁适配器，清理副作用（如取消事件订阅）
	 */
	public abstract destroy(): void;

	/**
	 * 触发获取当前歌曲的歌词
	 * @param songInfo 完整的歌曲信息
	 */
	public abstract fetchLyric(songInfo: SongInfo): void | Promise<void>;
}
