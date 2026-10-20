import type { JsonValue } from "./json";

/** One outgoing request, already encoded. */
export interface HttpRequest {
	readonly url: string;
	/** Header values are passed through untouched. The Roblox transport accepts a
	 * string or a `Secret` here. */
	readonly headers: { readonly [key: string]: unknown };
	readonly body: string;
	readonly timeoutMs: number;
}

/** One completed response. A non-2xx status is a response, not an exception. */
export interface HttpResponse {
	readonly status: number;
	readonly body: string;
	/** Header names must be lowercase so `retry-after` is found. */
	readonly headers: { readonly [key: string]: unknown };
}

/** Sends a request. The Roblox implementation uses `HttpService:RequestAsync`; tests inject a fake. */
export interface HttpTransport {
	request(request: HttpRequest): Promise<HttpResponse>;
}

/** Encodes and decodes JSON. The Roblox implementation uses `HttpService:JSONEncode` and `JSONDecode`. */
export interface JsonCodec {
	encode(value: JsonValue): string;
	decode(text: string): JsonValue;
}
