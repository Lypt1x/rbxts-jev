export interface Ok<T> {
	readonly ok: true;
	readonly value: T;
}

export interface Err<E> {
	readonly ok: false;
	readonly error: E;
}

/** An explicit success or failure. Used where a rejected promise would force the
 * caller into try/catch, such as delegating a decision to a handler. */
export type Result<T, E> = Ok<T> | Err<E>;

export function ok<T>(value: T): Ok<T> {
	return { ok: true, value };
}

export function err<E>(failure: E): Err<E> {
	return { ok: false, error: failure };
}

export function isOk<T, E>(result: Result<T, E>): result is Ok<T> {
	return result.ok;
}

export function isErr<T, E>(result: Result<T, E>): result is Err<E> {
	return !result.ok;
}

export function mapResult<T, U, E>(result: Result<T, E>, project: (value: T) => U): Result<U, E> {
	return result.ok ? ok(project(result.value)) : result;
}

export function mapError<T, E, F>(result: Result<T, E>, project: (failure: E) => F): Result<T, F> {
	return result.ok ? result : err(project(result.error));
}

export function unwrapOr<T, E>(result: Result<T, E>, fallback: T): T {
	return result.ok ? result.value : fallback;
}

export function getOrElse<T, E>(result: Result<T, E>, recover: (failure: E) => T): T {
	return result.ok ? result.value : recover(result.error);
}
