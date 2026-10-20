import { parseAnswers, type AnswersOf } from "../core/answers";
import { JevError, isJevError, toJevError } from "../core/errors";
import type { JsonValue } from "../core/json";
import { PREVIEW_REMOTE, REMOTE_FOLDER, REQUEST_REMOTE, type RemoteReply } from "../core/protocol";
import type { DefinitionSummary, QuestionMap, QuestionSet } from "../core/questions";
import type { Result } from "../core/result";
import type { ExposedSets, JevClient, JevClientOptions } from "../server/types";

function findFolder(parent: Instance): Folder {
	const folder = parent.WaitForChild(REMOTE_FOLDER, 10);
	if (folder === undefined) {
		throw new JevError({
			kind: "not_ready",
			message: "The server has not exposed any question sets yet. Call jev.expose(...) on the server first.",
		});
	}
	return folder as Folder;
}

function findRemote(folder: Folder, name: string): RemoteFunction {
	const remote = folder.WaitForChild(name, 5);
	if (remote === undefined) {
		throw new JevError({ kind: "not_ready", message: `Remote "${name}" is missing.` });
	}
	return remote as RemoteFunction;
}

function readReply(value: unknown): RemoteReply {
	if (!typeIs(value, "table")) {
		throw new JevError({ kind: "malformed_response", message: "The server reply is not a table." });
	}
	const raw = value as { [key: string]: unknown };
	if (!typeIs(raw.ok, "boolean")) {
		throw new JevError({ kind: "malformed_response", message: "The server reply has no `ok` flag." });
	}
	if (raw.ok === true) {
		if (!typeIs(raw.answers, "table") || !typeIs(raw.model, "string") || !typeIs(raw.usage, "table")) {
			throw new JevError({ kind: "malformed_response", message: "The server reply is missing answers, model, or usage." });
		}
	} else if (!typeIs(raw.kind, "string") || !typeIs(raw.message, "string")) {
		throw new JevError({ kind: "malformed_response", message: "The server failure has no kind or message." });
	}
	return value as RemoteReply;
}

/** Creates the client half. Pass the same question sets the server exposes so
 * answers are parsed and typed on both ends. */
export function createJevClient<E extends ExposedSets>(sets: E, options: JevClientOptions = {}): JevClient<E> {
	const parent = options.parent ?? game.GetService("ReplicatedStorage");
	const folder = findFolder(parent);
	const requestRemote = findRemote(folder, REQUEST_REMOTE);
	const previewRemote = findRemote(folder, PREVIEW_REMOTE);

	async function ask<K extends Extract<keyof E, string>>(
		name: K,
		state: JsonValue,
	): Promise<AnswersOf<E[K]["questions"]>> {
		const set = (sets as unknown as { [key: string]: QuestionSet<QuestionMap, string> })[name as string];
		if (set === undefined) {
			throw new JevError({ kind: "validation", message: `Unknown question set "${name as string}".` });
		}
		const reply = readReply(requestRemote.InvokeServer({ setName: name, state }));
		if (!reply.ok) {
			throw new JevError({ kind: reply.kind, message: reply.message });
		}
		const parsed = parseAnswers(reply.answers, set);
		if (!parsed.ok) {
			throw parsed.error;
		}
		return parsed.value as AnswersOf<E[K]["questions"]>;
	}

	return {
		async ask<K extends Extract<keyof E, string>>(
			name: K,
			state: JsonValue,
		): Promise<AnswersOf<E[K]["questions"]>> {
			return ask(name, state);
		},
		async attempt<K extends Extract<keyof E, string>>(
			name: K,
			state: JsonValue,
		): Promise<Result<AnswersOf<E[K]["questions"]>, JevError>> {
			try {
				return { ok: true, value: await ask(name, state) };
			} catch (caught) {
				return { ok: false, error: isJevError(caught) ? caught : toJevError(caught) };
			}
		},
		preview(): ReadonlyArray<DefinitionSummary> {
			const value = previewRemote.InvokeServer();
			if (!typeIs(value, "table")) {
				throw new JevError({ kind: "malformed_response", message: "The preview reply is not a table." });
			}
			return value as unknown as ReadonlyArray<DefinitionSummary>;
		},
	};
}
