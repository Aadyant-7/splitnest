# Interview questions

The original 20 questions below are preserved and unanswered, ordered from basic
to advanced. Inspect the corresponding implementation, tests and evidence before
practicing your explanation. The backend and local delivery baseline are verified;
the approved browser extension has not been implemented. See
[project status](project-status.md) and the [documentation index](README.md).

The detailed preparation sequence begins after the complete app is verified;
follow the [learning roadmap](learning-roadmap.md). Describe decisions you can
explain and demonstrations you can reproduce. Do not claim a frontend, public
production service or repeatable performance improvement from a plan or one run.

1. What problem does SplitNest solve, and what is deliberately outside its scope?
2. What does Spring Boot provide beyond a plain Java application?
3. Why do controllers, services, and repositories have different responsibilities?
4. Why return DTO records instead of JPA entities from the API?
5. How do PostgreSQL and Flyway work together when the application starts?
6. Why use BigDecimal and integer paise for splitting an expense?
7. How do you split 100.00 among three members, and why is the remainder assignment deterministic?
8. What is the difference between authentication and authorization in a group endpoint?
9. What does a JWT contain, how is it verified, and what can logout actually revoke?
10. Why are passwords hashed with BCrypt while refresh tokens are hashed with SHA-256?
11. How does refresh-token rotation behave under concurrent requests and token replay?
12. What does the expense transaction guarantee, and what needs a lock in addition to a transaction?
13. How are SQL balances calculated without multiplying payments or losing former members' history?
14. How do tests prove that one group's users cannot access another group's resources?
15. Why does the rate limiter use Redis, and what goes wrong if INCR and EXPIRE are separate operations?
16. When are cached balances invalidated, and what stale-read race can still occur?
17. Why start imports after commit, and how do atomic job claims and recovery handle crashes or executor rejection?
18. What changes when two Kubernetes app replicas run scheduled work, and how do probes, ShedLock, and the HPA help?
19. How does a source commit become a running image through CI, GHCR, and Argo CD, and what does Git rollback not undo?
20. What evidence supports your performance claims, and what must change before this local deployment could serve production traffic reliably?

## Future browser-extension questions

These additional questions concern the accepted design. Keep them unanswered
here and revisit them against real code and tests after implementation. They do
not alter the original 20-question list.

- **F1.** How does a React interaction become a typed HTTP request, and which rules must remain authoritative on the backend?
- **F2.** Why keep the access token in memory and the refresh token in an HttpOnly cookie, and which CSRF protections does that require?
- **F3.** How do multiple tabs coordinate refresh/logout without triggering token-family replay revocation or reviving a signed-out session?
- **F4.** How do component tests and end-to-end browser tests catch different failures, including 403/404 boundaries and expired sessions?
- **F5.** How can one Spring Boot image serve both API routes and browser navigation without turning API errors into HTML responses?
- **F6.** What must change in the build and promotion source profile so a frontend-only commit reaches the local Kubernetes app?

The eventual full-stack resume explanation must be based on the final verified
journeys, not just the presence of React files. Current backend demo commands
remain in [demo.md](demo.md); browser commands and screenshots will be added when
they exist.
