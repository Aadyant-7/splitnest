# SplitNest

An expense-sharing REST API for flatmates, families, and travel groups,
designed to demonstrate Java backend development and the delivery of one
application through Docker, Kubernetes, CI/CD, and monitoring.

**Status: analysis and execution plan completed; application implementation
has not started.** There are no application test or deployment results yet.

The planned application supports authentication, group membership, exact equal
expense splits, balances, background statement imports, and category budgets.
Swagger UI will provide the interactive API interface.

Planned stack: Java 21, Spring Boot, PostgreSQL, Flyway, Redis, Maven,
Docker Compose, GitHub Actions/GHCR, kind, Kustomize, Argo CD,
Prometheus/Grafana, and k6.

- [Execution plan and acceptance gates](docs/development-plan.md)
- [Windows setup and GitHub instructions](docs/setup.md)
- [Learning guide](docs/learning-guide.md)
- [Interview questions](docs/interview-prep.md)
- [Original feature specification and working instructions](agents.md)

Run commands, verified architecture diagrams, test results, and demonstration
evidence will be added as the corresponding milestones are implemented.
