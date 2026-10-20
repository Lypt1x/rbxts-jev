# @rbxts/jev

Typed decisions for Roblox games, powered by TypeSafe's Jev model.

Jev is not a text generator. You send one state and many typed questions, and it
returns a choice, a score, a probability, or a box. This package makes that feel
like ordinary TypeScript.

```ts
const { answers } = await jev.ask(playerSnapshot, npc);

answers.intent.choice; // "trade" | "help" | "insult"
answers.mood.score; // number
answers.mentionsGold.noul; // number, 0..1
```

## Why this exists

A game decision usually needs several judgments about the same situation. Is the
player hostile. Do they want to trade. Are they asking for help. Jev answers all
of them in one request, in parallel, and returns typed values your code can
branch on. No text to parse, no schema to coerce.

This package adds the parts Roblox needs. Server-only transport. A secret that
never becomes a string. One shared rate limiter. Deduplication. Retries with
jitter. Typed answers. And a way to hand the decision back to your code with
exceptions captured.

## Install

```sh
npm install @rbxts/jev
```

The package is not on npm yet. To use it today, install it from GitHub.

```sh
npm install github:Lypt1x/rbxts-jev
```

The repository builds `out/` when npm installs it from git. You can also pack it
yourself and install the tarball.

```sh
npm pack
npm install /absolute/path/to/rbxts-jev-0.1.0.tgz
```

To publish under your own scope, rename the package and add that scope to
`typeRoots` and to the Rojo `node_modules` tree.

Your Rojo project needs the standard roblox-ts include and package tree. If you
started from `npm init roblox-ts`, you already have it.

```json
"ReplicatedStorage": {
  "$className": "ReplicatedStorage",
  "rbxts_include": {
    "$path": "include",
    "node_modules": {
      "$className": "Folder",
      "@rbxts": { "$path": "node_modules/@rbxts" }
    }
  }
}
```

No transformer. No Promise peer dependency. roblox-ts 3.0 ships the runtime.

## The key

Create a secret named `TYPESAFE_API_KEY` in the Creator Dashboard under Secrets,
scoped to `api.typesafe.ai`. For Studio playtesting, add the same name under
File > Experience Settings > Security > Local Secrets.

```ts
const jev = createJev({ apiKeySecret: "TYPESAFE_API_KEY" });
```

`HttpService:GetSecret` returns a non-printable `Secret`, and the library puts it
straight into the `authorization` header. The key never exists as a string in
your game.

A plain `apiKey` is accepted for local experiments. Do not ship it.

## Quick start

Define questions once, in a shared module.

```ts
// src/shared/questions.ts
import { choice, noul, questions, score } from "@rbxts/jev";

export const npc = questions("npc", {
	intent: choice("What does the player want?", {
		trade: "Buy or sell something",
		help: "Ask for guidance",
		insult: "Say something hostile",
	}),
	mood: score("How is the player speaking?", "friendly", "neutral", "hostile"),
	mentionsGold: noul("Does the player mention gold?"),
});

export const exposed = { npc };
```

Ask on the server.

```ts
// src/server/main.server.ts
import { createJev, isOk, routeChoice } from "@rbxts/jev";
import { npc } from "shared/questions";

const jev = createJev({ apiKeySecret: "TYPESAFE_API_KEY", debug: true });

export async function handleChat(player: Player, message: string) {
	const state = {
		player: { name: player.Name, level: 12 },
		message,
	};

	const { answers } = await jev.ask(state, npc);

	const routed = routeChoice(answers.intent, {
		trade: () => openShop(player),
		help: () => showHint(player),
		insult: () => guard.react(player),
	}, {
		onUnsure: () => showHint(player),
	});

	return isOk(routed) ? routed.value : undefined;
}
```

`routeChoice` gates on confidence and delegates to one handler per option. Adding
an option to the question set becomes a compile error until every handler exists.
A throw inside a handler is captured, not swallowed.

## Questions

Three primitives, plus boxes for images.

| Builder | Answer | Gate on |
| - | - | - |
| `choice(instructions, options)` | `choice`, `confidence`, `probabilities` | `confidence` |
| `score(instructions, ...levels)` | fractional `score`, `confidence`, `legend`, `probabilities` | `confidence` |
| `noul(instructions, criteria?)` | `noul`, the probability of yes | the probability itself |
| `box(instructions)` | four edges, optional `confidence` | `confidence` |

