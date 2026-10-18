package com.splitnest.common.security;

import com.splitnest.common.error.ApiException;
import java.util.UUID;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.stereotype.Component;

@Component
public class CurrentUser {
    public UUID id() {
        if (SecurityContextHolder.getContext().getAuthentication() instanceof JwtAuthenticationToken authentication) {
            try {
                return UUID.fromString(authentication.getToken().getSubject());
            } catch (IllegalArgumentException exception) {
                throw ApiException.unauthorized("Invalid token subject");
            }
        }
        throw ApiException.unauthorized("Authentication is required");
    }
}
