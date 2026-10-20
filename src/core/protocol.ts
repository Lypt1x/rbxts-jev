import type { Usage } from "./answers";
import type { JevErrorKind } from "./errors";
import type { JsonValue } from "./json";
import type { DefinitionSummary } from "./questions";

export interface RemoteRequest {
	readonly setName: string;
	readonly state: JsonValue;
}

export interface RemoteSuccess {
	readonly ok: true;
	readonly answers: JsonValue;
	readonly model: string;
	readonly usage: Usage;
}

export interface RemoteFailure {
	readonly ok: false;
	readonly kind: JevErrorKind;
	readonly message: string;
}

export type RemoteReply = RemoteSuccess | RemoteFailure;

export type RemotePreview = ReadonlyArray<DefinitionSummary>;

export const REMOTE_FOLDER = "JevRemotes";
export const REQUEST_REMOTE = "Request";
export const PREVIEW_REMOTE = "Preview";

export function isRemoteRequest(value: unknown): value is RemoteRequest {
	if (!typeIs(value, "table")) {
		return false;
	}
	const raw = value as { [key: string]: unknown };
	return typeIs(raw.setName, "string") && raw.state !== undefined;
}
