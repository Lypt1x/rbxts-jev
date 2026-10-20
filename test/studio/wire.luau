local ReplicatedStorage = game:GetService("ReplicatedStorage")
local HttpService = game:GetService("HttpService")

local include = ReplicatedStorage:WaitForChild("rbxts_include")
local TS = require(include:WaitForChild("RuntimeLib"))
local context = Instance.new("ModuleScript")
local jev = TS.import(context, include, "node_modules", "@rbxts", "jev", "out")

local failures = 0
local function check(name, condition, detail)
	if condition then
		print("PASS " .. name)
	else
		failures += 1
		print("FAIL " .. name .. (detail and (" :: " .. detail) or ""))
	end
end

local ok, set = pcall(function()
	return jev.questions("wire", {
		bare = jev.oneOf("Which?", "red", "blue"),
		described = jev.choice("Which team?", { billing = "Money", technical = "Bugs" }),
		level = jev.score("How bad?", "low", "medium", "high"),
		yes = jev.noul("Yes?"),
	})
end)
check("builders run under real Luau", ok, tostring(set))
if not ok then
	print("RESULT failures=" .. failures)
	return
end

local wire = jev.toWireQuestions(set)
local encoded = HttpService:JSONEncode(wire)
print("ENCODED " .. encoded)
local decoded = HttpService:JSONDecode(encoded)

local bareCriteria = decoded.bare.criteria
check("bare choice criteria is an object with both options", bareCriteria.red == "red" and bareCriteria.blue == "blue", encoded)
check("described choice keeps its descriptions", decoded.described.criteria.billing == "Money" and decoded.described.criteria.technical == "Bugs")
check("score levels stay ordered", decoded.level.criteria[1] == "low" and decoded.level.criteria[3] == "high")
check("noul has no criteria key when none given", decoded.yes.criteria == nil)

local ids = set.ids
check("question ids are sorted", ids[1] == "bare" and ids[2] == "described" and ids[3] == "level" and ids[4] == "yes", table.concat(ids, ","))
check("choice options are sorted", set.questions.described.options[1] == "billing" and set.questions.described.options[2] == "technical")

local parsed = jev.parseAnswers({
	bare = { type = "choice", choice = "red", probabilities = { red = 0.9, blue = 0.1 } },
	described = { type = "choice", choice = "technical", confidence = 0.8, probabilities = { billing = 0.2, technical = 0.8 } },
	level = { type = "score", score = 1.4, probabilities = { ["0"] = 0.1, ["1"] = 0.4, ["2"] = 0.5 } },
	yes = { type = "noul", noul = 0.82 },
}, set)
check("parseAnswers accepts a valid payload", parsed.ok, parsed.ok and "" or tostring(parsed.error.message))
if parsed.ok then
	check("derived choice confidence matches the formula", math.abs(parsed.value.bare.confidence - 0.8) < 1e-6, tostring(parsed.value.bare.confidence))
	check("score legend maps level to text", parsed.value.level.legend["1"] == "medium")
end

local rejected = jev.parseAnswers({
	bare = { type = "choice", choice = "green", probabilities = { red = 0.5, blue = 0.5 } },
	described = { type = "choice", choice = "billing", probabilities = { billing = 1, technical = 0 } },
	level = { type = "score", score = 0, probabilities = {} },
	yes = { type = "noul", noul = 0.5 },
}, set)
check("parseAnswers rejects a choice outside the options", (not rejected.ok) and rejected.error.kind == "malformed_response")

local decision = jev.decide({ type = "noul", noul = 0.9 })
check("decide maps a noul to yes", decision.value == "yes" and decision.verdict == "act")

local delegated = jev.delegate(decision, {
	act = function()
		error("handler exploded")
	end,
	reject = function() return "no" end,
})
check("delegate captures a throwing handler", (not delegated.ok) and delegated.error.kind == "handler")

print("RESULT failures=" .. failures)
