import { describe, expect, test } from "bun:test";
import { decide, delegate, delegateAsync, match, routeChoice } from "../src/core/decisions";
import { choiceConfidence, noulConfidence, scoreConfidence } from "../src/core/confidence";
import type { BoxAnswer, ChoiceAnswer, NoulAnswer, ScoreAnswer } from "../src/core/answers";

const actChoice: ChoiceAnswer<"a" | "b"> = {
	type: "choice",
	choice: "a",
	confidence: 0.95,
	probabilities: { a: 0.95, b: 0.05 },
};

const unsureChoice: ChoiceAnswer<"a" | "b"> = {
	type: "choice",
	choice: "a",
	confidence: 0.55,
	probabilities: { a: 0.55, b: 0.45 },
};

const lostChoice: ChoiceAnswer<"a" | "b"> = {
	type: "choice",
	choice: "a",
	confidence: 0.2,
	probabilities: { a: 0.2, b: 0.8 },
};

const scoreAnswer: ScoreAnswer = {
	type: "score",
	score: 1.5,
	confidence: 0.5,
	legend: { "0": "low", "1": "medium", "2": "high" },
	probabilities: { "0": 0.2, "1": 0.3, "2": 0.5 },
};

const noulAnswer: NoulAnswer = { type: "noul", noul: 0.9 };
const boxAnswer: BoxAnswer = {
	type: "box",
	box: { top: 0.1, bottom: 0.5, left: 0.2, right: 0.6 },
	confidence: 0.7,
};

describe("confidence formulas", () => {
	test("choice confidence matches the published formula", () => {
		expect(choiceConfidence([0.8, 0.15, 0.05])).toBeCloseTo(0.7, 5);
		expect(choiceConfidence([1 / 3, 1 / 3, 1 / 3])).toBeCloseTo(0, 5);
	});

	test("score confidence penalizes distance from the peak", () => {
		expect(scoreConfidence([0, 0.5, 0.5])).toBeCloseTo(0.25, 5);
		expect(scoreConfidence([0.5, 0, 0.5])).toBeCloseTo(0, 5);
	});

	test("noul confidence is distance from a coin flip", () => {
		expect(noulConfidence(0.5)).toBeCloseTo(0, 5);
		expect(noulConfidence(0.75)).toBeCloseTo(0.5, 5);
		expect(noulConfidence(1)).toBeCloseTo(1, 5);
	});
});

describe("decide", () => {
	test("acts above the act threshold", () => {
		const decision = decide(actChoice);
		expect(decision.verdict).toBe("act");
		expect(decision.value).toBe("a");
	});

	test("asks for confirmation between thresholds", () => {
		expect(decide(unsureChoice).verdict).toBe("confirm");
	});

	test("rejects below the reject threshold", () => {
		expect(decide(lostChoice).verdict).toBe("reject");
	});

	test("score carries the fractional value", () => {
		const decision = decide(scoreAnswer);
		expect(decision.verdict).toBe("confirm");
		expect(decision.value).toBe(1.5);
	});

	test("noul maps to yes or no and gates on probability", () => {
		const decision = decide(noulAnswer);
		expect(decision.verdict).toBe("act");
		expect(decision.value).toBe("yes");
		expect(decision.confidence).toBeCloseTo(0.8, 5);
		expect(decide({ type: "noul", noul: 0.1 }).verdict).toBe("reject");
		expect(decide({ type: "noul", noul: 0.1 }).value).toBe("no");
	});

	test("box carries the coordinates", () => {
		const decision = decide(boxAnswer);
		expect(decision.value.top).toBe(0.1);
	});

	test("a box without confidence still returns the box and rejects", () => {
		const decision = decide({ ...boxAnswer, confidence: undefined });
		expect(decision.value.bottom).toBe(0.5);
		expect(decision.confidence).toBe(0);
		expect(decision.verdict).toBe("reject");
	});

	test("a reversed gate is normalized rather than throwing", () => {
		expect(decide(actChoice, { act: 0.2, reject: 0.9 }).verdict).toBe("act");
	});
});

describe("delegate", () => {
	test("routes to the handler for the verdict", () => {
		const result = delegate(decide(actChoice), {
			act: (value) => `act:${value}`,
			confirm: (value) => `confirm:${value}`,
			reject: (value) => `reject:${value}`,
		});
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.value).toBe("act:a");
	});

	test("missing confirm falls back to reject", () => {
		const result = delegate(decide(unsureChoice), {
			act: () => "act",
			reject: () => "reject",
		});
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.value).toBe("reject");
	});

	test("captures a throw from a handler", () => {
		const result = delegate(decide(actChoice), {
			act: () => {
				throw new Error("handler exploded");
			},
			reject: () => "reject",
		});
		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.error.kind).toBe("handler");
		expect(result.error.cause).toBeDefined();
	});

	test("match is the same function", () => {
		expect(match).toBe(delegate);
	});

	test("delegateAsync captures a rejected handler", async () => {
		const result = await delegateAsync(decide(actChoice), {
			act: async () => {
				throw new Error("async exploded");
			},
			reject: async () => "reject",
		});
		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.error.kind).toBe("handler");
	});

	test("delegateAsync awaits a resolving handler", async () => {
		const result = await delegateAsync(decide(actChoice), {
			act: async (value) => `act:${value}`,
			reject: async () => "reject",
		});
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.value).toBe("act:a");
	});
});

describe("routeChoice", () => {
	const handlers = {
		a: () => "handled:a",
		b: () => "handled:b",
	};

	test("calls the handler for the selected option", () => {
		const result = routeChoice(actChoice, handlers);
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.value).toBe("handled:a");
	});

	test("calls onUnsure between thresholds", () => {
		const result = routeChoice(unsureChoice, handlers, { onUnsure: () => "asked" });
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.value).toBe("asked");
	});

	test("returns undecided when unsure and no handler exists", () => {
		const result = routeChoice(unsureChoice, handlers);
		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.error.kind).toBe("undecided");
	});

	test("captures a throwing handler", () => {
		const result = routeChoice(actChoice, {
			a: () => {
				throw new Error("boom");
			},
			b: () => "b",
		});
		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.error.kind).toBe("handler");
	});
});
