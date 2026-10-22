# ADR 0001: One application, organized by feature

Status: accepted. See [architecture](../architecture.md) and the
[implementation map](../implementation.md).

## Context

SplitNest has closely related users, groups, money records and imports, with
shared consistency rules and a single local deployment. Splitting these features
into independently deployed services would introduce
network failures and cross-service consistency work before the financial rules
were established.

## Decision

Use one Spring Boot application, one Maven module and one application image.
Organize packages by feature with controller/service/repository boundaries.
PostgreSQL is the durable authority; Redis supplies shared ephemeral state.
Background parsing runs in a bounded executor in the same application.

## Consequences

Expense and split writes share a local database transaction. Setup, testing,
deployment and debugging remain small enough to understand. App replicas can
scale together, while scheduled/background work still needs explicit coordination.
All features share a deployment and resource budget. If imports later need
independent scaling or ownership, that requirement can motivate extraction; it
does not justify adding microservices to the present scope.
