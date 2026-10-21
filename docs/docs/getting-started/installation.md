---
title: Installation
sidebar_position: 2
---

# Installation

This page gets the package into a roblox-ts project and the key into a Roblox secret.

## Install the package

```bash
npm install @rbxts/jev
```

The package lives in the `@rbxts` scope, so a project from `npm init roblox-ts` already resolves it.

Your Rojo project needs the standard roblox-ts include tree. A project from
`npm init roblox-ts` already has it.

```json
"ReplicatedStorage": {
  "$className": "ReplicatedStorage",
  "rbxts_include": {
    "$path": "include",
    "node_modules": {
      "$className": "Folder",
      "@rbxts": { "$path": "node_modules/@rbxts" }
    }
  }
}
```

You do not need a transformer or a separate Promise package. roblox-ts 3.0 ships the Promise
runtime.

## Turn on HTTP

In Studio, open File > Experience Settings > Security and turn on **Allow HTTP Requests**.
Without it, calls fail with an `http_disabled` error.

## Add your API key as a secret

Create a key at [console.typesafe.ai](https://console.typesafe.ai/keys), then store it as a
Roblox secret named `TYPESAFE_API_KEY`.

| Where you test | Where to add the secret |
| - | - |
| Studio playtest | File > Experience Settings > Security > Local Secrets |
| A published game | Creator Dashboard > your experience > Secrets |

Scope the secret to the domain `api.typesafe.ai`.

```ts
import { createJev } from "@rbxts/jev";

const jev = createJev({ apiKeySecret: "TYPESAFE_API_KEY" });
```

`HttpService:GetSecret` returns a `Secret` that cannot be printed. The library puts it straight
into the `authorization` header, so the key never exists as a string in your game.

`createJev` accepts a plain `apiKey` for quick experiments. Do not ship it.

:::warning
Create `createJev` on the server. It reads the secret immediately, and a secret is not readable
from a `LocalScript`.
:::

## Next

[Make your first request](quick-start).
