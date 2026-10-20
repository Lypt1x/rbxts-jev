import { createJev, questions, noul } from "@rbxts/jev";

export const probe = questions("probe", { ok: noul("Is this a test?") });
export const jev = createJev({ apiKeySecret: "TYPESAFE_API_KEY" });
