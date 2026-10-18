# Pin the official Java 21 images so a rebuild does not silently change the operating system.
FROM eclipse-temurin:21-jdk-alpine@sha256:0bfc69a4758a86710e5c474032d28400a8bd00874766f9e8b1642ac2fd293159 AS build
WORKDIR /workspace

# Dependency downloads are cached until the POM or wrapper configuration changes.
COPY pom.xml mvnw ./
COPY .mvn/wrapper/maven-wrapper.properties .mvn/wrapper/maven-wrapper.properties
RUN chmod +x mvnw && ./mvnw -B -ntp -Dmaven.test.skip=true dependency:go-offline
COPY src/main src/main

# CI runs verify with real PostgreSQL/Redis before allowing an image to be published.
# A normal image build has no Docker daemon for Testcontainers, so it only packages the application.
RUN ./mvnw -B -ntp -Dmaven.test.skip=true package

FROM eclipse-temurin:21-jre-alpine@sha256:51ab5e3302e7141ce665ca3ea85e8b5cd648eafbc3c0c90dd79d6537684e4555 AS runtime
LABEL org.opencontainers.image.title="SplitNest" \
      org.opencontainers.image.description="Expense-sharing REST API" \
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
