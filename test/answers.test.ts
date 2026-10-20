import { describe, expect, test } from "bun:test";
import { parseAnswers, parseSystemOneResponse } from "../src/core/answers";
import { choice, noul, questions, score } from "../src/core/questions";

const set = questions("ticket", {
	department: choice("Which team?", { billing: "Money", technical: "Bugs" }),
	frustration: score("How frustrated?", "calm", "tense", "angry"),
	wantsHuman: noul("Wants a human?"),
});

const valid = {
	model: "jev-1.14.0",
	answers: {
		department: {
			type: "choice",
			choice: "technical",
			confidence: 0.9,
			probabilities: { billing: 0.1, technical: 0.9 },
		},
		frustration: {
			type: "score",
			score: 1.4,
			probabilities: { "0": 0.1, "1": 0.4, "2": 0.5 },
		},
		wantsHuman: { type: "noul", noul: 0.82 },
	},
	usage: { input_tokens: 120, output_tokens: 12 },
};

describe("answer parsing", () => {
	test("returns typed answers keyed by id", () => {
		const parsed = parseAnswers(valid.answers, set);
		expect(parsed.ok).toBe(true);
		if (!parsed.ok) return;
		expect(parsed.value.department.choice).toBe("technical");
		expect(parsed.value.department.confidence).toBe(0.9);
		expect(parsed.value.frustration.score).toBe(1.4);
		expect(parsed.value.frustration.legend["1"]).toBe("tense");
		expect(parsed.value.wantsHuman.noul).toBe(0.82);
	});

	test("derives confidence from probabilities when the field is absent", () => {
		const parsed = parseAnswers({ ...valid.answers, department: { ...valid.answers.department, confidence: undefined } }, set);
		expect(parsed.ok).toBe(true);
		if (!parsed.ok) return;
		expect(parsed.value.department.confidence).toBeCloseTo(0.8, 5);
	});

	test("derives score confidence from the level spread", () => {
		const parsed = parseAnswers({ ...valid.answers, frustration: { ...valid.answers.frustration, confidence: undefined } }, set);
		expect(parsed.ok).toBe(true);
		if (!parsed.ok) return;
		expect(parsed.value.frustration.confidence).toBeCloseTo(0.1, 5);
	});

	test("rejects a choice outside the options", () => {
		const parsed = parseAnswers({ ...valid.answers, department: { ...valid.answers.department, choice: "sales" } }, set);
		expect(parsed.ok).toBe(false);
		if (parsed.ok) return;
		expect(parsed.error.kind).toBe("malformed_response");
		expect(parsed.error.questionId).toBe("department");
	});

	test("rejects a probability outside 0..1", () => {
		const parsed = parseAnswers(
			{ ...valid.answers, department: { ...valid.answers.department, probabilities: { billing: 1.4, technical: 0.1 } } },
			set,
		);
		expect(parsed.ok).toBe(false);
	});

	test("rejects a missing answer", () => {
		const { department, ...rest } = valid.answers;
		void department;
		const parsed = parseAnswers(rest, set);
		expect(parsed.ok).toBe(false);
		if (parsed.ok) return;
		expect(parsed.error.message).toContain("missing from the response");
	});

	test("rejects a noul outside 0..1", () => {
		const parsed = parseAnswers({ ...valid.answers, wantsHuman: { type: "noul", noul: 1.2 } }, set);
		expect(parsed.ok).toBe(false);
	});

	test("parses the full response envelope", () => {
		const parsed = parseSystemOneResponse(valid, set);
		expect(parsed.ok).toBe(true);
		if (!parsed.ok) return;
		expect(parsed.value.model).toBe("jev-1.14.0");
		expect(parsed.value.usage.input_tokens).toBe(120);
	});

	test("rejects a response without a model", () => {
		const parsed = parseSystemOneResponse({ answers: valid.answers, usage: valid.usage }, set);
		expect(parsed.ok).toBe(false);
	});

	test("ignores extra answer fields", () => {
		const parsed = parseAnswers(
			{ ...valid.answers, department: { ...valid.answers.department, unexpected: true } },
			set,
		);
		expect(parsed.ok).toBe(true);
	});
});
