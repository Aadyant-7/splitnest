package com.splitnest.auth;

import com.splitnest.common.error.ApiException;
import com.splitnest.common.error.GlobalExceptionHandler;
import com.splitnest.ratelimit.RateLimiter;
import jakarta.servlet.http.Cookie;
import org.junit.jupiter.api.Test;
import org.springframework.dao.DataAccessResourceFailureException;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class BrowserAuthControllerTest {
    private final AuthService auth = mock(AuthService.class);
    private final MockMvc mvc = MockMvcBuilders.standaloneSetup(new BrowserAuthController(
                    auth, mock(RateLimiter.class), new BrowserSessionCookies(true)))
            .setControllerAdvice(new GlobalExceptionHandler()).build();
    private final Cookie refresh = new Cookie(BrowserSessionCookies.REFRESH_NAME, "synthetic-refresh");

    @Test
    void refreshStorageFailureReturns500WithoutDiscardingTheRetryableCookie() throws Exception {
        when(auth.refresh(any(RefreshRequest.class))).thenThrow(new DataAccessResourceFailureException("Synthetic storage failure"));

        var response = mvc.perform(post(BrowserSessionCookies.AUTH_PATH + "/refresh").cookie(refresh))
                .andExpect(status().isInternalServerError()).andReturn().getResponse();

        assertThat(response.getHeaders("Set-Cookie")).isEmpty();
        assertThat(response.getContentAsString()).contains("An unexpected error occurred").doesNotContain("Synthetic storage failure");
    }

    @Test
    void logoutStorageFailureReturns500WithoutPretendingTheSessionWasRevoked() throws Exception {
        doThrow(new DataAccessResourceFailureException("Synthetic storage failure")).when(auth).logout(any(RefreshRequest.class));

        var response = mvc.perform(post(BrowserSessionCookies.AUTH_PATH + "/logout").cookie(refresh))
                .andExpect(status().isInternalServerError()).andReturn().getResponse();

        assertThat(response.getHeaders("Set-Cookie")).isEmpty();
    }

    @Test
    void logoutOwnerMismatchPreservesTheOwnersCookie() throws Exception {
        doThrow(ApiException.forbidden("Refresh token belongs to another user")).when(auth).logout(any(RefreshRequest.class));

        var response = mvc.perform(post(BrowserSessionCookies.AUTH_PATH + "/logout").cookie(refresh))
                .andExpect(status().isForbidden()).andReturn().getResponse();

        assertThat(response.getHeaders("Set-Cookie")).isEmpty();
    }

    @Test
    void logoutConfirmedInvalidTokenClearsTheUnusableCookie() throws Exception {
        doThrow(ApiException.unauthorized("Invalid refresh token")).when(auth).logout(any(RefreshRequest.class));

        var response = mvc.perform(post(BrowserSessionCookies.AUTH_PATH + "/logout").cookie(refresh))
                .andExpect(status().isUnauthorized()).andReturn().getResponse();

        assertThat(response.getHeader("Set-Cookie")).contains("splitnest_refresh=", "Max-Age=0", "HttpOnly", "SameSite=Strict");
    }
}
