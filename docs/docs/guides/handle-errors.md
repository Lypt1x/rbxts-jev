---
title: Handle errors
sidebar_position: 2
---

# Handle errors

This guide lists the failures the library can produce and what to do about each one. Every error is
a `JevError` with a `kind`, so switch on `kind` and never on the message text.

The examples assume `jev`, `npc`, and `state` from [Shared setup](../getting-started/shared-setup).

## Pick how failures reach you

```ts
// `jev`, `npc`, and `state` come from Shared setup.
// Rejects. Use try/catch, or .catch on the promise.
const result = await jev.ask(state, npc);

// Resolves. Branch on ok.
const attempt = await jev.attempt(state, npc);
if (!attempt.ok) {
	warn(attempt.error.toString());
}
```

`attempt` never rejects. Prefer it when a failure is an expected branch of your logic.

## Error kinds

| Kind | Cause and fix | Retried |
| - | - | - |
| `auth` | The key was rejected, unreadable, or missing, or a player request was denied. Check the secret name, domain, and key. | No |
| `validation` | The API rejected the body, the state is not JSON, or a client sent a bad request. Fix the state or the set. | No |
| `invalid_definition` | A question set breaks a limit, such as no questions or over 10 Score levels. It throws when you define it. | No |
| `rate_limit` | TypeSafe returned 429, or a player passed their limit. Back off, or raise your limits. | Yes |
| `overloaded` | TypeSafe returned 529. Retry later. | Yes |
| `timeout` | The call exceeded `timeoutMs`. Raise it, or ask fewer questions. | Yes |
| `network` | The request did not complete. Check connectivity. | Yes |
| `server` | TypeSafe returned a 5xx or an unexpected status. Retry later. | Yes |
| `malformed_response` | The answer did not match the question set. Report it with the `questionId`. | No |
| `http_disabled` | HTTP requests are off for this place. Turn on Allow HTTP Requests. | No |
| `not_ready` | The client asked before the server exposed sets. Check that the server called `expose`. | No |
| `undecided` | `routeChoice` was unsure and had no `onUnsure`. Add one. | No |
| `handler` | Your decision handler threw. The original is in `cause`. | No |
| `unknown` | Anything else that was thrown. Read `message` and `cause`. | No |

Retried failures are retried up to `retries` times before they reach you, so by the time a `timeout`
arrives, the library has already tried again.

## Read the details

```ts
const result = await jev.attempt(state, npc);

if (!result.ok) {
	const problem = result.error;
	print(problem.kind, problem.status, problem.detail);
}
```

| Field | Holds |
| - | - |
| `kind` | The category from the table |
| `message` | A sentence for humans |
| `status` | The HTTP status, when there was one |
| `detail` | The start of the response body, up to 512 characters |
| `questionId` | The question that failed to parse |
| `retryAfterMs` | The delay the API asked for |
| `cause` | The original error or value |

## Fall back to something deterministic

Decide up front what the game does when there is no answer. A short authored line, a default
branch, or doing nothing are all valid.

```ts
function fallbackLine(kind: string): string {
	if (kind === "rate_limit") return "Mira is busy.";
	return "Mira shrugs.";
}

const result = await jev.attempt(state, npc);
if (!result.ok) {
	print(fallbackLine(result.error.kind));
}
```

Tell the player what happened only when it helps them. A message about a rate limit is useful. A
message about a malformed response is not.

## Watch failures in production

`onEvent` receives an `error` event for every call that fails for good, and a `retry` event for each
retry.

```ts title="src/server/jev.ts"
import { createJev } from "@rbxts/jev";

export const jev = createJev({
	apiKeySecret: "TYPESAFE_API_KEY",
	onEvent: (event) => {
		if (event.type === "error") {
			warn(event.error.toString());
		}
	},
});
```

This replaces the `jev.ts` from Shared setup. `event` is a `JevEvent`, so `event.type` narrows to the
fields that event carries.

## See also

- [`JevErrorKind`](../api/type-aliases/JevErrorKind) and [`JevError`](../api/classes/JevError) in the API
  reference.
- [Async model](../concepts/async-model) for how retries and timeouts work.
