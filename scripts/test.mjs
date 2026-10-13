import { spawnSync } from "node:child_process";
import esbuild from "esbuild";
import { mkdtempSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const tests = readdirSync("tests").filter((name) => name.endsWith(".test.ts"));
const dir = mkdtempSync(join(tmpdir(), "super-tutor-test-"));
const outfiles = [];

for (const name of tests) {
	const outfile = join(dir, name.replace(/\.ts$/, ".cjs"));
	await esbuild.build({
		entryPoints: [join("tests", name)],
		bundle: true,
		platform: "node",
		format: "cjs",
		external: ["node:test", "node:assert", "node:assert/strict"],
		outfile,
		logLevel: "silent",
	});
	outfiles.push(outfile);
}

const result = spawnSync(process.execPath, ["--test", ...outfiles], { stdio: "inherit" });
process.exit(result.status ?? 1);
