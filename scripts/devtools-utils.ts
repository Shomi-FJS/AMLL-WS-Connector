import CDP, {
	type DevtoolsListTarget,
	type RemoteInterfaceOptions,
} from "chrome-remote-interface";

export interface CliArgs {
	_: string[];
	[key: string]: boolean | string | string[];
}

export interface DebugEndpoint {
	host: string;
	port: number;
	secure: boolean;
}

export interface ResolvedDevtoolsTarget {
	endpoint: DebugEndpoint;
	input?: string;
	target?: DevtoolsListTarget;
	targetId?: string;
	webSocketDebuggerUrl?: string;
}

export const DEFAULT_DEBUG_ENDPOINT: DebugEndpoint = {
	host: "127.0.0.1",
	port: 9222,
	secure: false,
};

export function parseCliArgs(argv = process.argv.slice(2)): CliArgs {
	const args: CliArgs = { _: [] };

	for (let i = 0; i < argv.length; i++) {
		const raw = argv[i];
		if (!raw.startsWith("--")) {
			args._.push(raw);
			continue;
		}

		const key = raw.slice(2);
		const next = argv[i + 1];
		if (!next || next.startsWith("--")) {
			args[key] = true;
			continue;
		}

		i++;
		const existing = args[key];
		if (existing === undefined) {
			args[key] = next;
		} else if (Array.isArray(existing)) {
			existing.push(next);
		} else if (typeof existing === "string") {
			args[key] = [existing, next];
		} else {
			args[key] = [next];
		}
	}

	return args;
}

export function getStringArg(
	args: CliArgs,
	...keys: string[]
): string | undefined {
	for (const key of keys) {
		const value = args[key];
		if (typeof value === "string") {
			return value;
		}
		if (Array.isArray(value) && value.length > 0) {
			return value[value.length - 1];
		}
	}

	return undefined;
}

export function getPrimaryInputArg(
	args: CliArgs,
	...keys: string[]
): string | undefined {
	return getStringArg(args, ...keys) ?? args._[0];
}

export function getNumberArg(
	args: CliArgs,
	keys: string[],
	fallback: number,
): number {
	for (const key of keys) {
		const value = args[key];
		const raw =
			typeof value === "string"
				? value
				: Array.isArray(value) && value.length > 0
					? value[value.length - 1]
					: undefined;
		if (!raw) continue;
		const parsed = Number.parseInt(raw, 10);
		if (Number.isFinite(parsed)) {
			return parsed;
		}
	}
	return fallback;
}

export function hasFlag(args: CliArgs, ...keys: string[]): boolean {
	return keys.some((key) => args[key] === true);
}

