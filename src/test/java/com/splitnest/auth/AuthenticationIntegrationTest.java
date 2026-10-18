package com.splitnest.auth;

import com.splitnest.IntegrationTestSupport;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.oauth2.jose.jws.MacAlgorithm;
import org.springframework.security.oauth2.jwt.JwtClaimsSet;
import org.springframework.security.oauth2.jwt.JwtEncoder;
import org.springframework.security.oauth2.jwt.JwtEncoderParameters;
import org.springframework.security.oauth2.jwt.JwsHeader;
import tools.jackson.databind.JsonNode;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class AuthenticationIntegrationTest extends IntegrationTestSupport {
    @Autowired PasswordEncoder passwords;
    @Autowired JwtEncoder encoder;

    @Test
    void registrationNormalizesEmailHashesPasswordAndRejectsDuplicates() throws Exception {
        String email = email();
        var created = post("/api/v1/auth/register", Map.of("email", "  " + email.toUpperCase() + "  ",
                "password", "Strong-Pass-123!", "displayName", "  Ada Lovelace  "), null, 201);
        assertThat(created.get("email").asText()).isEqualTo(email);
        assertThat(created.get("displayName").asText()).isEqualTo("Ada Lovelace");
        assertThat(created.has("passwordHash")).isFalse();
        String hash = jdbc.sql("select password_hash from users where email = :email")
                .param("email", email).query(String.class).single();
        assertThat(hash).isNotEqualTo("Strong-Pass-123!");
        assertThat(passwords.matches("Strong-Pass-123!", hash)).isTrue();
        post("/api/v1/auth/register", registration(email.toUpperCase(), "AnotherPass123"), null, 409);
    }

    @Test
    void registrationReturnsFieldErrorsAndEnforcesBcryptByteLimit() throws Exception {
        var invalid = post("/api/v1/auth/register", registration("not-an-email", "short"), null, 400);
        assertThat(invalid.get("status").asInt()).isEqualTo(400);
        assertThat(invalid.has("errors")).isTrue();
        post("/api/v1/auth/register", registration(email(), "界".repeat(25)), null, 400);
        post("/api/v1/auth/register", registration(email(), "界".repeat(24)), null, 201);
        post("/api/v1/auth/register", Map.of("email", email(), "password", "Strong-Pass-123!",
                "displayName", "   "), null, 400);
    }

    @Test
    void loginIssuesRealJwtAndCurrentUserExposesOnlySafeFields() throws Exception {
        String email = email();
        var registered = register(email);
        var tokens = login(email.toUpperCase());
        assertThat(tokens.get("tokenType").asText()).isEqualTo("Bearer");
        assertThat(tokens.get("expiresIn").asLong()).isEqualTo(900);
        mvc.perform(get("/api/v1/users/me").header("Authorization", "Bearer " + tokens.get("accessToken").asText()))
                .andExpect(status().isOk()).andExpect(jsonPath("$.id").value(registered.get("id").asText()))
                .andExpect(jsonPath("$.email").value(email)).andExpect(jsonPath("$.passwordHash").doesNotExist());
        post("/api/v1/auth/login", Map.of("email", email, "password", "Wrong-Pass-123!"), null, 401);
        post("/api/v1/auth/login", Map.of("email", email(), "password", "Wrong-Pass-123!"), null, 401);
    }

    @Test
    void securityFilterUsesProblemDetailForMissingMalformedAndTamperedBearerTokens() throws Exception {
        mvc.perform(get("/api/v1/users/me")).andExpect(status().isUnauthorized())
                .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
                .andExpect(jsonPath("$.status").value(401)).andExpect(jsonPath("$.detail").exists())
                .andExpect(jsonPath("$.trace").doesNotExist());
        mvc.perform(get("/api/v1/users/me").header("Authorization", "Bearer invalid.token.value"))
                .andExpect(status().isUnauthorized());
        String email = email();
        register(email);
        String token = login(email).get("accessToken").asText();
        String[] pieces = token.split("\\.");
        String tampered = pieces[0] + "." + pieces[1] + "." + (pieces[2].startsWith("a") ? "b" : "a") + pieces[2].substring(1);
        mvc.perform(get("/api/v1/users/me").header("Authorization", "Bearer " + tampered))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void decoderRejectsExpiredWrongIssuerWrongAudienceAndInvalidSubjectTokens() throws Exception {
        String userId = register(email()).get("id").asText();
        Instant now = Instant.now();
        for (String token : List.of(
                signedToken(userId, "splitnest", List.of("splitnest-api"), now.minusSeconds(120), now.minusSeconds(60)),
                signedToken(userId, "another-app", List.of("splitnest-api"), now, now.plusSeconds(900)),
                signedToken(userId, "splitnest", List.of("another-api"), now, now.plusSeconds(900)),
                signedToken("not-a-uuid", "splitnest", List.of("splitnest-api"), now, now.plusSeconds(900)))) {
            mvc.perform(get("/api/v1/users/me").header("Authorization", "Bearer " + token))
                    .andExpect(status().isUnauthorized());
        }
    }

    @Test
    void refreshIsSingleUseAndReplayingAnAncestorCommitsFamilyRevocation() throws Exception {
        String email = email();
        register(email);
        var initial = login(email);
        String first = initial.get("refreshToken").asText();
        var successor = post("/api/v1/auth/refresh", refresh(first), null, 200);
        String second = successor.get("refreshToken").asText();
        assertThat(second).isNotEqualTo(first);
        assertThat(jdbc.sql("select count(*) from refresh_tokens where token_hash = :hash")
                .param("hash", first).query(Integer.class).single()).isZero();
        assertThat(jdbc.sql("select count(*) from refresh_tokens where token_hash = :hash")
                .param("hash", RefreshTokenService.hash(first)).query(Integer.class).single()).isEqualTo(1);
        post("/api/v1/auth/refresh", refresh(first), null, 401);
        post("/api/v1/auth/refresh", refresh(second), null, 401);
        assertThat(jdbc.sql("select count(*) from refresh_tokens where family_id = "
                        + "(select family_id from refresh_tokens where token_hash = :hash) and revoked = false")
                .param("hash", RefreshTokenService.hash(first)).query(Integer.class).single()).isZero();
    }

    @Test
    void expiredAndUnknownRefreshTokensAreRejected() throws Exception {
        String email = email();
        register(email);
        String refresh = login(email).get("refreshToken").asText();
        jdbc.sql("update refresh_tokens set expires_at = current_timestamp - interval '1 second' where token_hash = :hash")
                .param("hash", RefreshTokenService.hash(refresh)).update();
        post("/api/v1/auth/refresh", refresh(refresh), null, 401);
        post("/api/v1/auth/refresh", refresh("unrecognized-token"), null, 401);
    }

    @Test
    void concurrentRotationAllowsOneUseThenRevokesTheFamilyOnReplay() throws Exception {
        String email = email();
        register(email);
        String original = login(email).get("refreshToken").asText();
        var ready = new CountDownLatch(2);
        var start = new CountDownLatch(1);
        var results = new ArrayList<org.springframework.mock.web.MockHttpServletResponse>();
        try (var executor = Executors.newFixedThreadPool(2)) {
            var jobs = new ArrayList<java.util.concurrent.Future<org.springframework.mock.web.MockHttpServletResponse>>();
            for (int index = 0; index < 2; index++) {
                jobs.add(executor.submit(() -> {
                    ready.countDown();
                    assertThat(start.await(10, TimeUnit.SECONDS)).isTrue();
                    return mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post("/api/v1/auth/refresh").contentType(MediaType.APPLICATION_JSON)
                            .content(json.writeValueAsString(refresh(original)))).andReturn().getResponse();
                }));
            }
            assertThat(ready.await(10, TimeUnit.SECONDS)).isTrue();
            start.countDown();
            for (var job : jobs) { results.add(job.get(30, TimeUnit.SECONDS)); }
        }
        assertThat(results.stream().map(response -> response.getStatus()).toList())
                .containsExactlyInAnyOrder(200, 401);
        var success = results.stream().filter(response -> response.getStatus() == 200).findFirst().orElseThrow();
        String successor = json.readTree(success.getContentAsString()).get("refreshToken").asText();
        post("/api/v1/auth/refresh", refresh(successor), null, 401);
    }

    @Test
    void logoutRequiresAuthenticationAndOwnershipAndPreservesOtherSessions() throws Exception {
        String email = email();
        register(email);
        var first = login(email);
        var secondSession = login(email);
        String stranger = registerAndLogin(email());
        String refresh = first.get("refreshToken").asText();
        post("/api/v1/auth/logout", refresh(refresh), null, 401);
        post("/api/v1/auth/logout", refresh(refresh), stranger, 403);
        var successor = post("/api/v1/auth/refresh", refresh(refresh), null, 200);
        post("/api/v1/auth/logout", refresh(refresh), first.get("accessToken").asText(), 204);
        post("/api/v1/auth/refresh", refresh(successor.get("refreshToken").asText()), null, 401);
        post("/api/v1/auth/refresh", refresh(secondSession.get("refreshToken").asText()), null, 200);
        // Stateless access tokens remain valid until their fifteen-minute expiry.
        mvc.perform(get("/api/v1/users/me").header("Authorization", "Bearer " + first.get("accessToken").asText()))
                .andExpect(status().isOk());
    }

    @Test
    void openApiPublishesBearerSchemeAndPublicAuthOperations() throws Exception {
        mvc.perform(get("/v3/api-docs")).andExpect(status().isOk())
                .andExpect(jsonPath("$.components.securitySchemes.bearerAuth.scheme").value("bearer"));
        mvc.perform(get("/swagger-ui/index.html")).andExpect(status().isOk());
    }

    private JsonNode login(String email) throws Exception {
        return post("/api/v1/auth/login", Map.of("email", email, "password", "Strong-Pass-123!"), null, 200);
    }

    private static String email() { return UUID.randomUUID() + "@example.com"; }
    private static Map<String, String> registration(String email, String password) {
        return Map.of("email", email, "password", password, "displayName", "Test User");
    }
    private static Map<String, String> refresh(String refreshToken) { return Map.of("refreshToken", refreshToken); }

    private String signedToken(String subject, String issuer, List<String> audience, Instant issuedAt, Instant expiry) {
        var claims = JwtClaimsSet.builder().subject(subject).issuer(issuer).audience(audience)
                .issuedAt(issuedAt).expiresAt(expiry).build();
        return encoder.encode(JwtEncoderParameters.from(JwsHeader.with(MacAlgorithm.HS256).type("JWT").build(), claims))
                .getTokenValue();
    }
}
