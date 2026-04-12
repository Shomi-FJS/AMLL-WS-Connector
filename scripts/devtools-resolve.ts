import {
	formatTargetSummary,
	getPrimaryInputArg,
	getStringArg,
	parseCliArgs,
	resolveDevtoolsTarget,
} from "./devtools-utils";

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
	const resolved = await resolveDevtoolsTarget({
		input,
		targetId,
		urlContains,
	});

	console.log(JSON.stringify(formatTargetSummary(resolved), null, 2));
}

main().catch((error) => {
	console.error("[devtools:resolve] 解析失败:", error);
	process.exitCode = 1;
});
