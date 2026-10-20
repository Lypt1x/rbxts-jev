import { readFileSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function loadEnvFile(path) {
	if (!existsSync(path)) return;
	for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
		const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line);
		if (match && process.env[match[1]] === undefined) {
			process.env[match[1]] = match[2].replace(/^["']|["']$/g, "");
		}
	}
}

loadEnvFile(join(root, ".env"));

const required = ["ROBLOX_API_KEY", "ROBLOX_UNIVERSE_ID", "ROBLOX_PLACE_ID"];
const missing = required.filter((name) => !process.env[name]);
if (missing.length > 0) {
	console.error(`Missing ${missing.join(", ")}. Put them in .env or the environment.`);
	process.exit(2);
}

const apiKey = process.env.ROBLOX_API_KEY;
const universeId = process.env.ROBLOX_UNIVERSE_ID;
const placeId = process.env.ROBLOX_PLACE_ID;
const scriptName = process.argv[2] ?? "wire";
const placeFile = join(root, "test", "fixture", "fixture.rbxl");
const scriptFile = join(root, "test", "studio", `${scriptName}.luau`);

if (!existsSync(placeFile)) {
	console.error("test/fixture/fixture.rbxl is missing. Run scripts/build-place.sh first.");
	process.exit(2);
}
if (!existsSync(scriptFile)) {
	console.error(`No script at ${scriptFile}.`);
	process.exit(2);
}

const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

async function call(method, url, init = {}) {
	const response = await fetch(url, {
		method,
		...init,
		headers: { "x-api-key": apiKey, ...(init.headers ?? {}) },
	});
	const text = await response.text();
	if (!response.ok) {
		throw new Error(`${method} ${url.replace(/\/\/[^/]+/, "")} -> ${response.status} ${text.slice(0, 400)}`);
	}
	return text.length > 0 ? JSON.parse(text) : {};
}

async function uploadSavedVersion() {
	const url = `https://apis.roblox.com/universes/v1/${universeId}/places/${placeId}/versions?versionType=Saved`;
	const result = await call("POST", url, {
		headers: { "content-type": "application/octet-stream" },
		body: readFileSync(placeFile),
	});
	if (typeof result.versionNumber !== "number") {
		throw new Error(`Upload returned no versionNumber: ${JSON.stringify(result)}`);
	}
	return result.versionNumber;
}

async function createTask(version) {
	const url = `https://apis.roblox.com/cloud/v2/universes/${universeId}/places/${placeId}/versions/${version}/luau-execution-session-tasks`;
	return call("POST", url, {
		headers: { "content-type": "application/json" },
		body: JSON.stringify({ script: readFileSync(scriptFile, "utf8"), timeout: "120s" }),
	});
}

async function waitForTask(taskPath) {
	const url = `https://apis.roblox.com/cloud/v2/${taskPath}`;
	for (let attempt = 0; attempt < 120; attempt += 1) {
		const task = await call("GET", url);
		if (task.state === "COMPLETE" || task.state === "FAILED" || task.state === "CANCELLED") {
			return task;
		}
		await sleep(2000);
	}
	throw new Error("The task did not finish within four minutes.");
}

async function readLogs(taskPath) {
	const lines = [];
	let pageToken = "";
	do {
		const query = pageToken ? `?pageToken=${encodeURIComponent(pageToken)}` : "";
		const page = await call("GET", `https://apis.roblox.com/cloud/v2/${taskPath}/logs${query}`);
		for (const chunk of page.luauExecutionSessionTaskLogs ?? []) {
			lines.push(...(chunk.messages ?? []));
		}
		pageToken = page.nextPageToken ?? "";
	} while (pageToken);
	return lines;
}

const version = await uploadSavedVersion();
console.log(`uploaded saved version ${version}`);

const created = await createTask(version);
console.log(`task ${created.path}`);

const task = await waitForTask(created.path);
const logs = await readLogs(task.path);
for (const line of logs) {
	if (/^(PASS|FAIL|ENCODED|RESULT|HttpEnabled|model=)/.test(line)) console.log(line);
}

if (task.state !== "COMPLETE") {
	console.error(`task ${task.state}: ${task.error?.code ?? ""} ${task.error?.message ?? ""}`);
	process.exit(1);
}

process.exit(logs.includes("RESULT failures=0") ? 0 : 1);
