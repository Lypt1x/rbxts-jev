import type { JsonValue } from "./json";

export interface HttpRequest {
	readonly url: string;
	/** Header values are passed through untouched. The Roblox transport accepts a
	 * string or a `Secret` here. */
	readonly headers: { readonly [key: string]: unknown };
	readonly body: string;
	readonly timeoutMs: number;
}

export interface HttpResponse {
	readonly status: number;
	readonly body: string;
	/** Header names must be lowercase so `retry-after` is found. */
	readonly headers: { readonly [key: string]: unknown };
}

export interface HttpTransport {
	request(request: HttpRequest): Promise<HttpResponse>;
}

export interface JsonCodec {
	encode(value: JsonValue): string;
	decode(text: string): JsonValue;
}
