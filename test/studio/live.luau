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

print("HttpEnabled=" .. tostring(HttpService.HttpEnabled))

local secretOk, secretError = pcall(function()
	return HttpService:GetSecret("TYPESAFE_API_KEY")
end)
check("secret TYPESAFE_API_KEY is readable", secretOk, tostring(secretError))
if not secretOk then
	print("RESULT failures=" .. failures)
	return
end

local clientOk, client = pcall(function()
	return jev.createJev({ apiKeySecret = "TYPESAFE_API_KEY", retries = 0, timeoutMs = 20000 })
end)
check("createJev accepts the secret", clientOk, tostring(client))
if not clientOk then
	print("RESULT failures=" .. failures)
	return
end

local set = jev.questions("live", {
	greeting = jev.noul("Is the message a greeting?"),
	topic = jev.choice("What is the message about?", {
		trade = "Buying or selling",
		social = "Saying hello or chatting",
	}),
})

local awaited, result = client:attempt({ message = "hello there, friend" }, set):await()
check("the request settled", awaited, tostring(result))
if awaited then
	check("TypeSafe answered", result.ok, result.ok and "" or result.error:toString())
	if result.ok then
		local greeting = result.value.answers.greeting.noul
		check("noul is a probability", greeting >= 0 and greeting <= 1, tostring(greeting))
		check("choice is one of the options", result.value.answers.topic.choice == "trade" or result.value.answers.topic.choice == "social")
		print(`model={result.value.model} greeting={greeting} topic={result.value.answers.topic.choice}`)
	end
end

print("RESULT failures=" .. failures)