```ts
const levels = score("How severe?", "cosmetic", "degraded", "blocking");
const team = choice("Which team?", { billing: "Money", technical: "Bugs" });
const bare = choice("Which team?", { billing: undefined, technical: undefined });
const bareShort = oneOf("Which team?", "billing", "technical");
const urgent = noul("Is this urgent?", {
	true: "Blocks the player from continuing",
	false: "Can wait",
});
```

Every answer is constrained to the options you supplied. The model cannot invent
a fourth team.

### Types flow through

`choice` infers the union from the option keys. `score` infers the levels from the
variadic arguments. `AnswersOf` turns a question map into the answer map, so there
are no casts in game code.

```ts
import type { AnswersOf } from "@rbxts/jev";

type NpcAnswers = AnswersOf<(typeof npc)["questions"]>;

const route = (answers: NpcAnswers) => {
	if (answers.intent.choice === "trad") { /* compile error, good */ }
};
```

### Ask everything you might need

Questions in one request run in parallel. Adding a question barely changes the
response time, so ask the speculative ones and ignore what does not apply. This is
the fan-out pattern TypeSafe recommends.

## Preview what you defined

A question set carries its own runtime description. `define` registers it, and
`preview` prints the shapes.

```ts
jev.define(npc);
print(jev.preview("npc"));
```

```
npc
  intent  choice  options: trade | help | insult
  mood  score  3 levels: friendly | neutral | hostile
  mentionsGold  noul  probability 0..1
```

With `debug: true`, the first `ask` for a set prints the same block once, so the
shape appears in the Studio output without extra calls.

Clients can preview too. See below.

## Delegating a decision

A decision is a value, not a control flow statement. `decide` turns an answer into
a verdict, and `delegate` runs the handler you chose.

```ts
import { decide, delegate } from "@rbxts/jev";

const decision = decide(answers.mood, { act: 0.8, reject: 0.45 });

const outcome = delegate(decision, {
	act: (score) => setMood(score),
	confirm: (score) => observeForAnotherSecond(score),
	reject: () => ignore(),
});
```

`delegate` returns a `Result`. A handler that throws produces
`{ ok: false, error: { kind: "handler", cause } }`. `delegateAsync` awaits the
handler and captures rejections the same way.

Noul gates use probability thresholds.

```ts
const gate = { act: 0.8, reject: 0.2 };
if (decide(answers.mentionsGold, gate).verdict === "act") {
	offerGoldTrade();
}
```

`routeChoice` is the short form for the common case, and it requires a handler for
every option.

## Async model

Every public call returns a Promise and never blocks the caller.

| Behavior | Default | Notes |
| - | - | - |
| Concurrency | 4 in flight | Shared per `createJev` instance |
| Sustained rate | 240 requests/minute | Roblox allows 500 per server, leave room |
| Burst | 24 | Leaky bucket, the shape Roblox recommends |
| Timeout | 12000 ms | Rejects with `timeout` |
| Retries | 2 | 429, 529, 5xx, network, timeout |
| Backoff | exponential, full jitter | Honors `retry-after` |
| Deduplication | on | Identical in-flight requests share one HTTP call |
| Cache | off | Opt in with `cacheTtlMs` |

```ts
const jev = createJev({
	apiKeySecret: "TYPESAFE_API_KEY",
	requestsPerMinute: 120,
	maxConcurrent: 4,
	cacheTtlMs: 0,
	debug: false,
});
```

Caching judged answers is off by default. A stale judgment about a player is a
gameplay bug. Deduplication is always on because it is safe and protects the
server's HTTP budget.

A timeout stops the library from waiting. Roblox offers no way to abort an
in-flight `RequestAsync`, so the socket may finish in the background. The result
is discarded.

For many states at once, use `attemptAll`. It runs every call through the same
scheduler, returns one `Result` per state, and never rejects. A plain `Promise.all`
over `ask` would cancel the siblings after the first failure.

```ts
const results = await jev.attemptAll(states, npc);
for (const result of results) {
	if (result.ok) handle(result.value.answers);
}
```

## Client requests, if you want them

Clients cannot call HTTPS and must never see the key. The server can expose named
question sets. A client sends a name and a state. It cannot send instructions, pick
a model, or read another set.

```ts
// server
jev.expose(exposed, {
	perPlayer: { requestsPerMinute: 12, burst: 3 },
	authorize: (player, setName, state) => player.UserId > 0,
});
```

