---
title: How it works
sidebar_position: 1
---

# How it works

This page explains the idea behind the library. It does not teach the API. For that, start with
the [Quick start](../getting-started/quick-start).

## Decisions, not text

Most language models write text, and your code then has to read that text back into a value. Jev
is built the other way around. You give it typed questions, and it returns typed values: one of
your options, a position on your scale, or a probability. There is no text to parse.

That changes what you can build. A game rarely needs a paragraph from a model. It needs to know
whether a player is asking to trade, whether a message is a threat, or how urgent a report is.
Those are decisions, and code can branch on them directly.

## One state, many questions

Every request carries one **state** and a set of **questions** about it. The state is the content
to judge. It can be a string, an object, or an array. The questions run in parallel, and each one
is judged on its own, so adding a question barely changes the response time.

Because extra questions are close to free, the best pattern is to ask everything you might need and
ignore what does not apply. A chat message can be classified for intent, mood, and threat in a single
request. Your code then decides which answers matter.

```ts
// `jev` and `npc` come from Shared setup.
const state = { message: "Give me a discount or else." };
const { answers } = await jev.ask(state, npc);
```

Here `jev` and `npc` are the client and question set from [Shared setup](../getting-started/shared-setup).

## What happens on a call

1. `ask` turns your question set into the request body and checks that the state is valid JSON.
2. The client waits for a slot in the shared rate limiter and the concurrency limit.
3. It sends the request with `HttpService`, using the API key from your Roblox secret.
4. If the call fails in a way that may pass, it waits with a jittered backoff and tries again.
5. It checks every answer against the questions you defined. A malformed answer fails the call
   instead of leaking a half-filled table into your game.
6. It returns typed answers, the model that answered, token usage, and the time taken.

Two identical calls that overlap share one request. Caching across calls is off unless you turn
it on.

## Where it runs

Roblox clients cannot make HTTPS requests, and an API key must never reach a client. So the
transport runs on the server only. If a client needs a decision, the server can expose a named
question set. The client sends a name and a state, never instructions. See
[Ask from clients](../guides/ask-from-clients).

## What it does not do

- It does not generate text. Use authored lines, or a generative model behind your own backend.
- It does not stream.
- It does not remember earlier requests. Put the history you want judged into the state.
- It does not run in a `LocalScript`.

## Next

[Questions and answers](questions-and-answers) shows the four question types and how their answer
types are inferred.
