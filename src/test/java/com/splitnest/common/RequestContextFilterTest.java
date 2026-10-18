package com.splitnest.common;

import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;
import com.splitnest.common.config.RequestContextFilter;
import jakarta.servlet.ServletException;
import java.nio.charset.StandardCharsets;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.slf4j.LoggerFactory;
import org.slf4j.MDC;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class RequestContextFilterTest {
    private final RequestContextFilter filter = new RequestContextFilter();

    @AfterEach
    void clearThreadContext() {
        SecurityContextHolder.clearContext();
        MDC.clear();
    }

    @Test
    void authenticatedGroupRequestMakesSafeContextAvailableThenClearsOnlyItsKeys() throws Exception {
        String userId = UUID.randomUUID().toString();
        String groupId = UUID.randomUUID().toString();
        var request = new MockHttpServletRequest("POST", "/api/v1/groups/" + groupId + "/expenses");
        request.setContent("private statement contents".getBytes(StandardCharsets.UTF_8));
        authenticate(userId);
        MDC.put("traceId", "existing-trace");
        var response = new MockHttpServletResponse();
        filter.doFilter(request, response, (currentRequest, currentResponse) -> {
            assertThat(MDC.getCopyOfContextMap()).containsAllEntriesOf(Map.of(
                    "requestPath", request.getRequestURI(), "userId", userId, "groupId", groupId,
                    "traceId", "existing-trace"));
            assertThat(new String(currentRequest.getInputStream().readAllBytes(), StandardCharsets.UTF_8))
                    .isEqualTo("private statement contents");
            response.setStatus(201);
        });
        assertThat(MDC.get("requestPath")).isNull();
        assertThat(MDC.get("userId")).isNull();
        assertThat(MDC.get("groupId")).isNull();
        assertThat(MDC.get("traceId")).isEqualTo("existing-trace");
    }

    @Test
    void exceptionPathStillRemovesRequestUserAndGroupContext() {
        String userId = UUID.randomUUID().toString();
        String groupId = UUID.randomUUID().toString();
        authenticate(userId);
        var request = new MockHttpServletRequest("GET", "/api/v1/groups/" + groupId + "/balances");
        assertThatThrownBy(() -> filter.doFilter(request, new MockHttpServletResponse(), (req, res) -> {
            assertThat(MDC.get("userId")).isEqualTo(userId);
            assertThat(MDC.get("groupId")).isEqualTo(groupId);
            throw new ServletException("test chain failure");
        })).isInstanceOf(ServletException.class);
        assertThat(MDC.get("requestPath")).isNull();
        assertThat(MDC.get("userId")).isNull();
        assertThat(MDC.get("groupId")).isNull();
    }

    @Test
    void anonymousAndInvalidGroupPathsDoNotInventUserOrGroupContext() throws Exception {
        for (String path : new String[] {"/api/v1/auth/login", "/api/v1/groups/not-a-uuid/balances",
                "/api/v1/groups/------------------------------------/balances"}) {
            filter.doFilter(new MockHttpServletRequest("GET", path), new MockHttpServletResponse(), (req, res) -> {
                assertThat(MDC.get("requestPath")).isEqualTo(path);
                assertThat(MDC.get("userId")).isNull();
                assertThat(MDC.get("groupId")).isNull();
            });
            assertThat(MDC.get("requestPath")).isNull();
        }
    }

    @Test
    void completionLogContainsStatusAndContextWithoutTokenOrRequestBody() throws Exception {
        String userId = UUID.randomUUID().toString();
        authenticate(userId);
        var logger = (Logger) LoggerFactory.getLogger(RequestContextFilter.class);
        var appender = new ListAppender<ILoggingEvent>() {
            @Override
            protected void append(ILoggingEvent event) {
                event.prepareForDeferredProcessing();
                super.append(event);
            }
        };
        appender.start();
        logger.addAppender(appender);
        try {
            var request = new MockHttpServletRequest("POST", "/api/v1/auth/logout");
            request.addHeader("Authorization", "Bearer bearer-secret-for-test");
            request.setContent("{\"refreshToken\":\"refresh-secret-for-test\",\"password\":\"password-secret-for-test\"}"
                    .getBytes(StandardCharsets.UTF_8));
            var response = new MockHttpServletResponse();
            filter.doFilter(request, response, (req, res) -> response.setStatus(204));
            assertThat(appender.list).hasSize(1);
            var event = appender.list.getFirst();
            assertThat(event.getFormattedMessage()).contains("status=204").doesNotContain(
                    "bearer-secret-for-test", "refresh-secret-for-test", "password-secret-for-test", "jwt-secret-for-test");
            assertThat(event.getMDCPropertyMap()).containsAllEntriesOf(Map.of("userId", userId,
                    "requestPath", "/api/v1/auth/logout"));
            assertThat(event.getMDCPropertyMap().values()).doesNotContain("bearer-secret-for-test",
                    "refresh-secret-for-test", "password-secret-for-test", "jwt-secret-for-test");
        } finally {
            logger.detachAppender(appender);
            appender.stop();
        }
    }

    private void authenticate(String userId) {
        Jwt jwt = Jwt.withTokenValue("jwt-secret-for-test").header("alg", "HS256").subject(userId).build();
        SecurityContextHolder.getContext().setAuthentication(new JwtAuthenticationToken(jwt));
    }
}
