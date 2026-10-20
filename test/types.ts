/** Compile-time assertions. `bun test` does not run this file; `tsc -p
 * tsconfig.node.json` does. A failure here means the inference contract broke. */
import type { AnswersOf } from "../src/core/answers";
import { choice, noul, oneOf, questions, score } from "../src/core/questions";
import type { Decision } from "../src/core/decisions";

type Equals<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;

function assertType<T extends true>(): void {
	void (0 as unknown as T);
}

const ticket = questions("ticket", {
	department: choice("Which team?", { billing: "Money", technical: "Bugs" }),
	frustration: score("How frustrated?", "calm", "tense", "angry"),
	wantsHuman: noul("Wants a human?"),
});

type TicketAnswers = AnswersOf<(typeof ticket)["questions"]>;

assertType<Equals<TicketAnswers["department"]["choice"], "billing" | "technical">>();
assertType<Equals<TicketAnswers["frustration"]["score"], number>>();
assertType<Equals<TicketAnswers["frustration"]["legend"]["1"], "calm" | "tense" | "angry">>();
assertType<Equals<TicketAnswers["wantsHuman"]["noul"], number>>();

const bare = questions("bare", { team: oneOf("Which?", "red", "blue", "green") });
type BareAnswers = AnswersOf<(typeof bare)["questions"]>;
assertType<Equals<BareAnswers["team"]["choice"], "red" | "blue" | "green">>();

const named = questions("named", { yes: noul("Yes?") });
assertType<Equals<(typeof named)["name"], "named">>();

const decision: Decision<"billing" | "technical"> = {
	verdict: "act",
	value: "billing",
	confidence: 1,
};
void decision;

export {};
