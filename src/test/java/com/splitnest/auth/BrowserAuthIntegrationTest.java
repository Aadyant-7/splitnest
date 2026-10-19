package com.splitnest.auth;

import com.splitnest.IntegrationTestSupport;
import jakarta.servlet.http.Cookie;
import java.time.Instant;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.test.web.servlet.MvcResult;
import tools.jackson.databind.JsonNode;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class BrowserAuthIntegrationTest extends IntegrationTestSupport {
    private static final String BASE = BrowserSessionCookies.AUTH_PATH;

    @Test
    void csrfBootstrapUsesHttpOnlyCookieMaskedJsonTokenAndNoHttpSession() throws Exception {
        var result = mvc.perform(get(BASE + "/csrf")).andExpect(status().isOk()).andReturn();
        var body = json.readTree(result.getResponse().getContentAsString());
        Cookie cookie = result.getResponse().getCookie(BrowserSessionCookies.CSRF_NAME);
        assertThat(cookie).isNotNull();
        assertThat(cookie.isHttpOnly()).isTrue();
        assertThat(cookie.getSecure()).isTrue();
        assertThat(cookie.getPath()).isEqualTo(BASE);
        assertThat(cookie.getDomain()).isNull();
        assertThat(cookie.getAttribute("SameSite")).isEqualTo("Strict");
        assertThat(body.get("headerName").asText()).isEqualTo(BrowserSessionCookies.CSRF_HEADER);
        assertThat(body.get("token").asText()).isNotBlank().isNotEqualTo(cookie.getValue());
        assertThat(result.getRequest().getSession(false)).isNull();
        assertThat(result.getResponse().getHeader("Cache-Control")).contains("no-store");
        assertThat(result.getResponse().getHeader("Access-Control-Allow-Origin")).isNull();
    }

    @Test
    void loginIssuesAccessJsonAndSevenDayRefreshCookieWithoutExposingRefreshSecret() throws Exception {
        String email = email();
        var user = register(email);
        var csrf = csrf();
        var result = browserPost("/login", credentials(email), csrf, null, null, 200);
        var response = result.getResponse();
        var tokens = body(result);
        Cookie refresh = refresh(response);
        assertThat(tokens.size()).isEqualTo(3);
        assertThat(tokens.has("refreshToken")).isFalse();
        assertThat(tokens.toString()).doesNotContain(refresh.getValue());
        assertThat(tokens.get("expiresIn").asLong()).isEqualTo(900);
        assertThat(tokens.get("tokenType").asText()).isEqualTo("Bearer");
        assertThat(refresh.isHttpOnly()).isTrue();
        assertThat(refresh.getSecure()).isTrue();
        assertThat(refresh.getDomain()).isNull();
        assertThat(refresh.getPath()).isEqualTo(BASE);
        assertThat(refresh.getAttribute("SameSite")).isEqualTo("Strict");
        assertThat(refresh.getMaxAge()).isEqualTo(604800);
        assertThat(result.getRequest().getSession(false)).isNull();
        var me = mvc.perform(get("/api/v1/users/me").header("Authorization", "Bearer " + access(tokens)))
                .andExpect(status().isOk()).andReturn();
        assertThat(json.readTree(me.getResponse().getContentAsString()).get("id").asText())
                .isEqualTo(user.get("id").asText());
    }

    @Test
    void loginRequiresMatchingCsrfHeaderAndCookieBeforeAuthentication() throws Exception {
        String email = email();
        register(email);
        var csrf = csrf();
        var missing = mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post(BASE + "/login").contentType(MediaType.APPLICATION_JSON)
                .content(json.writeValueAsString(credentials(email)))).andExpect(status().isForbidden()).andReturn();
        assertThat(body(missing).get("detail").asText()).contains("CSRF");
        assertThat(missing.getResponse().getContentType()).startsWith(MediaType.APPLICATION_PROBLEM_JSON_VALUE);
        mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post(BASE + "/login").contentType(MediaType.APPLICATION_JSON)
                        .content(json.writeValueAsString(credentials(email)))
                        .header(BrowserSessionCookies.CSRF_HEADER, csrf.token()))
                .andExpect(status().isForbidden());
        mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post(BASE + "/login").contentType(MediaType.APPLICATION_JSON)
                        .content(json.writeValueAsString(credentials(email))).cookie(csrf.cookie())
                        .header(BrowserSessionCookies.CSRF_HEADER, "invalid"))
                .andExpect(status().isForbidden());
        assertThat(jdbc.sql("select count(*) from refresh_tokens r join users u on u.id=r.user_id where u.email=:email")
                .param("email", email).query(Integer.class).single()).isZero();
    }

    @Test
    void browserRefreshRotatesCookieAndReplayCommitsFamilyRevocation() throws Exception {
        String email = email();
        register(email);
        var csrf = csrf();
        var login = browserPost("/login", credentials(email), csrf, null, null, 200);
        Cookie original = refresh(login.getResponse());
        var rotated = browserPost("/refresh", null, csrf, original, null, 200);
        Cookie successor = refresh(rotated.getResponse());
        assertThat(successor.getValue()).isNotEqualTo(original.getValue());
        assertThat(body(rotated).has("refreshToken")).isFalse();
        var replay = browserPost("/refresh", null, csrf, original, null, 401);
        assertCleared(refresh(replay.getResponse()));
        var revoked = browserPost("/refresh", null, csrf, successor, null, 401);
        assertCleared(refresh(revoked.getResponse()));
        assertThat(jdbc.sql("select count(*) from refresh_tokens where token_hash=:hash and revoked")
                .param("hash", RefreshTokenService.hash(successor.getValue())).query(Integer.class).single()).isEqualTo(1);
    }

    @Test
    void missingUnknownAndExpiredRefreshCookiesReturn401AndClearTheCookie() throws Exception {
        var csrf = csrf();
        assertCleared(refresh(browserPost("/refresh", null, csrf, null, null, 401).getResponse()));
        assertCleared(refresh(browserPost("/refresh", null, csrf,
                new Cookie(BrowserSessionCookies.REFRESH_NAME, "unknown"), null, 401).getResponse()));
        String email = email();
        register(email);
        Cookie expired = refresh(browserPost("/login", credentials(email), csrf, null, null, 200).getResponse());
        jdbc.sql("update refresh_tokens set expires_at=current_timestamp-interval '1 second' where token_hash=:hash")
                .param("hash", RefreshTokenService.hash(expired.getValue())).update();
        assertCleared(refresh(browserPost("/refresh", null, csrf, expired, null, 401).getResponse()));
    }

    @Test
    void browserLogoutRequiresCsrfEvenWithValidBearerAndThenRevokesItsFamily() throws Exception {
        String email = email();
        register(email);
        var csrf = csrf();
        var login = browserPost("/login", credentials(email), csrf, null, null, 200);
        String access = access(body(login));
        Cookie refresh = refresh(login.getResponse());
        // A resource-server bearer exemption must not accidentally bypass browser CSRF.
        mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post(BASE + "/logout").cookie(refresh).header("Authorization", "Bearer " + access))
                .andExpect(status().isForbidden());
        browserPost("/logout", null, csrf, refresh, null, 401);
        var loggedOut = browserPost("/logout", null, csrf, refresh, access, 204);
        assertCleared(refresh(loggedOut.getResponse()));
        browserPost("/refresh", null, csrf, refresh, null, 401);
        mvc.perform(get("/api/v1/users/me").header("Authorization", "Bearer " + access)).andExpect(status().isOk());
    }

    @Test
    void browserLogoutCannotRevokeAnotherUsersCookie() throws Exception {
        String owner = email();
        register(owner);
        var csrf = csrf();
        var login = browserPost("/login", credentials(owner), csrf, null, null, 200);
        Cookie cookie = refresh(login.getResponse());
        String stranger = registerAndLogin(email());
        var denied = browserPost("/logout", null, csrf, cookie, stranger, 403);
        assertThat(denied.getResponse().getCookie(BrowserSessionCookies.REFRESH_NAME)).isNull();
        browserPost("/refresh", null, csrf, cookie, null, 200);
    }

    @Test
    void browserLoginSharesTheLegacyEmailAndIpRateLimit() throws Exception {
        for (int batch = 0; batch < 2; batch++) {
            String email = email();
            var csrf = csrf();
            long minute = Instant.now().getEpochSecond() / 60;
            for (int attempt = 0; attempt < 4; attempt++) {
                post("/api/v1/auth/login", credentials(email), null, 401);
            }
            browserPost("/login", credentials(email), csrf, null, null, 401);
            var response = mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post(BASE + "/login").cookie(csrf.cookie())
                            .header(BrowserSessionCookies.CSRF_HEADER, csrf.token())
                            .contentType(MediaType.APPLICATION_JSON).content(json.writeValueAsString(credentials(email))))
                    .andReturn().getResponse();
            if (Instant.now().getEpochSecond() / 60 != minute) { continue; }
            assertThat(response.getStatus()).isEqualTo(429);
            assertThat(Long.parseLong(response.getHeader("Retry-After"))).isBetween(1L, 60L);
            return;
        }
        throw new AssertionError("Login batch crossed two consecutive minute boundaries");
    }

    @Test
    void browserAccessCannotReadAnOutsidersGroupAndLegacyAuthRemainsCsrfExempt() throws Exception {
        String owner = registerAndLogin(email());
        String groupId = post("/api/v1/groups", Map.of("name", "Browser isolation"), owner, 201).get("id").asText();
        String outsider = email();
        register(outsider);
        var csrf = csrf();
        String token = access(body(browserPost("/login", credentials(outsider), csrf, null, null, 200)));
        mvc.perform(get("/api/v1/groups/" + groupId + "/balances").header("Authorization", "Bearer " + token))
                .andExpect(status().isNotFound());
        var legacy = post("/api/v1/auth/login", credentials(outsider), null, 200);
        assertThat(legacy.has("refreshToken")).isTrue();
        post("/api/v1/auth/refresh", Map.of("refreshToken", legacy.get("refreshToken").asText()), null, 200);
    }

    private Csrf csrf() throws Exception {
        var result = mvc.perform(get(BASE + "/csrf")).andExpect(status().isOk()).andReturn();
        return new Csrf(body(result).get("token").asText(), result.getResponse().getCookie(BrowserSessionCookies.CSRF_NAME));
    }

    private MvcResult browserPost(String path, Object payload, Csrf csrf, Cookie refresh, String token, int expected) throws Exception {
        var request = org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post(BASE + path)
                .cookie(csrf.cookie()).header(BrowserSessionCookies.CSRF_HEADER, csrf.token());
        if (refresh != null) { request.cookie(refresh); }
        if (payload != null) { request.contentType(MediaType.APPLICATION_JSON).content(json.writeValueAsString(payload)); }
        if (token != null) { request.header("Authorization", "Bearer " + token); }
        return mvc.perform(request).andExpect(status().is(expected)).andReturn();
    }

    private JsonNode body(MvcResult result) throws Exception { return json.readTree(result.getResponse().getContentAsString()); }
    private static Cookie refresh(MockHttpServletResponse response) {
        Cookie cookie = response.getCookie(BrowserSessionCookies.REFRESH_NAME);
        assertThat(cookie).isNotNull();
        return cookie;
    }
    private static void assertCleared(Cookie cookie) {
        assertThat(cookie.getMaxAge()).isZero();
        assertThat(cookie.getValue()).isEmpty();
        assertThat(cookie.getPath()).isEqualTo(BASE);
        assertThat(cookie.isHttpOnly()).isTrue();
    }
    private static String access(JsonNode tokens) { return tokens.get("accessToken").asText(); }
    private static Map<String, String> credentials(String email) { return Map.of("email", email, "password", "Strong-Pass-123!"); }
    private static String email() { return "browser-" + UUID.randomUUID() + "@example.com"; }
    private record Csrf(String token, Cookie cookie) { }
}
