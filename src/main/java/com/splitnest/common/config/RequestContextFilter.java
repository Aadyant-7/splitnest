package com.splitnest.common.config;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.util.UUID;
import java.util.regex.Pattern;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.slf4j.MDC;
import org.springframework.core.annotation.Order;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

@Component("requestLogContextFilter")
@Order(0)
public class RequestContextFilter extends OncePerRequestFilter {
    private static final Logger log = LoggerFactory.getLogger(RequestContextFilter.class);
    private static final Pattern GROUP_PATH = Pattern.compile("^/api/v1/groups/([0-9a-fA-F-]{36})(?:/|$)");

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        MDC.put("requestPath", request.getRequestURI());
        var authentication = SecurityContextHolder.getContext().getAuthentication();
        if (authentication instanceof JwtAuthenticationToken jwt) { MDC.put("userId", jwt.getToken().getSubject()); }
        var group = GROUP_PATH.matcher(request.getRequestURI());
        if (group.find()) {
            try { MDC.put("groupId", UUID.fromString(group.group(1)).toString()); }
            catch (IllegalArgumentException ignored) { /* An invalid path is not trusted group context. */ }
        }
        try {
            chain.doFilter(request, response);
        } finally {
            log.info("HTTP request completed status={}", response.getStatus());
            MDC.remove("requestPath");
            MDC.remove("userId");
            MDC.remove("groupId");
        }
    }
}
