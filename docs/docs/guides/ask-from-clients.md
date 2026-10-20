---
title: Ask from clients
sidebar_position: 3
---

# Ask from clients

This guide shows how to let a `LocalScript` get a decision without giving it the key, the
instructions, or a way to spend your budget freely.

Roblox clients cannot make HTTPS requests, and an exploiter can call any remote with any
arguments. So the server decides what can be asked, and the client only asks for it by name.

## Expose a set on the server

This guide reuses the `npc` question set from [Shared setup](../getting-started/shared-setup).
Put it in an object whose keys are the names a client will use, and share that object with both
sides.

```ts title="src/shared/questions.ts"
// Add this line below the existing `npc` set.
export const exposed = { npc };
```

Then expose it on the server.

```ts title="src/server/main.server.ts"
import { jev } from "./jev";
import { exposed } from "shared/questions";

jev.expose(exposed, {
	perPlayer: { requestsPerMinute: 12, burst: 3 },
	authorize: (player, setName, state) => player.UserId > 0,
});
```

`expose` creates a folder of remotes in `ReplicatedStorage`. Pass `parent` to put it elsewhere.
The `authorize` function here allows every real player. Replace it with your own check.

## Ask from the client

```ts title="src/client/main.client.ts"
import { createJevClient } from "@rbxts/jev";
import { exposed } from "shared/questions";

const client = createJevClient(exposed);

async function sayHello() {
	const answers = await client.ask("npc", { message: "hello there" });
	print(answers.intent.choice); // "help" | "insult" | "trade"
}

sayHello();
```

Pass the same `exposed` object on both sides. The client uses it to parse and type the answers, so
the types match the server's.

Wrap `await` in a function. roblox-ts requires `commonjs` modules, and TypeScript only allows
top-level `await` with newer module settings.

`createJevClient` waits up to 10 seconds for the server's remotes. If they never appear, it throws
a `not_ready` error.

## What the client can and cannot do

| A client can | A client cannot |
| - | - |
| Ask for a set by name | Send instructions or criteria |
| Send a state | Choose a model |
| Read the answers | Read the API key or another player's answers |
| Call `preview()` to see the exposed sets | Ask for a set you did not expose |

An unknown set name, or a request that is not shaped like `{ setName, state }`, returns a
`validation` error without reaching the model.

## Limit what a player can spend

A client can call a remote as fast as the network allows. Every call that reaches the model costs
tokens and a share of the server's 500 requests per minute.

- `perPlayer` gives each player a leaky bucket. A player who passes it gets a `rate_limit` error.
  If you leave `burst` out, it defaults to a quarter of `requestsPerMinute`.
- `authorize` runs before the request reaches the model. Return `false` to deny it with an `auth`
  error. Use it to check a cooldown, a game state, or the length of the state.
- Keep the state small. Check its size in `authorize` if players type free text.

The bucket is per player and shared across every set you expose.

## Keep expensive judgments on the server

If the answer decides something the player should not control, ask on the server and send the
result to the client yourself. Expose a set only when the client genuinely needs to ask.

## Preview the exposed sets

```ts
for (const summary of client.preview()) {
	print(summary.name); // "npc"
}
```

`client` is the one from the previous section.

## See also

- [`Jev.expose`](../api/interfaces/Jev) and [`ExposeOptions`](../api/interfaces/ExposeOptions) in the API
  reference.
- [Handle errors](handle-errors) for the error kinds a client can receive.
