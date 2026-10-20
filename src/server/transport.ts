import { JevError } from "../core/errors";
import type { JsonValue } from "../core/json";
import type { HttpRequest, HttpResponse, HttpTransport, JsonCodec } from "../core/transport";

interface SecretCapableHttpService extends HttpService {
	GetSecret(this: HttpService, name: string): Secret;
}

function service(): SecretCapableHttpService {
	return game.GetService("HttpService") as SecretCapableHttpService;
}

function httpEnabled(HttpService: HttpService): boolean {
	const value = (HttpService as unknown as { HttpEnabled?: boolean }).HttpEnabled;
	return value !== false;
}

function lowercaseHeaders(headers: { readonly [key: string]: unknown }): { readonly [key: string]: unknown } {
	const out: { [key: string]: unknown } = {};
	for (const [key, value] of pairs(headers as { [key: string]: defined })) {
		out[string.lower(tostring(key))] = value;
	}
	return out;
}

/** The only HTTP path in the library. Server-only by construction. */
export function createRobloxTransport(): HttpTransport {
	return {
		async request(request: HttpRequest): Promise<HttpResponse> {
			const HttpService = service();
			if (!httpEnabled(HttpService)) {
				throw new JevError({
					kind: "http_disabled",
					message:
						"HttpService is disabled. Enable File > Experience Settings > Security > Allow HTTP Requests, then restart the session.",
				});
			}

			let result: RequestAsyncResponse;
			try {
				result = await HttpService.RequestAsync({
					Url: request.url,
					Method: "POST",
					Headers: request.headers as unknown as HttpHeaders,
					Body: request.body,
				});
			} catch (caught) {
				throw new JevError({
					kind: "network",
					message: "The request to TypeSafe did not complete.",
					cause: caught,
				});
			}

			return {
				status: result.StatusCode,
				body: result.Body,
				headers: lowercaseHeaders(result.Headers as unknown as { readonly [key: string]: unknown }),
			};
		},
	};
}

export function createRobloxCodec(): JsonCodec {
	return {
		encode(value: JsonValue): string {
			return service().JSONEncode(value);
		},
		decode(text: string): JsonValue {
			return service().JSONDecode(text) as JsonValue;
		},
	};
}

export interface SecretResolution {
	readonly authorization: string | Secret;
}

/** Reads a Roblox secret. The value never becomes a printable string. */
export function resolveSecret(name: string): string | Secret {
	const HttpService = service();
	try {
		return HttpService.GetSecret(name).AddPrefix("Bearer ");
	} catch (caught) {
		throw new JevError({
			kind: "auth",
			message: `Could not read the secret "${name}". Create it in the Creator Dashboard under Secrets, or add it under File > Experience Settings > Security > Local Secrets for Studio playtesting.`,
			cause: caught,
		});
	}
}

export function plainAuthorization(apiKey: string): string {
	return `Bearer ${apiKey}`;
}
