import CDP from "chrome-remote-interface";
import {
	formatTargetSummary,
	getPrimaryInputArg,
	getStringArg,
	hasFlag,
	parseCliArgs,
	resolveDevtoolsTarget,
} from "./devtools-utils";

type RuntimeConsoleCall = {
	type?: string;
	args?: Array<{ value?: unknown; description?: string; type?: string }>;
	timestamp?: number;
	stackTrace?: {
		callFrames?: Array<{
			url?: string;
			functionName?: string;
			lineNumber?: number;
			columnNumber?: number;
		}>;
	};
};

type RuntimeExceptionThrown = {
	timestamp?: number;
	exceptionDetails?: {
		text?: string;
		url?: string;
		lineNumber?: number;
		columnNumber?: number;
		exception?: {
			description?: string;
			value?: unknown;
		};
		stackTrace?: RuntimeConsoleCall["stackTrace"];
	};
};

type LogEntryAdded = {
	entry?: {
		level?: string;
		text?: string;
		source?: string;
		url?: string;
		lineNumber?: number;
	};
};

function formatTimestamp(timestamp?: number): string {
	if (!timestamp) return new Date().toISOString();
	const millis = timestamp > 1e12 ? timestamp : timestamp * 1000;
	return new Date(millis).toISOString();
}

function formatArgs(
	args: RuntimeConsoleCall["args"] = [],
): string {
	return args
		.map((arg) => {
			if ("value" in arg && arg.value !== undefined) {
				return typeof arg.value === "string"
					? arg.value
					: JSON.stringify(arg.value);
			}
			return arg.description ?? arg.type ?? "<unserializable>";
		})
		.join(" ");
}

function formatTopFrame(stackTrace?: RuntimeConsoleCall["stackTrace"]): string {
	const frame = stackTrace?.callFrames?.[0];
	if (!frame) return "";
	const location = frame.url
		? `${frame.url}:${(frame.lineNumber ?? 0) + 1}:${(frame.columnNumber ?? 0) + 1}`
		: "unknown";
	return frame.functionName ? `${frame.functionName} @ ${location}` : location;
}

async function main() {
	const args = parseCliArgs();
	const input = getPrimaryInputArg(
		args,
		"target",
		"input",
		"url",
		"ws",
		"endpoint",
	);
	const targetId = getStringArg(args, "target-id");
	const urlContains = getStringArg(args, "url-contains");
	const jsonOutput = hasFlag(args, "json");
	const resolved = await resolveDevtoolsTarget({
		input,
		targetId,
		urlContains,
	});

	if (!resolved.webSocketDebuggerUrl) {
		throw new Error("没有可用的 WebSocket 调试地址");
	}

	console.log(
		`[devtools:tail] 已直连真实 target:\n${JSON.stringify(formatTargetSummary(resolved), null, 2)}`,
	);

	const client = await CDP({
		target: resolved.webSocketDebuggerUrl,
	});

	const shutdown = async () => {
		await client.close();
		process.exit(0);
	};

	process.on("SIGINT", () => void shutdown());
	process.on("SIGTERM", () => void shutdown());

	client.Runtime.consoleAPICalled((params: unknown) => {
		const payload = params as RuntimeConsoleCall;
		const message = {
			kind: "console",
			level: payload.type ?? "log",
			timestamp: formatTimestamp(payload.timestamp),
			text: formatArgs(payload.args),
			frame: formatTopFrame(payload.stackTrace),
		};

		if (jsonOutput) {
			console.log(JSON.stringify(message));
			return;
		}

		console.log(
			`[${message.timestamp}] [console:${message.level}] ${message.text}${message.frame ? ` @ ${message.frame}` : ""}`,
		);
	});

	client.Runtime.exceptionThrown((params: unknown) => {
		const payload = params as RuntimeExceptionThrown;
		const details = payload.exceptionDetails;
		const text =
			details?.exception?.description ??
			(typeof details?.exception?.value === "string"
				? details.exception.value
				: details?.text) ??
			"Unknown exception";
		const location = details?.url
			? `${details.url}:${(details.lineNumber ?? 0) + 1}:${(details.columnNumber ?? 0) + 1}`
			: formatTopFrame(details?.stackTrace);
		const message = {
			kind: "exception",
			timestamp: formatTimestamp(payload.timestamp),
			text,
			location,
		};

		if (jsonOutput) {
			console.log(JSON.stringify(message));
			return;
		}

		console.log(
			`[${message.timestamp}] [exception] ${message.text}${message.location ? ` @ ${message.location}` : ""}`,
		);
	});

	client.Log.entryAdded((params: unknown) => {
		const payload = params as LogEntryAdded;
		const entry = payload.entry;
		const location = entry?.url
			? `${entry.url}:${(entry.lineNumber ?? 0) + 1}`
			: entry?.source ?? "";
		const message = {
			kind: "log",
			level: entry?.level ?? "info",
			timestamp: new Date().toISOString(),
			text: entry?.text ?? "",
			location,
		};

		if (jsonOutput) {
			console.log(JSON.stringify(message));
			return;
		}

		console.log(
			`[${message.timestamp}] [log:${message.level}] ${message.text}${message.location ? ` @ ${message.location}` : ""}`,
		);
	});

	await client.Runtime.enable();
	await client.Log.enable();

	console.log("[devtools:tail] 已订阅 Runtime/Log 事件，按 Ctrl+C 结束。");
}

main().catch((error) => {
	console.error("[devtools:tail] 监听失败:", error);
	process.exitCode = 1;
});
