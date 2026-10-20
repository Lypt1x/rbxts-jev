import { describe, expect, test } from "bun:test";
import { JevError, isJevError, toJevError } from "../src/core/errors";
import { err, isErr, isOk, mapError, mapResult, ok, unwrapOr } from "../src/core/result";
import { hashKey } from "../src/core/hash";

describe("errors", () => {
	test("recognizes its own error type", () => {
		const failure = new JevError({ kind: "auth", message: "nope", status: 401 });
		expect(isJevError(failure)).toBe(true);
		expect(failure.toString()).toContain("[jev:auth] (401)");
	});

	test("wraps a string", () => {
		const wrapped = toJevError("boom");
		expect(wrapped.kind).toBe("unknown");
		expect(wrapped.message).toBe("boom");
	});

	test("keeps a table message", () => {
		const wrapped = toJevError({ message: "table boom" });
		expect(wrapped.message).toBe("table boom");
	});

	test("passes a JevError through unchanged", () => {
		const failure = new JevError({ kind: "timeout", message: "slow" });
		expect(toJevError(failure)).toBe(failure);
	});
});

describe("result", () => {
	test("narrows ok and err", () => {
		expect(isOk(ok(1))).toBe(true);
		expect(isErr(err("bad"))).toBe(true);
	});

	test("maps the value without touching the error", () => {
		expect(mapResult(ok(2), (value) => value * 3)).toEqual({ ok: true, value: 6 });
		expect(mapResult(err("bad"), (value: number) => value * 3)).toEqual({ ok: false, error: "bad" });
	});

	test("maps the error", () => {
		expect(mapError(err("bad"), (failure) => failure.length)).toEqual({ ok: false, error: 3 });
	});

	test("unwraps with a fallback", () => {
		expect(unwrapOr(ok("value"), "fallback")).toBe("value");
		expect(unwrapOr(err("bad"), "fallback")).toBe("fallback");
	});
});

describe("hash", () => {
	const reader = { length: (text: string) => text.length, codeAt: (text: string, index: number) => text.charCodeAt(index - 1) };

	test("is deterministic", () => {
		expect(hashKey(["a", "b"], reader)).toBe(hashKey(["a", "b"], reader));
	});

	test("separates different inputs", () => {
		expect(hashKey(["a"], reader)).not.toBe(hashKey(["b"], reader));
	});

	test("distinguishes part boundaries", () => {
		expect(hashKey(["ab"], reader)).not.toBe(hashKey(["a", "b"], reader));
	});
});
