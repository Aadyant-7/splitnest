package com.splitnest.auth;

import jakarta.servlet.http.HttpServletResponse;
import java.time.Duration;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseCookie;
import org.springframework.stereotype.Component;

@Component
public class BrowserSessionCookies {
    public static final String AUTH_PATH = "/api/v1/browser-auth";
    public static final String REFRESH_NAME = "splitnest_refresh";
    public static final String CSRF_NAME = "splitnest_csrf";
    public static final String CSRF_HEADER = "X-CSRF-TOKEN";
    private final boolean secure;

    public BrowserSessionCookies(@Value("${splitnest.browser.cookie-secure:true}") boolean secure) {
        this.secure = secure;
    }

    public boolean secure() { return secure; }

    public void refresh(HttpServletResponse response, String token) {
        response.addHeader(HttpHeaders.SET_COOKIE, cookie(token, Duration.ofDays(7)).toString());
    }

    public void clear(HttpServletResponse response) {
        response.addHeader(HttpHeaders.SET_COOKIE, cookie("", Duration.ZERO).toString());
    }

    private ResponseCookie cookie(String token, Duration age) {
        // Omit Domain: this host-only secret must not be shared with sibling hosts.
        return ResponseCookie.from(REFRESH_NAME, token).httpOnly(true).secure(secure)
                .sameSite("Strict").path(AUTH_PATH).maxAge(age).build();
    }
}
