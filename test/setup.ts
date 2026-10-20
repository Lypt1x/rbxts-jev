/** Node implementations of the handful of Roblox globals the pure core uses.
 * The core never calls a Roblox API beyond these, so the same source runs here
 * and compiles under rbxtsc. */

const scope = globalThis as unknown as Record<string, unknown>;

function jsTypeOf(value: unknown): string {
	if (value === undefined || value === null) {
		return "nil";
	}
	if (Array.isArray(value)) {
		return "table";
	}
	const kind = typeof value;
	if (kind === "object") {
		return "table";
	}
	if (kind === "function") {
		return "function";
	}
	if (kind === "bigint") {
		return "number";
	}
	return kind;
}

scope.typeOf = jsTypeOf;

scope.typeIs = (value: unknown, typeName: string): boolean => {
	if (typeName === "table") {
		return jsTypeOf(value) === "table";
	}
	return jsTypeOf(value) === typeName;
};

scope.pairs = function* pairs(object: Record<string, unknown>): Iterable<[string | number, unknown]> {
	for (const key of Object.keys(object)) {
		yield [key, object[key]];
	}
};

scope.tostring = (value: unknown): string => String(value);

scope.tonumber = (value: unknown): number | undefined => {
	if (typeof value === "number") {
		return Number.isFinite(value) ? value : undefined;
	}
	if (typeof value === "string") {
		const parsed = Number(value.trim());
		return Number.isFinite(parsed) ? parsed : undefined;
	}
	return undefined;
};

scope.warn = (...values: Array<unknown>): void => {
	console.warn(...values);
};
