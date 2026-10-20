---
title: Quick start
sidebar_position: 3
---

# Quick start

This page makes one request and prints a typed decision. It assumes you finished
[Installation](installation).

## Write the script

Create `src/server/decision.server.ts` and paste this file.

```ts
import { choice, createJev, noul, questions, score } from "@rbxts/jev";

const jev = createJev({ apiKeySecret: "TYPESAFE_API_KEY" });

const npc = questions("npc", {
	intent: choice("What does the player want?", {
		trade: "Buy or sell something",
		help: "Ask for guidance",
		insult: "Say something hostile",
	}),
	mood: score("How polite is the player?", "polite", "neutral", "rude"),
	mentionsGold: noul("Does the player mention gold?"),
});

const state = { message: "I have gold. What can you sell me?" };

jev.ask(state, npc)
	.then(({ answers }) => {
		print(answers.intent.choice, answers.intent.confidence);
		print(answers.mood.score, answers.mood.legend["0"]);
		print(answers.mentionsGold.noul);
	})
	.catch((caught) => warn(tostring(caught)));
```

## Run it

1. Build and sync the project.

```bash
npx rbxtsc
rojo serve
```

2. Connect from Studio and press **Play**.
3. Read the Output window.

You should see three lines like these. They are an example, and the numbers vary between runs.

```text
trade 0.91
0.3 polite
0.97
```

## What you just ran

- `questions` groups the three questions. Jev answers all of them in one request.
- `answers.intent.choice` has the type `"trade" | "help" | "insult"`. Rename an option and
  every use that no longer matches stops compiling.
- `answers.mood.score` is a position on your scale, not a level number. Your levels are numbered
  from 0 in the order you wrote them, so `polite` is 0, `neutral` is 1, and `rude` is 2. A score of
  `0.3` sits close to `polite`, with a little weight on `neutral`. See
  [Reading a score](../concepts/questions-and-answers#reading-a-score).
- `answers.mentionsGold.noul` is the probability that the answer is yes.

If the Output shows a line that starts with `[jev:`, see
[Handle errors](../guides/handle-errors) for the cause.

## Next

- [How it works](../concepts/how-it-works) explains why one request carries many questions.
- [Questions and answers](../concepts/questions-and-answers) covers the four question types.
- [Delegate a decision](../guides/delegate-a-decision) shows how to act on an answer safely.
