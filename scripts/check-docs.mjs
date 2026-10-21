// Compiles the TypeScript in the docs, so an example cannot drift away from the library.
//
// Shared setup defines the files every guide relies on. Each titled block is written to
// that path. The client guide then appends its `exposed` line and adds its own files.
// Every other guide is compiled as the body of one function, after the setup files.
import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const docs = join(root, "docs", "docs");
const work = join(root, ".docs-check");

function blocks(file) {
	const text = readFileSync(join(docs, file), "utf8");
	return [...text.matchAll(/```ts(?: title="([^"]*)")?\n([\s\S]*?)```/g)].map((m) => ({ title: m[1], code: m[2] }));
}

function write(path, code, append = false) {
	const full = join(work, path);
	mkdirSync(dirname(full), { recursive: true });
	if (append) writeFileSync(full, readFileSync(full, "utf8") + "\n" + code);
	else writeFileSync(full, code);
}

execFileSync("npm", ["run", "build", "--silent"], { cwd: root, stdio: "inherit" });
const packDir = join(root, ".docs-pack");
mkdirSync(packDir, { recursive: true });
// `npm pack --silent` prints the tarball's file name, so the script never hard-codes the version.
const tarballName = execFileSync("npm", ["pack", "--silent", "--pack-destination", packDir], { cwd: root })
	.toString()
	.trim()
	.split("\n")
	.pop();

rmSync(work, { recursive: true, force: true });
cpSync(join(root, "test", "fixture"), work, { recursive: true, filter: (src) => !/node_modules|[\\/]out$|[\\/]include$|\.rbxl$|package-lock/.test(src) });
rmSync(join(work, "src"), { recursive: true, force: true });

const tarball = join(packDir, tarballName);
if (!existsSync(tarball)) throw new Error(`Package tarball missing at ${tarball}`);
const pkg = JSON.parse(readFileSync(join(work, "package.json"), "utf8"));
pkg.dependencies["@rbxts/jev"] = `file:${tarball}`;
writeFileSync(join(work, "package.json"), JSON.stringify(pkg, null, 2));

for (const { title, code } of blocks("getting-started/shared-setup.md")) if (title) write(title, code);

for (const { title, code } of blocks("guides/ask-from-clients.md")) {
	if (title === "src/shared/questions.ts") write(title, code.split("\n").filter((l) => !l.startsWith("//")).join("\n"), true);
	else if (title) write(title, code);
}

// The guides share one shape. A snippet runs inside an async function that already has `player`,
// `message`, `state`, and `answers`, so those are provided here and the snippet's own imports are
// kept. Snippets that define their own function, or that are not meant to run in that frame, are
// compiled as standalone files.
const FRAME_NAMES = ["jev", "npc", "openShop", "react", "respondToThreat", "saveIntent", "showHint"];
const frames = ["guides/delegate-a-decision.md", "guides/handle-errors.md", "concepts/decisions.md"];
let n = 0;
const skipped = [];

function importedNames(imports) {
	const names = new Set();
	for (const line of imports) {
		const m = /import\s+(?:type\s+)?\{([^}]*)\}/.exec(line);
		if (m) for (const part of m[1].split(",")) names.add(part.trim().replace(/^type\s+/, "").split(" as ").pop().trim());
	}
	return names;
}

for (const file of frames) {
	for (const { title, code } of blocks(file)) {
		if (title) continue;
		n += 1;
		const lines = code.split("\n");
		const imports = lines.filter((l) => l.startsWith("import "));
		const body = lines.filter((l) => !l.startsWith("import ")).join("\n");
		const own = importedNames(imports);
		const declares = (name) => new RegExp(`\\b(?:const|let|function|class)\\s+${name}\\b|\\{[^}]*\\b${name}\\b[^}]*\\}\\s*=`).test(body);
		const provide = (name) => !own.has(name) && !declares(name);

		const preamble = [];
		const library = ["choice", "createJev", "decide", "delegate", "delegateAsync", "noul", "questions", "routeChoice", "score"]
			.filter((name) => new RegExp(`(?<![.\\w])${name}\\s*[(<]`).test(body) && provide(name) && !declares(name));
		if (library.length) preamble.push(`import { ${library.join(", ")} } from "@rbxts/jev";`);
		const gameNames = ["openShop", "react", "respondToThreat", "saveIntent", "showHint"].filter(provide);
		if (gameNames.length) preamble.push(`import { ${gameNames.join(", ")} } from "./game";`);
		if (provide("jev")) preamble.push('import { jev } from "./jev";');
		if (provide("npc")) preamble.push('import { npc } from "shared/questions";');

		const defines = /^\s*(?:export\s+)?(?:async\s+)?function\s+handleChat/m.test(body);
		const ownsState = /^\s*const\s+state\b/m.test(body);
		const ownsFrame = /\bjev\.ask\(/.test(body) && /\bconst\s*\{\s*answers\s*\}/.test(body);
		if (defines || ownsFrame) { skipped.push(`${file} block ${n}`); continue; }

		const askLine = declares("answers") ? "" : "const state = { message };\nconst { answers } = await jev.ask(state, npc);";
		const unused = [...gameNames, "answers"].filter((x) => x !== "answers" || askLine).join(", ");
		write(
			`src/server/snippet${n}.ts`,
			`${[...imports, ...preamble].join("\n")}\nexport async function snippet${n}(player: Player, message: string) {\n${askLine}\n${unused ? `void [${unused}];` : ""}\n${body}\n}\n`,
		);
	}
}
if (skipped.length) console.log(`skipped (they define their own function): ${skipped.join(", ")}`);

// Whole-file examples compile as they are.
const quick = blocks("getting-started/quick-start.md").find((b) => !b.title && b.code.includes("createJev("));
if (!quick) throw new Error("quick-start.md has no complete example to compile");
write("src/server/quickstart.server.ts", quick.code);

// The concepts page builds one file from its first three blocks: define `ticket`, then use it.
const qa = blocks("concepts/questions-and-answers.md").filter((b) => !b.title);
const ticketDef = qa.find((b) => b.code.includes('questions("ticket"'));
const ticketUse = qa.find((b) => b.code.includes("jev.ask(state, ticket)"));
const ticketType = qa.find((b) => b.code.includes("AnswersOf<"));
if (!ticketDef || !ticketUse || !ticketType) throw new Error("questions-and-answers.md lost one of its ticket examples");
const stripImports = (code) => code.split("\n").filter((l) => !l.startsWith("import ")).join("\n");
write(
	"src/server/ticket.ts",
	`import { choice, noul, questions, score } from "@rbxts/jev";\nimport type { AnswersOf } from "@rbxts/jev";\nimport { jev } from "./jev";\n\n` +
		`${stripImports(ticketDef.code)}\n\nexport async function useTicket() {\n${stripImports(ticketUse.code)}\n}\n\n${stripImports(ticketType.code)}\n`,
);
n += 2;

execFileSync("npm", ["install", "--silent", "--no-audit", "--no-fund"], { cwd: work, stdio: "inherit" });
try {
	execFileSync("npx", ["rbxtsc"], { cwd: work, stdio: "inherit" });
	console.log(`docs check passed: ${n - skipped.length} snippet(s) plus the setup files compile`);
} finally {
	rmSync(work, { recursive: true, force: true });
	rmSync(join(root, ".docs-pack"), { recursive: true, force: true });
}