export function parseDebugEndpoint(input?: string): DebugEndpoint {
	if (!input) {
		return { ...DEFAULT_DEBUG_ENDPOINT };
	}

	const directWs = normalizeDebuggerWebSocketUrl(input);
	if (directWs) {
		const url = new URL(directWs);
		return {
			host: url.hostname,
			port: url.port ? Number.parseInt(url.port, 10) : 80,
			secure: url.protocol === "wss:",
		};
	}

	try {
		const url = new URL(input);
		const isSecure = url.protocol === "https:";
		return {
			host: url.hostname,
			port: url.port
				? Number.parseInt(url.port, 10)
				: isSecure
					? 443
					: 80,
			secure: isSecure,
		};
	} catch {
		const hostPort = input.match(/^(?<host>[^:/?#]+):(?<port>\d+)$/);
		if (hostPort?.groups) {
			return {
				host: hostPort.groups.host,
				port: Number.parseInt(hostPort.groups.port, 10),
				secure: false,
			};
		}
	}

	return { ...DEFAULT_DEBUG_ENDPOINT };
}

export function normalizeDebuggerWebSocketUrl(
	input?: string,
): string | undefined {
	if (!input) return undefined;

	const trimmed = input.trim();
	if (!trimmed) return undefined;

	if (/^wss?:\/\//i.test(trimmed)) {
		return trimmed;
	}

	const prefixedPath = trimmed.match(
		/^(?<host>[^:/?#]+):(?<port>\d+)\/(?<path>devtools\/(?:page|browser)\/.+)$/i,
	);
	if (prefixedPath?.groups) {
		return `ws://${prefixedPath.groups.host}:${prefixedPath.groups.port}/${prefixedPath.groups.path}`;
	}

	try {
		const url = new URL(trimmed);
		const wsQuery = url.searchParams.get("ws");
		if (wsQuery) {
			const scheme = url.protocol === "https:" ? "wss" : "ws";
			return `${scheme}://${decodeURIComponent(wsQuery)}`;
		}

		if (/^\/devtools\/(?:page|browser)\//i.test(url.pathname)) {
			const scheme = url.protocol === "https:" ? "wss" : "ws";
			return `${scheme}://${url.host}${url.pathname}${url.search}`;
		}
	} catch {
		return undefined;
	}

	return undefined;
}

export function extractTargetId(input?: string): string | undefined {
	const wsUrl = normalizeDebuggerWebSocketUrl(input) ?? input;
	if (!wsUrl) return undefined;

	const match = wsUrl.match(/\/devtools\/(?:page|browser)\/([^/?#]+)/i);
	return match?.[1];
}

export function isDevtoolsFrontendTarget(target: DevtoolsListTarget): boolean {
	const haystack = [
		target.title,
		target.url,
		target.devtoolsFrontendUrl,
		target.description,
	]
		.filter(Boolean)
		.join(" ")
		.toLowerCase();

	return (
		haystack.includes("devtools://") ||
		haystack.includes("/devtools/inspector.html") ||
		haystack.includes("chrome-devtools://") ||
		haystack.includes("devtools - ")
	);
}

export function isInspectableTarget(target: DevtoolsListTarget): boolean {
	return Boolean(target.webSocketDebuggerUrl) && !isDevtoolsFrontendTarget(target);
}

export function scoreTarget(target: DevtoolsListTarget): number {
	let score = 0;
	if (target.type === "page") score += 100;
	if (target.url && !target.url.startsWith("about:blank")) score += 20;
	if (target.url?.includes("music.163.com")) score += 10;
	if (target.title?.trim()) score += 5;
	return score;
}

export async function fetchTargets(
	endpoint: DebugEndpoint,
): Promise<DevtoolsListTarget[]> {
	const options: RemoteInterfaceOptions = {
		host: endpoint.host,
		port: endpoint.port,
		secure: endpoint.secure,
	};
	return CDP.List(options);
}

export async function resolveDevtoolsTarget(options: {
	input?: string;
	targetId?: string;
	urlContains?: string;
} = {}): Promise<ResolvedDevtoolsTarget> {
	const endpoint = parseDebugEndpoint(options.input);
	const directWebSocket = normalizeDebuggerWebSocketUrl(options.input);
	const requestedTargetId = options.targetId ?? extractTargetId(options.input);

	if (directWebSocket) {
		let target: DevtoolsListTarget | undefined;
		try {
			const targets = await fetchTargets(endpoint);
			target = targets.find((item) => item.id === requestedTargetId);
		} catch {
			// Direct WebSocket still works even if the list endpoint is unavailable.
		}

		return {
			endpoint,
			input: options.input,
			target,
			targetId: requestedTargetId,
			webSocketDebuggerUrl: directWebSocket,
		};
	}

	const targets = await fetchTargets(endpoint);
	const filtered = targets.filter((target) => {
		if (!isInspectableTarget(target)) return false;
		if (requestedTargetId && target.id !== requestedTargetId) return false;
		if (options.urlContains) {
			const needle = options.urlContains.toLowerCase();
			const haystack = `${target.title} ${target.url}`.toLowerCase();
			return haystack.includes(needle);
		}
		return true;
	});

	const target = [...filtered].sort((left, right) => scoreTarget(right) - scoreTarget(left))[0];

	if (!target?.webSocketDebuggerUrl) {
		throw new Error(
			`在 ${endpoint.host}:${endpoint.port} 没有找到可直连的真实 target。当前通常意味着你连到的是 DevTools 前端壳页面，而不是网易云的被调试页。`,
		);
	}

	return {
		endpoint,
		input: options.input,
		target,
		targetId: target.id,
		webSocketDebuggerUrl: target.webSocketDebuggerUrl,
	};
}

export function formatTargetSummary(
	resolved: ResolvedDevtoolsTarget,
): Record<string, unknown> {
	return {
		endpoint: `${resolved.endpoint.secure ? "https" : "http"}://${resolved.endpoint.host}:${resolved.endpoint.port}`,
		targetId: resolved.targetId ?? null,
		title: resolved.target?.title ?? null,
		type: resolved.target?.type ?? null,
		url: resolved.target?.url ?? null,
		webSocketDebuggerUrl: resolved.webSocketDebuggerUrl ?? null,
	};
}

export function toProxyWebSocketUrl(
	listenHost: string,
	listenPort: number,
	upstreamWebSocketUrl: string,
): string {
	const upstream = new URL(upstreamWebSocketUrl);
	return `ws://${listenHost}:${listenPort}${upstream.pathname}${upstream.search}`;
}

export function toUpstreamWebSocketUrl(
	endpoint: DebugEndpoint,
	pathnameAndSearch: string,
): string {
	return `${endpoint.secure ? "wss" : "ws"}://${endpoint.host}:${endpoint.port}${pathnameAndSearch}`;
}

export async function proxyJsonRequest(
	endpoint: DebugEndpoint,
	pathnameAndSearch: string,
): Promise<unknown> {
	const url = `${endpoint.secure ? "https" : "http"}://${endpoint.host}:${endpoint.port}${pathnameAndSearch}`;
	const response = await fetch(url);
	if (!response.ok) {
		throw new Error(`上游 CDP 请求失败: ${response.status} ${response.statusText}`);
	}
	return response.json();
}
