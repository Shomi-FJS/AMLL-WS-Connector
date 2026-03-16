import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type manifestData from "../manifest.json";
import type packageJsonData from "../package.json";

const packageJsonPath = join(process.cwd(), "package.json");
const manifestJsonPath = join(process.cwd(), "manifest.json");

const packageJson: typeof packageJsonData = JSON.parse(
	readFileSync(packageJsonPath, "utf-8"),
);
const manifestJson: typeof manifestData = JSON.parse(
	readFileSync(manifestJsonPath, "utf-8"),
);

if (manifestJson.version !== packageJson.version) {
	manifestJson.version = packageJson.version;
	writeFileSync(
		manifestJsonPath,
		`${JSON.stringify(manifestJson, null, "\t")}\n`,
	);
	console.log(`同步 manifest.json 版本到 ${packageJson.version}`);
}
