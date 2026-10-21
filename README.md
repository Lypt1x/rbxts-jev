# @rbxts/jev

Typed decisions for Roblox games, powered by TypeSafe's Jev model.

Jev does not write text. You send it one state and several typed questions, and it returns a
choice, a score, a probability, or a box. This package makes those answers ordinary TypeScript
values that your game code branches on.

**Documentation:** the guides are in [`docs/`](docs/docs). The site is not published yet; [build it locally](#build-the-docs) to browse it with the generated API reference.

## Install

```bash
npm install @rbxts/jev
```

You need a roblox-ts project with the standard `rbxts_include` mapping in `default.project.json`.
A project from `npm init roblox-ts` has it. There is no transformer to configure and no separate
Promise package, because roblox-ts 3.0 ships the Promise runtime.

Create a Roblox secret named `TYPESAFE_API_KEY` for your key, scoped to `api.typesafe.ai`. In Studio,
add it under File > Experience Settings > Security > Local Secrets, and turn on Allow HTTP Requests.
The [installation guide](docs/docs/getting-started/installation.md) covers each step.

## A complete example

This file runs on its own. Put it at `src/server/decision.server.ts` and press Play.

```ts
import { choice, createJev, noul, questions, score } from "@rbxts/jev";

// One client for the whole server. It reads your secret and never prints it.
const jev = createJev({ apiKeySecret: "TYPESAFE_API_KEY" });

// The questions to ask. Option names become types.
const npc = questions("npc", {
	intent: choice("What does the player want?", {
		trade: "Buy or sell something",
		help: "Ask for guidance",
		insult: "Say something hostile",
	}),
	mood: score("How polite is the player?", "polite", "neutral", "rude"),
	mentionsGold: noul("Does the player mention gold?"),
});

// The content to judge.
const state = { message: "I have gold. What can you sell me?" };

jev.ask(state, npc)
	.then(({ answers }) => {
		print(answers.intent.choice); // "help" | "insult" | "trade"
		print(answers.mood.score); // number, 0 to 2
		print(answers.mentionsGold.noul); // number, 0 to 1
	})
	.catch((caught) => warn(tostring(caught)));
```

## What you get

- **Inferred types.** The option names you write become the type of `answers.intent.choice`. Add an
  option and every handler that misses it stops compiling.
- **One request, many questions.** Questions run in parallel, so extra ones cost almost nothing.
- **Roblox-native transport.** The call runs on the server through `HttpService`. Your key stays
  in a Roblox secret.
- **One shared budget.** A single rate limiter, retries with jitter, and request deduplication
  protect the server's 500 requests per minute.
- **Decisions you control.** `decide`, `delegate`, and `routeChoice` hand the result back to your
  code, and a handler that throws is captured instead of crashing.

## Learn more

| Read | For |
| - | - |
| [Quick start](docs/docs/getting-started/quick-start.md) | A first request, step by step |
| [Shared setup](docs/docs/getting-started/shared-setup.md) | Where every example variable comes from |
| [How it works](docs/docs/concepts/how-it-works.md) | The idea behind decisions and one request, many questions |
| [Delegate a decision](docs/docs/guides/delegate-a-decision.md) | Acting on an answer safely |
| [Handle errors](docs/docs/guides/handle-errors.md) | Every error kind and what to do about it |
| [Ask from clients](docs/docs/guides/ask-from-clients.md) | Letting a `LocalScript` get a decision |

The API reference is generated from the source's doc comments when you build the site.

## What it does not do

It does not generate text, stream, or keep conversation history, and it does not run in a
`LocalScript`. If a game needs dialogue, let Jev decide what the NPC wants and use your own lines.

## Build the docs

```bash
cd docs && npm install && cd ..
npm run docs:start   # live preview at http://localhost:3000/rbxts-jev/
npm run docs:build   # static site in docs/build
npm run docs:check   # compile every TypeScript example in the docs
```

`docs:check` builds the package, then compiles the examples in the guides against it, so an example
cannot drift away from the library.

## Development

```bash
npm install
npm run check        # compile, typecheck, and run the unit tests
npm run test:studio  # load the compiled library in a headless Roblox Studio
```

`test:studio` needs Roblox Studio on Windows and a `rojo` binary. `test:cloud` and `test:live` run
the same checks through Open Cloud and need `ROBLOX_API_KEY`, `ROBLOX_UNIVERSE_ID`, and
`ROBLOX_PLACE_ID` in a `.env` file. Use a private test place, because an upload replaces the place's
latest saved version.

## License

MIT
