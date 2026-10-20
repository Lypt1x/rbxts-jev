---
title: Decisions
sidebar_position: 3
---

# Decisions

This page explains how the library turns an answer into something your code can act on, and why
that step hands control back to you.

## An answer is not yet a decision

A Choice answer says "trade, with confidence 0.62". That is information. Whether to open the shop
at 0.62 is a decision, and it depends on the cost of being wrong. Opening a shop by mistake costs
little. Banning a player by mistake costs a lot.

The library keeps that choice in your hands. `decide` reads an answer and a gate, and returns a
`Decision` with a verdict. You then pass the decision to handlers you wrote.

## Three verdicts

| Verdict | Meaning |
| - | - |
| `act` | The answer is strong enough to use without asking |
| `confirm` | The answer is plausible but not certain, so check first or gather more |
| `reject` | The answer is too weak to use |

A **gate** is a pair of thresholds. At or above `act`, the verdict is `act`. Below `reject`, it is
`reject`. Between them it is `confirm`.

```ts
// `answers` is the result of `jev.ask(state, npc)` in Shared setup.
const decision = decide(answers.intent, { act: 0.8, reject: 0.45 });
// decision.verdict is "act", "confirm", or "reject"
// decision.value is the chosen option, such as "trade"
```

`answers` comes from `jev.ask(state, npc)`. See [Shared setup](../getting-started/shared-setup).

The defaults are `{ act: 0.8, reject: 0.45 }` for confidence and `{ act: 0.7, reject: 0.3 }` for a
Noul probability. If you pass a gate with `act` below `reject`, the two are swapped, and both are
clamped to 0 to 1.

## What the gate reads

| Answer | The gate reads | The value is |
| - | - | - |
| Choice | `confidence` | The chosen option |
| Score | `confidence` | The fractional score |
| Noul | The probability itself | `"yes"` at or above 0.5, otherwise `"no"` |
| Box | `confidence`, or 0 when absent | The box |

A Noul works differently from the others, and the difference is easy to miss. Its verdict follows
the probability, not a separate confidence. So `act` on a Noul means a strong yes, and `reject`
means a strong no. A probability of 0.1 is a confident no, and it returns `reject` with the value
`"no"`.

## Delegating

`delegate` runs the handler that matches the verdict and returns a `Result`.

```ts
// `answers` is the result of `jev.ask(state, npc)` in Shared setup.
const outcome = delegate(decide(answers.mood), {
	act: (score) => print("mood", score),
	confirm: (score) => print("watch mood", score),
	reject: () => print("ignore mood"),
});
```

The handlers here only print. In a game they would call your own code.

If you omit `confirm`, the `reject` handler runs for that verdict.

The `Result` is where exceptions go. A handler that throws does not escape. `delegate` returns
`{ ok: false, error }`, and the error has `kind: "handler"` with the original in `cause`. That keeps
one bad branch from taking down the script that called it.

`delegateAsync` does the same for async handlers and captures rejected promises. `match` and
`matchAsync` are aliases.

## Routing a Choice

`routeChoice` combines the gate with one handler per option.

```ts
// `answers` and `player` come from Shared setup's `handleChat`.
routeChoice(
	answers.intent,
	{
		trade: () => openShop(player),
		help: () => showHint(player),
		insult: () => react(player),
	},
	{ onUnsure: () => showHint(player) },
);
```

`openShop`, `showHint`, and `react` are stand-ins for your game's code, defined in
[Shared setup](../getting-started/shared-setup).

The handler object has a key for every option, so adding an option to the question breaks the
build until you handle it. When the answer does not clear the gate, `onUnsure` runs. Without
`onUnsure`, the result is an `undecided` error.

## Order your checks

Run safety checks before intent. If a message is a threat, you probably want the threat response
whatever the intent says. The usual shape is to read the safety answers first and fall through to
`routeChoice` last.

## Next

[Delegate a decision](../guides/delegate-a-decision) shows a complete example.
