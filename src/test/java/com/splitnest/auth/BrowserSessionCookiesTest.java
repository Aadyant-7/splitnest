package com.splitnest.auth;

import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletResponse;

import static org.assertj.core.api.Assertions.assertThat;

class BrowserSessionCookiesTest {
    @Test
    void explicitLocalHttpOverrideKeepsAllOtherCookieRestrictions() {
        var cookies = new BrowserSessionCookies(false);
        var response = new MockHttpServletResponse();
        cookies.refresh(response, "synthetic-refresh-value");
        String header = response.getHeader("Set-Cookie");
        assertThat(header).contains("HttpOnly", "SameSite=Strict", "Path=/api/v1/browser-auth", "Max-Age=604800")
                .doesNotContain("Secure", "Domain=");
        var cleared = new MockHttpServletResponse();
        cookies.clear(cleared);
        assertThat(cleared.getHeader("Set-Cookie")).contains("Max-Age=0", "HttpOnly", "SameSite=Strict")
                .doesNotContain("Secure", "Domain=");
    }
}
