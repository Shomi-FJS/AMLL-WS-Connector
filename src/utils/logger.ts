export type LogLevel = "debug" | "info" | "warn" | "error";

export interface LogEntry {
	timestamp: number;
	level: LogLevel;
	tag: string;
	message: string;
	args: unknown[];
}

export interface LoggerOptions {
	maxEntries?: number;
	enableConsole?: boolean;
}

const MAX_ENTRIES_DEFAULT = 1000;

class LoggerStore {
	private entries: LogEntry[] = [];
	private maxEntries: number;
	private enableConsole: boolean;

	constructor(options: LoggerOptions = {}) {
		this.maxEntries = options.maxEntries ?? MAX_ENTRIES_DEFAULT;
		this.enableConsole = options.enableConsole ?? true;
	}

	add(entry: LogEntry): void {
		this.entries.push(entry);

		if (this.entries.length > this.maxEntries) {
			this.entries = this.entries.slice(-this.maxEntries);
		}

		if (this.enableConsole) {
			const prefix = `[${entry.tag}]`;
			switch (entry.level) {
				case "debug":
					console.debug(prefix, entry.message, ...entry.args);
					break;
				case "info":
					console.info(prefix, entry.message, ...entry.args);
					break;
				case "warn":
					console.warn(prefix, entry.message, ...entry.args);
					break;
				case "error":
					console.error(prefix, entry.message, ...entry.args);
					break;
			}
		}
	}

	getAll(): LogEntry[] {
		return [...this.entries];
	}

	getRecent(count: number): LogEntry[] {
		return this.entries.slice(-count);
	}

	getByLevel(level: LogLevel): LogEntry[] {
		return this.entries.filter((e) => e.level === level);
	}

	getByTag(tag: string): LogEntry[] {
		return this.entries.filter((e) => e.tag === tag);
	}

	clear(): void {
		this.entries = [];
	}

	getCount(): number {
		return this.entries.length;
	}
}

let globalStore: LoggerStore | null = null;

export function initLogger(options?: LoggerOptions): LoggerStore {
	if (globalStore) {
		return globalStore;
	}

	globalStore = new LoggerStore(options);

	(window as unknown as { __AMLL_LOGGER__: LoggerStore }).__AMLL_LOGGER__ =
		globalStore;

	return globalStore;
}

export function getLoggerStore(): LoggerStore | null {
	return globalStore;
}

export function createLogger(tag: string) {
	const log =
		(level: LogLevel) =>
		(message: string, ...args: unknown[]): void => {
			if (!globalStore) {
				console.warn(
					"[Logger] 日志系统未初始化，请先调用 initLogger()",
				);
				return;
			}

			globalStore.add({
				timestamp: Date.now(),
				level,
				tag,
				message,
				args,
			});
		};

	return {
		debug: log("debug"),
		info: log("info"),
		warn: log("warn"),
		error: log("error"),
	};
}

export type Logger = ReturnType<typeof createLogger>;
