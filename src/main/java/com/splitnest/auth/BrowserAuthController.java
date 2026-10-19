package com.splitnest.auth;

import com.splitnest.common.error.ApiException;
import com.splitnest.ratelimit.RateLimiter;
import io.swagger.v3.oas.annotations.security.SecurityRequirements;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.security.web.csrf.CsrfToken;
import org.springframework.web.bind.annotation.CookieValue;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping(BrowserSessionCookies.AUTH_PATH)
public class BrowserAuthController {
    private final AuthService auth;
    private final RateLimiter limiter;
    private final BrowserSessionCookies cookies;

    public BrowserAuthController(AuthService auth, RateLimiter limiter, BrowserSessionCookies cookies) {
        this.auth = auth;
        this.limiter = limiter;
        this.cookies = cookies;
    }

    @GetMapping("/csrf")
    @SecurityRequirements
    public BrowserCsrfResponse csrf(CsrfToken token) {
        // Resolving the deferred token writes its cookie without creating an HTTP session.
        return new BrowserCsrfResponse(token.getToken(), token.getHeaderName());
    }

    @PostMapping("/login")
    @SecurityRequirements
    public BrowserAccessResponse login(@Valid @RequestBody LoginRequest body,
                                        HttpServletRequest request, HttpServletResponse response) {
        limiter.checkLogin(body.email(), request.getRemoteAddr());
        TokenResponse tokens = auth.login(body);
        cookies.refresh(response, tokens.refreshToken());
        return BrowserAccessResponse.from(tokens);
    }

    @PostMapping("/refresh")
    @SecurityRequirements
    public BrowserAccessResponse refresh(
            @CookieValue(name = BrowserSessionCookies.REFRESH_NAME, required = false) String refresh,
            HttpServletResponse response) {
        try {
            TokenResponse tokens = auth.refresh(new RefreshRequest(requireRefresh(refresh)));
            cookies.refresh(response, tokens.refreshToken());
            return BrowserAccessResponse.from(tokens);
        } catch (ApiException exception) {
            // A failed transaction leaves the cookie usable; discard it only after confirmed rejection.
            if (exception.getStatus() == HttpStatus.UNAUTHORIZED) { cookies.clear(response); }
            throw exception;
        }
    }

    @PostMapping("/logout")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void logout(@CookieValue(name = BrowserSessionCookies.REFRESH_NAME, required = false) String refresh,
                       HttpServletResponse response) {
        try {
            auth.logout(new RefreshRequest(requireRefresh(refresh)));
        } catch (ApiException exception) {
            if (exception.getStatus() == HttpStatus.UNAUTHORIZED) { cookies.clear(response); }
            throw exception;
        }
        cookies.clear(response);
    }

    private String requireRefresh(String refresh) {
        if (refresh == null || refresh.isBlank() || refresh.length() > 256) {
            throw ApiException.unauthorized("A valid browser refresh cookie is required");
        }
        return refresh;
    }
}
