---
title: Delegate a decision
sidebar_position: 1
---

# Delegate a decision

This guide shows how to act on an answer: gate it, route it to a handler, and keep a throwing
handler from escaping. [Decisions](../concepts/decisions) explains the model behind it.

## Before you start

Every snippet below runs inside one function. It receives the `player` who spoke and their
`message`, then asks the `npc` question set.

```ts
import { jev } from "./jev";
import { openShop, react, showHint } from "./game";
import { respondToThreat, saveIntent } from "./game";
import { npc } from "shared/questions";

async function handleChat(player: Player, message: string) {
	const state = { message };
	const { answers } = await jev.ask(state, npc);
	// The snippets in this guide go here.
}
```

`jev`, `npc`, and the game functions are defined in [Shared setup](../getting-started/shared-setup).
`openShop`, `showHint`, `react`, `respondToThreat`, and `saveIntent` stand for your own game code.

## Route a Choice to one handler per option

Use `routeChoice` when each option leads to a different action.

```ts
import { isOk, routeChoice } from "@rbxts/jev";

const routed = routeChoice(
	answers.intent,
	{
		trade: () => openShop(player),
		help: () => showHint(player),
		insult: () => react(player),
	},
	{ onUnsure: () => showHint(player) },
);

if (!isOk(routed)) {
	warn(routed.error.toString());
}
```

The handler object needs a key for every option. Add `farewell` to the question and this stops
compiling until you handle it.

`onUnsure` runs when the answer does not clear the gate. Leave it out and `routed` is an error of
kind `undecided`.

## Set the gate

Pass a gate to say how sure the model must be.

```ts
routeChoice(
	answers.intent,
	{
		trade: () => openShop(player),
		help: () => showHint(player),
		insult: () => react(player),
	},
	{
		gate: { act: 0.9, reject: 0.5 },
		onUnsure: () => showHint(player),
	},
);
```

Raise `act` where a wrong action is expensive, and lower it where it is cheap. Banning a player
needs a high `act`. Showing a hint does not.

## Decide on a single answer

Use `decide` and `delegate` when you want the verdict for a Score, a Noul, or a Box.

```ts
import { decide, delegate } from "@rbxts/jev";

const gold = decide(answers.mentionsGold, { act: 0.8, reject: 0.2 });

const result = delegate(gold, {
	act: () => openShop(player),
	reject: () => undefined,
});
```

A Noul gate reads the probability itself. Here `act` means a strong yes and `reject` means a strong
no. The probabilities between them are `confirm`, which falls back to `reject` because there is no
`confirm` handler.

## Handle a throwing handler

`delegate`, `delegateAsync`, and `routeChoice` all return a `Result`, and a handler that throws does
not escape.

```ts
const decision = decide(answers.intent);

const result = delegate(decision, {
	act: () => {
		error("shop failed to open");
	},
	reject: () => undefined,
});

if (!result.ok && result.error.kind === "handler") {
	warn(`handler failed: ${tostring(result.error.cause)}`);
}
```

`result.error.cause` holds whatever the handler threw.

## Run an async handler

```ts
import { delegateAsync } from "@rbxts/jev";

const decision = decide(answers.intent);

const result = await delegateAsync(decision, {
	act: async (intent) => saveIntent(player, intent),
	reject: async () => undefined,
});
```

`saveIntent` is the stand-in from Shared setup. It returns a promise, like a data store write.

A rejected promise becomes a `handler` error the same way.

## Check safety first

Read the safety answers before the intent, and return early.

```ts
const threat = decide(answers.isThreat, { act: 0.8, reject: 0.3 });

if (threat.verdict === "act") {
	respondToThreat(player);
	return;
}
```

Then call `routeChoice` for the normal case. A threat should win over a polite intent.

## See also

- [`decide`](../api/functions/decide) and [`routeChoice`](../api/functions/routeChoice) in the API
  reference.
- [Handle errors](handle-errors) for failures that happen before a decision exists.
