# ADR 0005: Coordinate daily budget checks with JDBC ShedLock

Status: accepted.

## Context

Spring's scheduler runs in each application process. Deploying two replicas
therefore produces two daily triggers. A Kubernetes Service distributes requests;
it does not choose one process to execute scheduled work.

## Decision

Apply ShedLock to the budget scheduler using the existing PostgreSQL database and
the Flyway-managed `shedlock` table. Use database time, initialize JDBC sessions
to UTC, hold the lock for at least one second and at most ten minutes.

Keep the unique group/category/month alert constraint and conflict-safe insertion.
Imports retain their own conditional job claims and locked completion protocol.

## Consequences

Only a scheduler holding the shared lease enters its budget method; another
contender skips. A crashed process cannot hold the lease forever. Work lasting
longer than the maximum lease needs a revised policy before its duration reaches
that boundary. Uniqueness remains necessary for retries and other callers.

UTC sessions are significant with the provider's UTC wall-clock SQL and the
schema's `TIMESTAMPTZ`: a session interpreting an unzoned value in a local timezone
would shift the recorded instant. Integration tests use independent providers
against real PostgreSQL to verify contention and release. They do not alone
prove that a live two-replica cluster ran only one scheduled invocation.
