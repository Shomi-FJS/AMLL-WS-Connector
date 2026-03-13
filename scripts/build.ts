import { watch } from "node:fs";
import { cp, mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { build, file } from "bun";

const PROJECT_ROOT = path.resolve(import.meta.dir, "..");
const SRC_DIR = path.join(PROJECT_ROOT, "src");
const SRC_ENTRY = path.join(SRC_DIR, "index.tsx");
const DIST_DIR = path.join(PROJECT_ROOT, "dist");
const MANIFEST_SRC = path.join(PROJECT_ROOT, "manifest.json");
const PREVIEW_SRC = path.join(PROJECT_ROOT, "preview.png");
const DEFAULT_PLUGIN_DIR = "C:/betterncm/plugins_dev/amll-ws-connector";
const DEV_PLUGIN_DIR = process.env.BETTERNCM_PLUGIN_PATH || DEFAULT_PLUGIN_DIR;

const args = process.argv.slice(2);
const isDev = args.includes("--dev");
const isWatch = args.includes("--watch");

const packageJson = await file(path.join(PROJECT_ROOT, "package.json")).json();
const APP_VERSION = packageJson.version;

async function copyAssets() {
	const safeCopy = async (src: string, dest: string) => {
		if (await file(src).exists()) await cp(src, dest);
	};

	await safeCopy(MANIFEST_SRC, path.join(DIST_DIR, "manifest.json"));
	await safeCopy(PREVIEW_SRC, path.join(DIST_DIR, "preview.png"));
}

async function buildFrontend() {
	const startTime = performance.now();
	try {
		console.log("⚡️ [Frontend] 正在打包代码...");

		const result = await build({
			entrypoints: [SRC_ENTRY],
			outdir: DIST_DIR,
			target: "browser",
			format: "iife",
			minify: !isDev,
			features: isDev ? ["DEV"] : [],
			define: {
				"process.env.NODE_ENV": JSON.stringify(
					isDev ? "development" : "production",
				),
				__APP_VERSION__: JSON.stringify(APP_VERSION),
				"import.meta.env": JSON.stringify({
					MODE: isDev ? "development" : "production",
					PROD: !isDev,
					DEV: isDev,
				}),
			},
		});

		if (!result.success) {
			console.error("❌ [Frontend] 构建失败:");
			console.error(result.logs.join("\n"));
			return false;
		}

		if (isDev) {
			await mkdir(DEV_PLUGIN_DIR, { recursive: true });
			await cp(DIST_DIR, DEV_PLUGIN_DIR, { recursive: true, force: true });
		}

		const duration = (performance.now() - startTime).toFixed(2);
		console.log(`✨ [Frontend] 在 ${duration}ms 内构建完毕`);
		return true;
	} catch (error) {
		console.error("❌ [Build] 发生意外错误:", error);
		return false;
	}
}

console.log(
	`\n🚀 [Build] 正在构建 AMLL WS Connector v${APP_VERSION} (${isDev ? "开发" : "生产"}模式)\n`,
);

await rm(DIST_DIR, { recursive: true, force: true });
await mkdir(DIST_DIR, { recursive: true });

await copyAssets();

const success = await buildFrontend();
if (!success && !isWatch) {
	process.exit(1);
}

if (isWatch) {
	console.log(`\n👀 [Watch] 正在监视: ${SRC_DIR}`);

	let timer: Timer | null = null;
	let isBuilding = false;

	watch(SRC_DIR, { recursive: true }, (_event, filename) => {
		if (!filename) return;

		if (timer) clearTimeout(timer);
		timer = setTimeout(async () => {
			if (isBuilding) return;
			isBuilding = true;
			console.log(`\n🔄 [Change] 文件变动: ${filename}`);
			await buildFrontend();
			isBuilding = false;
		}, 100);
	});

	setInterval(() => {}, 1 << 30);
}