```ts
// client
import { createJevClient } from "@rbxts/jev";
import { exposed } from "shared/questions";

const client = createJevClient(exposed);
const answers = await client.ask("npc", { message: "hello there" });

print(client.preview()); // the server's registered sets and their shapes
```

Every exposed call costs tokens, and a client can invoke a remote as fast as the
network allows. The per-player bucket bounds that. Keep expensive judgments on the
server and expose only what a client genuinely needs.

## Errors

Everything the library throws or rejects with is a `JevError` with a `kind`.

| Kind | Meaning | Retried |
| - | - | - |
| `auth` | Key rejected, or the secret could not be read | no |
| `validation` | Body rejected, or the state is not JSON | no |
| `invalid_definition` | A question set breaks the API limits | no |
| `rate_limit` | 429 from TypeSafe | yes |
| `overloaded` | 529 from TypeSafe | yes |
| `timeout` | The call exceeded its deadline | yes |
| `network` | The request did not complete | yes |
| `server` | 5xx or an unexpected status | yes |
| `malformed_response` | The answer payload did not match the question set | no |
| `http_disabled` | `HttpService` is off for this place | no |
| `not_ready` | The client asked before the server exposed sets | no |
| `handler` | Your decision handler threw | no |
| `undecided` | `routeChoice` was unsure and had no `onUnsure` | no |

```ts
const result = await jev.attempt(state, npc);
if (!result.ok && result.error.kind === "rate_limit") {
	queueForNextTick();
}
```

`isJevError` is a runtime check, useful at the boundary of your own error handler.

## Functional core

The builders are pure data, so a question set can be stored, compared, and passed
across modules. `pipe` and `flow` are included because they cost nothing.

```ts
import { flow, pipe } from "@rbxts/jev";

const moodLabel = flow(
	(answers: NpcAnswers) => answers.mood.score,
	(score) => (score > 1.5 ? "hostile" : "calm"),
);

const label = pipe(answers, moodLabel);
```

`createEngine` is exported for tests and for embedding. Every effect is injected,
including the transport, codec, clock, and randomness, so a unit test can run
without Roblox or the network.

## Limits worth knowing

- Choice accepts 1 to 255 options. Score accepts 1 to 10 levels.
- State can be a string, an object, or an array. Nesting is capped at 64 levels.
- The request body is capped at 32 MiB. Roblox's own practical limit is near 1 MB.
- Context is 64k tokens per request and 32k per question. Long context raises both
  to 262k and costs accuracy and time.
- `jev-latest` is an alias. Pin a version such as `jev-1.13.0` once you tune
  confidence thresholds.
- Images and `box` need `jev-preview` or `jev-1.14.0`, an asset map, and the
  danger-zone header. The library adds the header when a box question or an
  `assets` option is present.

```ts
const { answers } = await jev.ask(state, photoQuestions, {
	model: "jev-preview",
	assets: {
		"<photo>": { type: "image", format: "png", data_base64: base64 },
	},
});
```

## Where it fits

Anything where a game needs a quick judgment about text or structured state, and code
then acts on the answer. These are examples of the shape, not features of the package.

- **NPC and chat reactions.** Classify what a player said, how they sounded, and
  whether it is a threat, then pick an authored response.
- **Chat moderation.** Score each message on several dimensions at once, such as
  toxicity, spam, and personal information, and weight them in your own code.
- **Support and report triage.** Route a player report to the right queue and flag
  the urgent ones.
- **Command and intent parsing.** Map free-form typing to a fixed set of game actions.
- **Quest and content matching.** Decide whether a player's action satisfies a
  quest step described in plain language.
- **Personalization.** Judge which of a few offers or hints fits a player's recent
  activity.
- **Feedback analysis.** Tag and rank free-text feedback from a form or a thread.

Each of these maps onto a Choice, a Score, or a Noul, asked together in one request.

## What it does not do

It does not generate text. It does not stream. It does not keep conversation
history. If a game needs dialogue, let Jev decide what the NPC wants and use your
own authored lines, or call a generative model from your own backend. Mixing a
generative model into the Roblox server is possible, but it is outside this
package.

## Verification

```sh
npm run check
```

Run `npm run test:studio` as well to exercise the compiled Luau inside a headless
Roblox Studio. It needs Studio on Windows and a `rojo` binary.

`npm run check` compiles the package with `rbxtsc`, typechecks the pure core under
Node, checks the inference contract, and runs the unit suite.

`npm run test:studio` loads the compiled library through the roblox-ts runtime in a
headless Roblox Studio. It uses the minimal game in `test/fixture/`.

