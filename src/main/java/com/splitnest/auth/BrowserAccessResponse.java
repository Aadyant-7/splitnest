package com.splitnest.auth;

/** The refresh secret belongs only in its HttpOnly cookie, never in browser JSON. */
public record BrowserAccessResponse(String accessToken, String tokenType, long expiresIn) {
    static BrowserAccessResponse from(TokenResponse tokens) {
        return new BrowserAccessResponse(tokens.accessToken(), tokens.tokenType(), tokens.expiresIn());
    }
}
