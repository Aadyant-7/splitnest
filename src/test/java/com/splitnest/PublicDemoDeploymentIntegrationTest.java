package com.splitnest;

import com.splitnest.auth.BrowserSessionCookies;
import com.zaxxer.hikari.HikariDataSource;
import jakarta.servlet.Filter;
import jakarta.servlet.http.HttpServletRequest;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.Map;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.boot.availability.AvailabilityChangeEvent;
import org.springframework.boot.availability.ReadinessState;
import org.springframework.boot.health.contributor.Health;
import org.springframework.boot.health.contributor.HealthIndicator;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.context.ConfigurableApplicationContext;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor;
import org.springframework.test.context.ActiveProfiles;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
        properties = "management.server.port=0")
@ActiveProfiles("public-demo")
@Import({TestcontainersConfiguration.class, PublicDemoDeploymentIntegrationTest.CaptureConfiguration.class})
class PublicDemoDeploymentIntegrationTest extends IntegrationTestSupport {
    @LocalServerPort private int port;
    @Autowired private ConfigurableApplicationContext application;
    @Autowired private RequestCapture capture;
    @Autowired private ControlledDatabaseHealth databaseHealth;
    @Autowired private HikariDataSource dataSource;
    @Autowired private BrowserSessionCookies cookies;
    @Autowired @Qualifier("importExecutor") private ThreadPoolTaskExecutor executor;
    private final HttpClient client = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).build();

    @Test
    void servesStatusOnlyReadinessOnTheMainPortAndRejectsOtherMethodsAndAdjacentPaths() throws Exception {
        var ready = request("GET", "/readyz", Map.of());
        assertThat(ready.statusCode()).isEqualTo(200);
        assertThat(json.readTree(ready.body())).isEqualTo(json.readTree("{\"status\":\"UP\"}"));
        var head = request("HEAD", "/readyz", Map.of());
        assertThat(head.statusCode()).isEqualTo(200);
        assertThat(head.body()).isEmpty();
        assertThat(request("POST", "/readyz", Map.of()).statusCode()).isEqualTo(401);
        assertThat(request("GET", "/readyz/extra", Map.of()).statusCode()).isEqualTo(401);
        assertThat(request("GET", "/actuator/prometheus", Map.of()).statusCode()).isEqualTo(401);
        assertThat(request("GET", "/actuator/env", Map.of()).statusCode()).isEqualTo(401);
    }

    @Test
    void readinessReturns503WhenTheApplicationRefusesTraffic() throws Exception {
        AvailabilityChangeEvent.publish(application, ReadinessState.REFUSING_TRAFFIC);
        try {
            var response = request("GET", "/readyz", Map.of());
            assertThat(response.statusCode()).isEqualTo(503);
            assertThat(json.readTree(response.body())).isEqualTo(json.readTree("{\"status\":\"OUT_OF_SERVICE\"}"));
        } finally {
            AvailabilityChangeEvent.publish(application, ReadinessState.ACCEPTING_TRAFFIC);
        }
    }

    @Test
    void aControlledDatabaseHealthFailureReturns503WithoutDiagnosticDetails() throws Exception {
        // Change only this test context's health contributor; do not stop a shared test database.
        databaseHealth.available = false;
        try {
            var response = request("GET", "/readyz", Map.of());
            assertThat(response.statusCode()).isEqualTo(503);
            assertThat(json.readTree(response.body())).isEqualTo(json.readTree("{\"status\":\"DOWN\"}"));
            assertThat(response.body()).doesNotContain("diagnostic", "jdbc", "password", "components", "details");
        } finally {
            databaseHealth.available = true;
        }
    }

    @Test
    void secureCookiesAndTheSmallerPoolsAreActiveForThePublicProfile() throws Exception {
        assertThat(cookies.secure()).isTrue();
        var response = request("GET", BrowserSessionCookies.AUTH_PATH + "/csrf", Map.of());
        assertThat(response.statusCode()).isEqualTo(200);
        assertThat(response.headers().firstValue("Set-Cookie")).hasValueSatisfying(value ->
                assertThat(value).contains("Secure", "HttpOnly", "SameSite=Strict", "Path=/api/v1/browser-auth"));
        assertThat(dataSource.getMaximumPoolSize()).isEqualTo(3);
        assertThat(dataSource.getMinimumIdle()).isZero();
        assertThat(executor.getCorePoolSize()).isEqualTo(1);
        assertThat(executor.getMaxPoolSize()).isEqualTo(1);
        assertThat(executor.getQueueCapacity()).isEqualTo(4);
    }

    @Test
    void theRealTomcatValveUsesTheEdgeClientHeaderAndIgnoresCallerXForwardedForValues() throws Exception {
        var first = request("GET", BrowserSessionCookies.AUTH_PATH + "/csrf", Map.of(
                "CF-Connecting-IP", "203.0.113.18", "X-Forwarded-For", "198.51.100.91", "X-Forwarded-Proto", "https"));
        assertThat(first.statusCode()).isEqualTo(200);
        assertThat(capture.last.get()).isEqualTo(new CapturedRequest("203.0.113.18", true));
        assertThat(first.headers().firstValue("Strict-Transport-Security")).isPresent();
        request("GET", BrowserSessionCookies.AUTH_PATH + "/csrf", Map.of(
                "CF-Connecting-IP", "203.0.113.18", "X-Forwarded-For", "198.51.100.92", "X-Forwarded-Proto", "https"));
        assertThat(capture.last.get()).isEqualTo(new CapturedRequest("203.0.113.18", true));
        request("GET", BrowserSessionCookies.AUTH_PATH + "/csrf", Map.of("X-Forwarded-For", "198.51.100.93"));
        assertThat(capture.last.get()).isEqualTo(new CapturedRequest("127.0.0.1", false));
    }

    private HttpResponse<String> request(String method, String path, Map<String, String> headers) throws Exception {
        var request = HttpRequest.newBuilder(URI.create("http://127.0.0.1:" + port + path))
                .timeout(Duration.ofSeconds(10)).method(method, HttpRequest.BodyPublishers.noBody());
        headers.forEach(request::header);
        return client.send(request.build(), HttpResponse.BodyHandlers.ofString());
    }

    record CapturedRequest(String remoteAddress, boolean secure) { }
    static class RequestCapture { final AtomicReference<CapturedRequest> last = new AtomicReference<>(); }
    static class ControlledDatabaseHealth implements HealthIndicator {
        volatile boolean available = true;
        @Override public Health health() {
            return available ? Health.up().build() : Health.down()
                    .withDetail("diagnostic", "jdbc:postgresql://private-host;password=hidden-diagnostic").build();
        }
    }

    @TestConfiguration(proxyBeanMethods = false)
    static class CaptureConfiguration {
        @Bean RequestCapture requestCapture() { return new RequestCapture(); }
        @Bean("dbHealthIndicator") ControlledDatabaseHealth controlledDatabaseHealth() { return new ControlledDatabaseHealth(); }
        @Bean Filter requestCaptureFilter(RequestCapture capture) {
            return (request, response, chain) -> {
                if (request instanceof HttpServletRequest http
                        && http.getRequestURI().equals(BrowserSessionCookies.AUTH_PATH + "/csrf")) {
                    capture.last.set(new CapturedRequest(http.getRemoteAddr(), http.isSecure()));
                }
                chain.doFilter(request, response);
            };
        }
    }
}
