declare global {
	type defined = {};
	function typeIs(value: unknown, typeName: string): boolean;
	function typeOf(value: unknown): string;
	function pairs<T extends object>(object: T): Iterable<[string | number, unknown]>;
	function tostring(value: unknown): string;
	function tonumber(value: unknown): number | undefined;
	function warn(...values: Array<unknown>): void;
}

export {};
