/** The closed set of failure categories. Switch on `kind` instead of matching message text. */
export type JevErrorKind =
	| "auth"
	| "validation"
	| "invalid_definition"
	| "rate_limit"
	| "overloaded"
	| "timeout"
	| "network"
	| "server"
	| "malformed_response"
	| "http_disabled"
	| "not_ready"
	| "undecided"
	| "handler"
	| "unknown";

/** Fields accepted by the `JevError` constructor. */
export interface JevErrorInit {
	readonly kind: JevErrorKind;
	readonly message: string;
	readonly status?: number;
	readonly retryAfterMs?: number;
	readonly cause?: unknown;
	readonly questionId?: string;
	readonly detail?: string;
}

/** The only error type the library throws or rejects with. Game code switches on
 * `kind` instead of matching message text. */
export class JevError {
	public readonly __jevError = true;
	public readonly kind: JevErrorKind;
	public readonly message: string;
	public readonly status: number | undefined;
	public readonly retryAfterMs: number | undefined;
	public readonly cause: unknown;
	public readonly questionId: string | undefined;
	public readonly detail: string | undefined;

	public constructor(init: JevErrorInit) {
		this.kind = init.kind;
		this.message = init.message;
		this.status = init.status;
		this.retryAfterMs = init.retryAfterMs;
		this.cause = init.cause;
		this.questionId = init.questionId;
		this.detail = init.detail;
	}

	public toString(): string {
		const status = this.status === undefined ? "" : ` (${this.status})`;
		const question = this.questionId === undefined ? "" : ` [${this.questionId}]`;
		return `[jev:${this.kind}]${status}${question} ${this.message}`;
	}
}

/** Whether a value is a `JevError`. Safe to call on anything, including strings and nil. */
export function isJevError(value: unknown): value is JevError {
	if (!typeIs(value, "table")) {
		return false;
	}
	return (value as { __jevError?: unknown }).__jevError === true;
}

/** Converts anything thrown or rejected into a `JevError`. A `JevError` passes through unchanged. */
export function toJevError(value: unknown): JevError {
	if (isJevError(value)) {
		return value;
	}
	if (typeIs(value, "string")) {
		return new JevError({ kind: "unknown", message: value as string, cause: value });
	}
	if (typeIs(value, "table")) {
		const message = (value as { message?: unknown }).message;
		if (typeIs(message, "string")) {
			return new JevError({ kind: "unknown", message: message as string, cause: value });
		}
	}
	return new JevError({ kind: "unknown", message: tostring(value), cause: value });
}
