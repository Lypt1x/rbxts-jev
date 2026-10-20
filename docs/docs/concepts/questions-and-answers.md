---
title: Questions and answers
sidebar_position: 2
---

# Questions and answers

This page explains the four question types, how their answer types follow from the way you define
them, and how to read confidence.

## The four question types

| Builder | Use it when | The answer holds |
| - | - | - |
| `choice` | The answer is one option from a fixed set | `choice`, `confidence`, `probabilities` |
| `score` | The answer is a position on an ordered scale | `score`, `confidence`, `legend`, `probabilities` |
| `noul` | The answer is yes or no, and you want the probability | `noul` |
| `box` | You need to find something in an image | `box`, `confidence` |

Pick the type whose answer your code can act on directly. A Choice becomes a branch. A Score
becomes a threshold. A Noul becomes an `if`.

```ts
const ticket = questions("ticket", {
	team: choice("Which team handles this?", {
		billing: "Charges, refunds, subscriptions",
		technical: "Bugs and integrations",
	}),
	severity: score("How bad?", "cosmetic", "degraded", "blocking"),
	wantsHuman: noul("Is the player asking for a person?"),
});
```

A Choice takes 1 to 255 options. A Score takes 1 to 10 levels. A set with no questions, or a
question outside those limits, throws an `invalid_definition` error when you define it, before any
request is sent.

Write each question so it asks one thing. "Is this message hostile and about trading?" hides two
judgments. Ask two questions and combine them in code.

## Types come from the definition

The names you write become types. `choice` reads the option names, and `score` reads the levels.

```ts
// `jev` is from Shared setup. `ticket` is the set above.
const state = { message: "I was charged twice and I want a person." };
const { answers } = await jev.ask(state, ticket);

answers.team.choice; // "billing" | "technical"
answers.severity.legend["2"]; // "cosmetic" | "degraded" | "blocking"
answers.wantsHuman.noul; // number
```

Use `AnswersOf` to name the whole shape.

```ts
import type { AnswersOf } from "@rbxts/jev";

type TicketAnswers = AnswersOf<(typeof ticket)["questions"]>;
```

`choice` sorts its option names alphabetically, because Lua tables keep no declaration order.
`oneOf` keeps the order you pass.

## Reading confidence

Choice, Score, and Box answers carry a `confidence` from 0 to 1. It measures how concentrated the
model's probability is. A value near 1 means one outcome dominates. A value near 0 means the
model was torn.

A Noul has no `confidence`, because its single probability already carries it. A value near 0.5
means the model is unsure.

| Answer | Confidence is computed from |
| - | - |
| Choice | How far the top probability sits above an even split |
| Score | How far the probability sits from the most likely level, so two adjacent levels count as less torn than two distant ones |
| Noul | Not provided. Use the distance of the probability from 0.5 |

If the API omits `confidence`, the library derives it from `probabilities` with the same
formulas, so the field is always present on Choice and Score answers. `choiceConfidence`,
`scoreConfidence`, and `noulConfidence` are exported if you want to compute your own.

## Reading a score

Your levels are numbered from 0, in the order you wrote them.

```ts
const mood = score("How polite?", "polite", "neutral", "rude");
//                                 level 0   level 1    level 2
```

The model does not pick one level. It gives every level a probability, and the `score` is those
probabilities weighted by the level numbers. So `score` is a position on the scale and can fall
between two levels.

| Probabilities | Score | Reads as |
| - | - | - |
| `polite` 1.0 | 0 | Clearly polite |
| `polite` 0.7, `neutral` 0.3 | 0.3 | Polite, with a little neutral |
| `neutral` 1.0 | 1 | Clearly neutral |
| `neutral` 0.57, `rude` 0.43 | 1.43 | Between neutral and rude, nearer rude |
| `rude` 1.0 | 2 | Clearly rude |

The arithmetic for the second row is `0 × 0.7 + 1 × 0.3 = 0.3`.

The answer also carries the breakdown.

```ts
answers.mood.score; // 0.3
answers.mood.legend["0"]; // "polite", the text of level 0
answers.mood.probabilities["0"]; // 0.7, the weight on level 0
answers.mood.probabilities["1"]; // 0.3, the weight on level 1
```

Use the score when you want a smooth value to compare against a threshold, such as "rude above 1.5".
If you need a single level, round the score, or read the level with the highest probability. A
score alone can mislead: `0.5` on `polite` and `0.5` on `rude` gives a score of 1, which is the
`neutral` level, although the model gave `neutral` no weight at all. When that matters, look at
`probabilities` and `confidence`, and treat a low confidence as "the model was torn".

## Passing state

State is the material you would show a panel of experts before asking for a judgment.

- Use an object, and give each part a descriptive name.
- Include only what the questions need. Extra context distracts the model.
- Point a question at a part of the state with a backticked path, such as
  `` `npc.name` ``.

```ts
choice(
	"What does the player want from `npc.role`? Judge `message`.",
	{ trade: "Buy or sell", help: "Ask for guidance" },
);
```

## Next

[Decisions](decisions) covers how to turn a confident or unsure answer into an action.
