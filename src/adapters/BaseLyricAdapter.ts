import type { AmllLyricContent } from "@/types/ws";

export abstract class BaseLyricAdapter {
	/**
	 * 当歌词更新时触发的回调
	 */
	protected onLyricUpdate: ((lyric: AmllLyricContent | null) => void) | null =
		null;

	/**
	 * 订阅歌词更新
	 */
	public subscribe(callback: (lyric: AmllLyricContent | null) => void): void {
		this.onLyricUpdate = callback;
	}

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
