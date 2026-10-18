# Interview questions

Ordered from basic to advanced. Do not memorize answers before inspecting the
corresponding implementation and tests. This is a preparation checklist, not a
claim that these features are already built.

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
