import type { AskResult } from "../core/answers";
import { toJevError } from "../core/errors";
import type { JsonValue } from "../core/json";
import { REMOTE_FOLDER, PREVIEW_REMOTE, REQUEST_REMOTE, isRemoteRequest, type RemoteReply } from "../core/protocol";
import { describeQuestionSet, type DefinitionSummary, type QuestionMap, type QuestionSet } from "../core/questions";
import type { ExposeOptions, Exposed, ExposedSets } from "./types";
import type { Jev } from "./types";

interface Bucket {
	tokens: number;
	last: number;
}

function ensureFolder(parent: Instance): Folder {
	const existing = parent.FindFirstChild(REMOTE_FOLDER);
	if (existing !== undefined) {
		return existing as Folder;
	}
	const folder = new Instance("Folder");
	folder.Name = REMOTE_FOLDER;
	folder.Parent = parent;
	return folder;
}

function ensureRemote(folder: Folder, name: string): RemoteFunction {
	const existing = folder.FindFirstChild(name);
	if (existing !== undefined) {
		return existing as RemoteFunction;
	}
	const remote = new Instance("RemoteFunction");
	remote.Name = name;
	remote.Parent = folder;
	return remote;
}

/** Exposes named question sets to clients. A client can only send a name and a
 * state; it can never send instructions or pick a model. */
export function exposeJev<E extends ExposedSets>(jev: Jev, sets: E, options: ExposeOptions = {}): Exposed<E> {
	const parent = options.parent ?? game.GetService("ReplicatedStorage");
	const folder = ensureFolder(parent as Instance);
	const requestRemote = ensureRemote(folder, REQUEST_REMOTE);
	const previewRemote = ensureRemote(folder, PREVIEW_REMOTE);

	const names = new Array<string>();
	const summaries = new Array<DefinitionSummary>();
	for (const [key, set] of pairs(sets as unknown as { [key: string]: defined })) {
		const name = tostring(key);
		names.push(name);
		summaries.push(describeQuestionSet(set as unknown as QuestionSet<QuestionMap, string>));
	}

	const buckets = new Map<number, Bucket>();
	const limit = options.perPlayer;

	function allow(player: Player, nowMs: number): boolean {
		if (limit === undefined) {
			return true;
		}
		const rpm = limit.requestsPerMinute > 1 ? limit.requestsPerMinute : 1;
		const burst = limit.burst ?? (rpm >= 4 ? rpm / 4 : 1);
		const id = player.UserId;
		let bucket = buckets.get(id);
		if (bucket === undefined) {
			bucket = { tokens: burst, last: nowMs };
			buckets.set(id, bucket);
		}
		const elapsed = nowMs - bucket.last;
		if (elapsed > 0) {
			const refilled = bucket.tokens + elapsed * (rpm / 60000);
			bucket.tokens = refilled > burst ? burst : refilled;
			bucket.last = nowMs;
		}
		if (bucket.tokens < 1) {
			return false;
		}
		bucket.tokens -= 1;
		return true;
	}

	requestRemote.OnServerInvoke = (player: Player, payload: unknown): RemoteReply => {
		if (!isRemoteRequest(payload)) {
			return { ok: false, kind: "validation", message: "Malformed request." };
		}
		const set = (sets as unknown as { [key: string]: QuestionSet<QuestionMap, string> })[payload.setName];
		if (set === undefined) {
			return { ok: false, kind: "validation", message: `Unknown question set "${payload.setName}".` };
		}
		if (!allow(player, os.clock() * 1000)) {
			return { ok: false, kind: "rate_limit", message: "Too many requests. Try again shortly." };
		}
		if (options.authorize !== undefined && !options.authorize(player, payload.setName, payload.state)) {
			return { ok: false, kind: "auth", message: "Request denied." };
		}

		const [success, value] = jev.ask(payload.state, set).await();
		if (!success) {
			const problem = toJevError(value);
			return { ok: false, kind: problem.kind, message: problem.message };
		}
		const result = value as AskResult<QuestionMap>;
		return {
			ok: true,
			answers: result.answers as unknown as JsonValue,
			model: result.model,
			usage: result.usage,
		};
	};

	previewRemote.OnServerInvoke = (): ReadonlyArray<DefinitionSummary> => summaries;

	game.GetService("Players").PlayerRemoving.Connect((player: Player) => {
		buckets.delete(player.UserId);
	});

	return { sets, folder };
}
