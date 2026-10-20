---
title: Test your code
sidebar_position: 4
---

# Test your code

This guide shows how to test the logic that acts on an answer without calling the API. It covers
what the repository itself runs, then how to test your own game.

## Test your decision logic with hand-built answers

The part of your game worth testing is the code that turns answers into actions. That code takes
plain values, so you can build the values yourself.

```ts
import type { ChoiceAnswer } from "@rbxts/jev";

type Intent = "trade" | "help";

function choiceAnswer(pick: Intent, confidence: number) {
	const other = 1 - confidence;
	const answer: ChoiceAnswer<Intent> = {
		type: "choice",
		choice: pick,
		confidence,
		probabilities: {
			trade: pick === "trade" ? confidence : other,
			help: pick === "help" ? confidence : other,
		},
	};
	return answer;
}
```

Pass these to your own function and assert on the result. Cover the edges: a confident answer, an
unsure one, and a very unsure one. Cover a throwing handler too, because the library returns it as
a `handler` error.

## Run Luau tests in a headless Studio

Your decision code compiles to Luau that uses the roblox-ts runtime. To run it, execute a Luau file
in a headless Roblox Studio.

```bash
RobloxStudioBeta.exe --task RunScript --localPlaceFile place.rbxl \
  --runScriptFile test.luau --outputFile out.log --quitAfterExecution
```

Studio runs the script after the place loads, writes what it prints to `out.log`, and exits. Make
the script print a `PASS` or `FAIL` line for each check, and a final line with the failure count. A
wrapper script can read that line and set an exit code.

This runs on Windows, or from WSL on a Windows machine. It makes no network call, so it needs no
API key.

## What this repository runs

The library's own checks, from the repository root:

```bash
npm run check
```

That command compiles the package with roblox-ts, typechecks the pure core under Node, and runs the
unit suite. A separate file asserts the type inference, so a change that stops answers from being
typed fails the build.

```bash
npm run test:studio
```

This builds a small game that contains the package, then loads it through the roblox-ts runtime in
a headless Studio. It needs Studio on Windows and a `rojo` binary.

## Test against the real API

Two scripts run tests inside Roblox's cloud. They are written but not part of the default checks.

| Command | What it does |
| - | - |
| `npm run test:cloud` | Uploads the fixture place and runs the offline checks through the Open Cloud Luau Execution API |
| `npm run test:live` | Makes one real request using a secret from the place |

Both read three values from `.env`: `ROBLOX_API_KEY`, `ROBLOX_UNIVERSE_ID`, and `ROBLOX_PLACE_ID`.
Use a private test place, because the upload replaces the place's latest saved version.

The API key needs two scopes: `universe-places:write` and
`universe.place.luau-execution-session:write`.

## Inject the effects

The core is built so every effect can be replaced. `createEngine` takes the transport, the codec,
the clock, and the random source as arguments. The repository's own tests use fakes for all four.
Use `createEngine` the same way if you want to test retries, timeouts, or sharing without Roblox.

## See also

- [`createEngine`](../api/functions/createEngine) and [`EngineConfig`](../api/interfaces/EngineConfig) in the
  API reference.
- [Handle errors](handle-errors) for the error kinds your tests should cover.
