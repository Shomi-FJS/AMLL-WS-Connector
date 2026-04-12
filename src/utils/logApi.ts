import type { LogEntry, LogLevel } from "./logger";
import { getLoggerStore } from "./logger";

export interface LogExportOptions {
	level?: LogLevel;
	tag?: string;
	recent?: number;
	format?: "json" | "text";
}

export interface McpConsoleMessage {
	id: number;
	type: "log" | "debug" | "info" | "error" | "warn";
	timestamp: number;
	text: string;
	args?: unknown[];
}

export interface McpListLogsOptions {
	pageIdx?: number;
	pageSize?: number;
	types?: LogLevel[];
	tag?: string;
	includePreservedMessages?: boolean;
}

export interface McpListLogsResult {
	messages: McpConsoleMessage[];
	total: number;
	pageIdx: number;
	pageSize: number;
}

function levelToMcpType(level: LogLevel): McpConsoleMessage["type"] {
	switch (level) {
		case "debug":
			return "debug";
		case "info":
			return "info";
		case "warn":
			return "warn";
		case "error":
			return "error";
		default:
			return "log";
	}
}

let messageIdCounter = 0;

export function exportLogs(options: LogExportOptions = {}): LogEntry[] | string {
	const store = getLoggerStore();
	if (!store) {
		return [];
	}

	let entries = store.getAll();

	if (options.level) {
		entries = entries.filter((e) => e.level === options.level);
	}

	if (options.tag) {
		entries = entries.filter((e) => e.tag === options.tag);
	}

	if (options.recent && options.recent > 0) {
		entries = entries.slice(-options.recent);
	}

	if (options.format === "text") {
		return entries
			.map((e) => {
				const time = new Date(e.timestamp).toISOString();
				const args =
					e.args.length > 0
						? ` ${e.args
								.map((a) =>
									typeof a === "object"
										? JSON.stringify(a)
										: String(a),
								)
								.join(" ")}`
						: "";
				return `[${time}] [${e.level.toUpperCase()}] [${e.tag}] ${e.message}${args}`;
			})
			.join("\n");
	}

	return entries;
}

export function clearLogs(): void {
	const store = getLoggerStore();
	if (store) {
		store.clear();
	}
}

export function getLogStats(): {
	total: number;
	byLevel: Record<LogLevel, number>;
	tags: string[];
} {
	const store = getLoggerStore();
	if (!store) {
		return {
			total: 0,
			byLevel: { debug: 0, info: 0, warn: 0, error: 0 },
			tags: [],
		};
	}

	const entries = store.getAll();
	const byLevel: Record<LogLevel, number> = {
		debug: 0,
		info: 0,
		warn: 0,
		error: 0,
	};
	const tagSet = new Set<string>();

	for (const e of entries) {
		byLevel[e.level]++;
		tagSet.add(e.tag);
	}

	return {
		total: entries.length,
		byLevel,
		tags: Array.from(tagSet),
	};
}

export function listLogsMcp(options: McpListLogsOptions = {}): McpListLogsResult {
	const store = getLoggerStore();
	if (!store) {
		return {
			messages: [],
			total: 0,
			pageIdx: options.pageIdx ?? 0,
			pageSize: options.pageSize ?? 100,
		};
	}

	let entries = store.getAll();

	if (options.types && options.types.length > 0) {
		entries = entries.filter((e) => options.types!.includes(e.level));
	}

	if (options.tag) {
		entries = entries.filter((e) => e.tag === options.tag);
	}

	const total = entries.length;
	const pageIdx = options.pageIdx ?? 0;
	const pageSize = options.pageSize ?? 100;
	const start = pageIdx * pageSize;
	const end = start + pageSize;
	const pageEntries = entries.slice(start, end);

	const messages: McpConsoleMessage[] = pageEntries.map((e) => ({
		id: ++messageIdCounter,
		type: levelToMcpType(e.level),
		timestamp: e.timestamp,
		text: `[${e.tag}] ${e.message}`,
		args: e.args.length > 0 ? e.args : undefined,
	}));

	return {
		messages,
		total,
		pageIdx,
		pageSize,
	};
}

export function getLogById(id: number): McpConsoleMessage | null {
	const store = getLoggerStore();
	if (!store) return null;

	const entries = store.getAll();
	const entry = entries.find((_, idx) => idx === id - 1);
	if (!entry) return null;

	return {
		id,
		type: levelToMcpType(entry.level),
		timestamp: entry.timestamp,
		text: `[${entry.tag}] ${entry.message}`,
		args: entry.args.length > 0 ? entry.args : undefined,
	};
}

export function setupGlobalLogAPI(): void {
	const api = {
		exportLogs,
		clearLogs,
		getLogStats,
		getStore: getLoggerStore,
		listLogs: listLogsMcp,
		getLogById,
	};

	(window as unknown as { AMLL_LOG_API: typeof api }).AMLL_LOG_API = api;

	console.info(
		"[Logger] 日志 API 已挂载到 window.AMLL_LOG_API，可通过 MCP 调用：",
	);
	console.info("  MCP evaluate_script 示例:");
	console.info("  - AMLL_LOG_API.listLogs({ pageSize: 50 })");
	console.info("  - AMLL_LOG_API.listLogs({ types: ['error', 'warn'] })");
	console.info("  - AMLL_LOG_API.exportLogs({ format: 'text' })");
	console.info("  - AMLL_LOG_API.getLogStats()");
}
