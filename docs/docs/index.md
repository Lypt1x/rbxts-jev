---
slug: /
title: "@rbxts/jev"
sidebar_position: 1
---

# @rbxts/jev

Typed decisions for Roblox games, powered by TypeSafe's Jev model.

Jev does not write text. You send it one state and several typed questions, and it returns a
choice, a score, a probability, or a box. This package makes those answers ordinary TypeScript
values that your game code branches on.

```ts
// `jev`, `npc`, and `state` are defined in Shared setup.
const { answers } = await jev.ask(state, npc);

answers.intent.choice; // "help" | "insult" | "trade"
answers.mood.score; // number
answers.mentionsGold.noul; // number, 0..1
```

`npc` is a set of questions and `state` is the content to judge. [Shared setup](getting-started/shared-setup)
defines both, along with every other name the examples use.

## Where to start

| If you want to | Read |
| - | - |
| Install it and make a first request | [Installation](getting-started/installation) |
| See where every example variable comes from | [Shared setup](getting-started/shared-setup) |
| Understand what it is for | [How it works](concepts/how-it-works) |
| Act on an answer safely | [Delegate a decision](guides/delegate-a-decision) |
| Look up a function or type | [API reference](api) |

## What you get

- **Inferred types.** The option names you write become the type of `answers.intent.choice`.
  Adding an option breaks the build until every handler covers it.
- **Roblox-native transport.** The request runs on the server through `HttpService`, and your
  API key stays in a Roblox secret.
- **One shared budget.** A single rate limiter, retries with jitter, and request
  deduplication protect the server's 500 requests per minute.
- **Decisions you control.** `decide`, `delegate`, and `routeChoice` hand the result back to
  your code, and a handler that throws is captured instead of crashing.

## What it does not do

It does not generate text, stream, or keep conversation history. If a game needs dialogue, let
Jev decide what the NPC wants and use your own authored lines.
