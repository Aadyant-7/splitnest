# ADR 0003: Redis for shared limiting and balance caching

Status: accepted.

## Context

An in-memory login counter would give each app replica a separate allowance.
Balance aggregates are useful cache candidates, but group access can change and
Redis may be unavailable. Those two uses require different failure policies.

## Decision

Implement fixed minute/hour windows with a Redis Lua script combining increment,
initial expiry and remaining-TTL lookup. Login keys use normalized email plus actual
IP; upload keys use user ID. Hash identity components in keys. Return 429 and
`Retry-After` when limited, or 503 when Redis cannot enforce the policy.

Cache typed JSON balance results for thirty seconds. Check membership in
`BalanceService` before crossing the separate `BalanceCalculator` cache proxy.
Evict the group after committed expense/import/membership changes. Cache operation
failures fall back to authoritative PostgreSQL reads.

## Consequences

Replicas enforce a shared request allowance. Lua prevents an increment/expiry
crash gap, but fixed windows permit boundary bursts. Redis outages temporarily
reject login/uploads while balances can remain available. Readiness excludes
Redis to preserve that deliberate degraded mode.

The cache is bounded eventual consistency: an old in-flight read can fill after
an eviction. Its entry expires thirty seconds after insertion unless another
mutation evicts it earlier. Financial writes remain transactional in PostgreSQL;
the cache does not promise linearizable reads. Fresh membership checks prevent
cached results from restoring a removed user's access.
