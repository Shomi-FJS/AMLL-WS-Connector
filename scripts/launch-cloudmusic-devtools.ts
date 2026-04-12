import { existsSync } from "node:fs";
import { spawn } from "node:child_process";
import {
	getNumberArg,
	getPrimaryInputArg,
	getStringArg,
	parseCliArgs,
} from "./devtools-utils";

const DEFAULT_CANDIDATES = [
	"D:\\Cloudmusic_32\\CloudMusic\\cloudmusic.exe",
	"C:\\Program Files (x86)\\Netease\\CloudMusic\\cloudmusic.exe",
	"C:\\Program Files\\Netease\\CloudMusic\\cloudmusic.exe",
];

function pickExecutable(explicitPath?: string): string {
	const candidates = [
		explicitPath,
		process.env.CLOUDMUSIC_EXE,
		...DEFAULT_CANDIDATES,
	].filter((value): value is string => Boolean(value));

	const resolved = candidates.find((candidate) => existsSync(candidate));
	if (!resolved) {
		throw new Error(
			`找不到 cloudmusic.exe。请通过 --exe 指定路径，例如 --exe "D:\\Cloudmusic_32\\CloudMusic\\cloudmusic.exe"`,
		);
	}
	return resolved;
}

async function main() {
	const args = parseCliArgs();
	const exePath = pickExecutable(
		getPrimaryInputArg(args, "exe", "path") ?? getStringArg(args, "exe", "path"),
	);
	const port = getNumberArg(args, ["remote-debugging-port", "port"], 9222);

	const child = spawn(exePath, [`--remote-debugging-port=${port}`], {
		detached: true,
		stdio: "ignore",
		windowsHide: false,
	});
	child.unref();

	console.log(
		JSON.stringify(
			{
				exePath,
				port,
				debugEndpoint: `http://127.0.0.1:${port}`,
			},
			null,
			2,
		),
	);
}

main().catch((error) => {
	console.error("[devtools:launch] 启动失败:", error);
	process.exitCode = 1;
});
