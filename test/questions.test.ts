import { describe, expect, test } from "bun:test";
import { describeQuestionSet, formatQuestionSet, choice, noul, oneOf, questions, score, toWireQuestions } from "../src/core/questions";
import { box } from "../src/core/questions";

const ticket = questions("ticket", {
	department: choice("Which team handles this?", {
		billing: "Payments and refunds",
		technical: "Bugs and integrations",
	}),
	frustration: score("How frustrated is the player?", "calm", "tense", "angry"),
	wantsHuman: noul("Is the player asking for a human?"),
});

describe("question definitions", () => {
	test("preserves ids and option order", () => {
		expect(ticket.name).toBe("ticket");
		expect(ticket.ids).toEqual(["department", "frustration", "wantsHuman"]);
		expect(ticket.questions.department.options).toEqual(["billing", "technical"]);
	});

	test("choice sorts options so the order is stable across runs", () => {
		const shuffled = choice("Which?", { trade: "t", insult: "i", help: "h" });
		expect(shuffled.options).toEqual(["help", "insult", "trade"]);
	});

	test("oneOf keeps the order it was given", () => {
		const ordered = oneOf("Which?", "trade", "help", "insult");
		expect(ordered.options).toEqual(["trade", "help", "insult"]);
	});

	test("an undescribed option is sent with its own name", () => {
		const set = questions("bare", { team: oneOf("Which team?", "a", "b") });
		const wire = toWireQuestions(set) as { team: { criteria: Record<string, unknown> } };
		expect(wire.team.criteria).toEqual({ a: "a", b: "b" });
	});

	test("descriptions survive the wire conversion", () => {
		const wire = toWireQuestions(ticket) as {
			department: { type: string; instructions: unknown; criteria: Record<string, unknown> };
		};
		expect(wire.department.type).toBe("choice");
		expect(wire.department.criteria.billing).toBe("Payments and refunds");
	});

	test("structured instructions pass through untouched", () => {
		const set = questions("structured", {
			match: noul({ question: "Does `a` equal `b`?", a: 1, b: 1 }),
		});
		const wire = toWireQuestions(set) as { match: { instructions: unknown } };
		expect(wire.match.instructions).toEqual({ question: "Does `a` equal `b`?", a: 1, b: 1 });
	});

	test("score levels stay ordered", () => {
		const set = questions("levels", { severity: score("How bad?", "low", "medium", "high") });
		const wire = toWireQuestions(set) as { severity: { criteria: ReadonlyArray<string> } };
		expect(wire.severity.criteria).toEqual(["low", "medium", "high"]);
	});

	test("box questions are flagged as needing images", () => {
		const set = questions("image", { target: box("the mug") });
		expect(formatQuestionSet(set)).toContain("box");
	});

	test("rejects an empty question set", () => {
		expect(() => questions("empty", {})).toThrow(/no questions/);
	});

	test("rejects a score with more than ten levels", () => {
		expect(() =>
			questions("tooMany", {
				bad: score("How many?", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11"),
			}),
		).toThrow(/between 1 and 10 levels/);
	});

	test("rejects a choice with no options", () => {
		expect(() => choice("Which?", {})).toThrow(/between 1 and 255 options/);
	});

	test("preview lists every id with its answer shape", () => {
		const summary = describeQuestionSet(ticket);
		expect(summary.name).toBe("ticket");
		expect(summary.questions.map((q) => q.id)).toEqual(["department", "frustration", "wantsHuman"]);
		expect(summary.questions[0].detail).toContain("billing | technical");
		expect(summary.questions[1].detail).toContain("3 levels");
		expect(summary.questions[2].detail).toContain("probability");
		expect(formatQuestionSet(ticket)).toContain("wantsHuman  noul");
	});
});
