# Node is a build tool only; the final application still runs entirely on the JRE.
FROM node:24.22.0-alpine@sha256:44fce696f38ba8c987c4db89954051000bbd05ffd8d8659ba15ed4a8602e937f AS frontend
WORKDIR /workspace/frontend
COPY frontend/package.json frontend/package-lock.json frontend/.npmrc frontend/.nvmrc ./
RUN test "$(node --version)" = "v24.22.0" && test "$(npm --version)" = "11.19.1" \
    && npm ci --ignore-scripts --no-audit
COPY frontend/ ./
RUN npm run build

# Pin the official Java 21 images so a rebuild does not silently change the operating system.
FROM eclipse-temurin:21-jdk-alpine@sha256:0bfc69a4758a86710e5c474032d28400a8bd00874766f9e8b1642ac2fd293159 AS build
WORKDIR /workspace

# Dependency downloads are cached until the POM or wrapper configuration changes.
COPY pom.xml mvnw ./
COPY .mvn/wrapper/maven-wrapper.properties .mvn/wrapper/maven-wrapper.properties
RUN chmod +x mvnw && ./mvnw -B -ntp -Dmaven.test.skip=true dependency:go-offline
COPY src/main src/main
COPY --from=frontend /workspace/frontend/dist/ src/main/resources/static/

# CI runs verify with real PostgreSQL/Redis before allowing an image to be published.
# A normal image build has no Docker daemon for Testcontainers, so it only packages the application.
RUN ./mvnw -B -ntp -Dmaven.test.skip=true package

# Refreshed Alpine patch release includes brotli-libs 1.2.1-r0 (CVE-2026-111497).
FROM eclipse-temurin:21-jre-alpine@sha256:82cf3d9ccbe1ed46252008d51b2f2329e6b9e8a2f4394c4bebefc3ea7f4b1372 AS runtime
LABEL org.opencontainers.image.title="SplitNest" \
      org.opencontainers.image.description="Expense-sharing web app and REST API" \
      org.opencontainers.image.source="https://github.com/Aadyant-7/splitnest"
RUN addgroup -S -g 10001 splitnest && adduser -S -D -H -u 10001 -G splitnest splitnest
WORKDIR /app
COPY --from=build --chown=10001:10001 /workspace/target/splitnest-*.jar /app/splitnest.jar
ENV JAVA_TOOL_OPTIONS="-XX:MaxRAMPercentage=65.0 -XX:+ExitOnOutOfMemoryError"
USER 10001:10001
EXPOSE 8080 9090
HEALTHCHECK --interval=10s --timeout=5s --start-period=90s --retries=12 \
    CMD wget -q -T 3 -O /dev/null http://127.0.0.1:9090/actuator/health/readiness || exit 1
ENTRYPOINT ["java", "-jar", "/app/splitnest.jar"]
