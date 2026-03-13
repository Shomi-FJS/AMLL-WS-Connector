import type { AmllLyricContent } from "@/types/ws";
import { TypedEventTarget } from "@/utils/TypedEventTarget";

export interface LyricAdapterEventMap {
	/** 当歌词解析完成或发生时间轴偏移时派发 */
	update: CustomEvent<AmllLyricContent | null>;
}

export abstract class BaseLyricAdapter extends TypedEventTarget<LyricAdapterEventMap> {
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
	 * 触发客户端获取当前歌曲的歌词
	 */
	public abstract fetchLyric(): void;
}
