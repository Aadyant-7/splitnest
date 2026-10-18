package com.splitnest.common;

import com.splitnest.IntegrationTestSupport;
import java.time.Instant;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class CommonApiIntegrationTest extends IntegrationTestSupport {
    @Test
    void sixthLoginAttemptInOneWindowReturns429AndRetryAfter() throws Exception {
        // Retry a batch only if the real calendar-minute window changed during BCrypt checks.
        // This keeps the HTTP test deterministic without changing the shared application clock.
        for (int batch = 0; batch < 2; batch++) {
            String email = UUID.randomUUID() + "@example.com";
            long minute = Instant.now().getEpochSecond() / 60;
            for (int attempt = 0; attempt < 5; attempt++) {
                post("/api/v1/auth/login", Map.of("email", email, "password", "Wrong-Pass-123!"), null, 401);
            }
            var response = mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders
                            .post("/api/v1/auth/login").contentType(MediaType.APPLICATION_JSON)
                            .content(json.writeValueAsString(Map.of("email", email.toUpperCase(), "password", "Wrong-Pass-123!"))))
                    .andReturn().getResponse();
            if (Instant.now().getEpochSecond() / 60 != minute) { continue; }
            assertThat(response.getStatus()).isEqualTo(429);
            assertThat(response.getContentType()).startsWith(MediaType.APPLICATION_PROBLEM_JSON_VALUE);
            assertThat(Long.parseLong(response.getHeader("Retry-After"))).isBetween(1L, 60L);
            var problem = json.readTree(response.getContentAsString());
            assertThat(problem.get("status").asInt()).isEqualTo(429);
            assertThat(problem.has("trace")).isFalse();
            return;
        }
        throw new AssertionError("Login batch unexpectedly crossed two consecutive minute boundaries");
    }

    @Test
    void fieldValidationAndMalformedJsonReturnSafe400Problems() throws Exception {
        var problem = post("/api/v1/auth/register", Map.of("email", "invalid", "password", "tiny",
                "displayName", " "), null, 400);
        assertThat(problem.path("errors").path("email").asText()).isNotBlank();
        assertThat(problem.path("errors").path("password").asText()).isNotBlank();
        assertThat(problem.path("errors").path("displayName").asText()).isNotBlank();
        mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post("/api/v1/auth/register")
                        .contentType(MediaType.APPLICATION_JSON).content("{\"email\":"))
                .andExpect(status().isBadRequest())
                .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
                .andExpect(jsonPath("$.status").value(400))
                .andExpect(jsonPath("$.detail").value("Request contains an invalid value"))
                .andExpect(jsonPath("$.trace").doesNotExist());
    }

    @Test
    void authenticatedUnknownPathsAndUnsupportedMethodsRetainHttpSemantics() throws Exception {
        String token = registerAndLogin(UUID.randomUUID() + "@example.com");
        mvc.perform(get("/api/v1/resource-that-does-not-exist").header("Authorization", "Bearer " + token))
                .andExpect(status().isNotFound())
                .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
                .andExpect(jsonPath("$.status").value(404));
        mvc.perform(put("/api/v1/users/me").header("Authorization", "Bearer " + token))
                .andExpect(status().isMethodNotAllowed())
                .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
                .andExpect(jsonPath("$.status").value(405));
    }
}
