---
title: Async model
sidebar_position: 4
---

# Async model

This page explains how requests are scheduled, retried, and shared, and what a timeout does and
does not stop.

## Everything returns a promise

`ask`, `attempt`, and `attemptAll` return promises and never block the calling thread. You can use
`await` inside an `async` function, or `.then` and `.catch`. roblox-ts 3.0 provides the Promise
runtime, so you install nothing extra.

| Method | On failure |
| - | - |
| `ask` | Rejects with a `JevError` |
| `attempt` | Resolves with `{ ok: false, error }` |
| `attemptAll` | Resolves with one `Result` per state |

Use `attempt` where you would rather branch on a result than write `try` and `catch`.

Use `attemptAll` for several states at once. A plain `Promise.all` over `ask` calls cancels the
remaining requests after the first one fails. `attemptAll` runs every call and reports each one.

## One shared budget

Roblox allows a server 500 external HTTP requests per minute, and that budget covers everything the
server sends. The client keeps its own share of it.

| Setting | Default | What it does |
| - | - | - |
| `requestsPerMinute` | 240 | The sustained rate, as a leaky bucket |
| `burst` | 24 | How many requests may go out at once before the rate applies |
| `maxConcurrent` | 4 | How many requests may be in flight at once |

The limiter is shared by every call on a client, including requests that come from players. Calls
queue in order and wait for a free slot.

## Retries

A failure is retried only if it may pass: `rate_limit`, `overloaded`, `timeout`, `network`, or
`server`. Auth, validation, and malformed responses fail at once.

The delay grows exponentially from 250 ms up to 8 seconds, with full jitter so that many servers do
not retry in step. If the API sends a `retry-after` header, that value is used instead. The client
retries twice by default, so a call makes at most three attempts. Set `retries` to change it.

## Sharing and caching

Two identical calls that overlap share one request. This is always on.

A repeated call after the first one finishes is not cached unless you set `cacheTtlMs`. It defaults
to 0. A cached judgment about a player can be stale in ways that matter, so the library does not
cache unless you ask.

## Timeouts

`timeoutMs` defaults to 12000. A call that exceeds it fails with a `timeout` error, and that error
is retried.

Roblox offers no way to abort an `HttpService:RequestAsync` call that has started. After a timeout,
the library stops waiting and discards the result, but the request may still finish in the
background.

## Watching what happens

Pass `onEvent` to `createJev` to see each step.

| Event | When |
| - | - |
| `request` | An attempt is about to go out |
| `response` | A response arrived, with its status and latency |
| `retry` | A retry is scheduled, with the delay and the cause |
| `cache_hit` | A call was answered from the cache |
| `error` | A call failed for good |

`stats()` returns counters for requests, retries, cache hits, shared calls, and errors. A listener
that throws is caught and logged, so it cannot break a request.

Set `debug: true` to print each question set's shape on first use and to log retries and errors.

## Next

[Handle errors](../guides/handle-errors) lists every error kind and what to do about it.
