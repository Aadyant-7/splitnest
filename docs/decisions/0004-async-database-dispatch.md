# ADR 0004: Database-backed imports with bounded asynchronous workers

Status: accepted.

## Context

Statement parsing should not occupy the upload request. An in-memory event alone
can disappear after upload commit, and several app replicas can try the same job.
The project does not require a separate message broker.

## Decision

Store the file and `PENDING` job in PostgreSQL, then dispatch after commit through
a bounded `@Async` executor. A periodic dispatcher also scans pending jobs. Both
paths must atomically claim `PENDING -> PROCESSING` before parsing.

Parse outside the persistence transaction, enforcing upload/row/ZIP/numeric bounds.
Completion locks the job, requires `PROCESSING`, locks the group, rechecks uploader
membership and persists all valid expenses plus `COMPLETED` together. Clear file
bytes after either terminal outcome. Recover jobs whose `started_at` is over ten
minutes old at startup and periodically. Failed jobs require a new upload.

## Consequences

A lost event or full queue leaves durable work for the dispatcher. Claims prevent
duplicate workers; the final row lock prevents a worker fenced by recovery from
committing expenses. Membership changes and imports agree on one roster. Invalid
rows are skipped, while any persistence failure rolls back the valid batch too.

Database polling adds a small query load, and workers share app CPU/memory. This
is not a general queue with automatic retries/dead-letter handling. A broker would
be justified by independent consumers, much larger throughput or operationally
required retry/delivery features. It would still require idempotent persistence;
introducing a broker alone would not create exactly-once expense writes.
