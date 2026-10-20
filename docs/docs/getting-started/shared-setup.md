---
title: Shared setup
sidebar_position: 4
---

# Shared setup

Most examples in these docs use the same few names. This page defines them once, so you can see
where each one comes from. Create these files in a roblox-ts game, and every snippet in the guides
will compile against them.

## The question set

`npc` is the question set used throughout the docs. It lives in a shared folder, because the server
asks it and a client may need its types.

```ts title="src/shared/questions.ts"
import { choice, noul, questions, score } from "@rbxts/jev";

export const npc = questions("npc", {
	intent: choice("What does the player want?", {
		trade: "Buy or sell something",
		help: "Ask for guidance",
		insult: "Say something hostile",
	}),
	mood: score("How polite is the player?", "polite", "neutral", "rude"),
	mentionsGold: noul("Does the player mention gold?"),
	isThreat: noul("Does the message threaten anyone?"),
});
```

## The client

`jev` is one client for the whole server. Create it once and import it where you need it.

```ts title="src/server/jev.ts"
import { createJev } from "@rbxts/jev";

export const jev = createJev({ apiKeySecret: "TYPESAFE_API_KEY" });
```

## Your own game code

The guides call functions such as `openShop` and `showHint`. They stand for your game's behavior,
which the library knows nothing about. These stand-ins print a line, so the snippets run as they are.

```ts title="src/server/game.ts"
export function openShop(player: Player): void {
	print(`${player.Name} opened the shop`);
}

export function showHint(player: Player): void {
	print(`${player.Name} saw a hint`);
}

export function react(player: Player): void {
	print(`the guard reacts to ${player.Name}`);
}

export function respondToThreat(player: Player): void {
	print(`calling the guards on ${player.Name}`);
}

export async function saveIntent(player: Player, intent: string) {
	print(`saved "${intent}" for ${player.Name}`);
}
```

`saveIntent` returns a promise, like a function that writes to a data store would.

## Where `player`, `message`, and `state` come from

In a real game these come from the event that starts the conversation.

| Name | Type | Where it comes from |
| - | - | - |
| `player` | `Player` | The player who sent the message, such as the first argument of a remote's `OnServerEvent` |
| `message` | `string` | What that player typed |
| `state` | `{ player: { name: string }, message: string }` | Built from the two above, as shown next |

```ts title="src/server/chat.ts"
import { jev } from "./jev";
import { npc } from "shared/questions";

export async function handleChat(player: Player, message: string) {
	const state = { player: { name: player.Name }, message };
	const { answers } = await jev.ask(state, npc);
	return answers;
}
```

`answers` is the result of one request. Its type follows from `npc`, so
`answers.intent.choice` is `"help" | "insult" | "trade"`.

## Using these in a snippet

A snippet that says `jev.ask(state, npc)` means exactly the lines above. A snippet that calls a
function you do not recognize, such as `openShop`, is calling a stand-in from `game.ts`.

When a snippet starts with `const { answers } = await jev.ask(state, npc);`, it assumes
`handleChat`'s body. Everything after that line runs inside that function.

## Next

[Quick start](quick-start) runs the first request. [Delegate a decision](../guides/delegate-a-decision)
uses everything defined here.
