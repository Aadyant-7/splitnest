# ADR 0002: Short-lived JWTs and rotating refresh families

Status: accepted.

## Context

Multiple app replicas should authenticate API calls without a shared HTTP session.
Users also need login continuity beyond a short access-token lifetime, with a
way to detect refresh-token reuse and log out.

## Decision

Use HS256 JWT access tokens for fifteen minutes, validated by Spring Security's
OAuth2 Resource Server support. Require an environment-supplied Base64 random key
of at least 32 bytes; validate issuer, audience, expiry and UUID subject.

Issue random opaque seven-day refresh tokens and store only their SHA-256 hashes.
Each login starts a family. Rotation revokes its input and creates a successor.
Replay revokes the family. All token mutations lock the owning user row before
reading token state, serializing rotation, replay and logout changes.

The transactional rotation service returns an explicit rejection value after
family revocation. Its caller raises HTTP 401 afterward, so exception rollback
cannot undo the revocation. Logout verifies ownership and revokes the family.
BCrypt protects human passwords, with a Unicode-aware 72-byte input boundary.

## Consequences

Access validation is stateless; refresh authorization still depends on PostgreSQL.
A token's signed payload is readable, so it contains no sensitive personal data.
Logout cannot invalidate an already-issued access JWT immediately; its remaining
life is bounded by fifteen minutes. A client must serialize refresh calls, since
concurrent use of one token triggers the replay policy. The same symmetric signing
key must reach every replica securely. The user lock favors clear correctness
over parallel refresh processing for one account's separate sessions.
