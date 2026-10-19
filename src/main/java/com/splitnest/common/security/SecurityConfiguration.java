package com.splitnest.common.security;

import com.nimbusds.jose.jwk.source.ImmutableSecret;
import com.splitnest.auth.BrowserSessionCookies;
import com.splitnest.common.config.SpaRoutes;
import java.net.URI;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.Base64;
import java.util.List;
import java.util.Objects;
import java.util.UUID;
import javax.crypto.SecretKey;
import javax.crypto.spec.SecretKeySpec;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ProblemDetail;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.oauth2.core.DelegatingOAuth2TokenValidator;
import org.springframework.security.oauth2.jose.jws.MacAlgorithm;
import org.springframework.security.oauth2.jwt.JwtClaimValidator;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.jwt.JwtEncoder;
import org.springframework.security.oauth2.jwt.JwtIssuerValidator;
import org.springframework.security.oauth2.jwt.JwtTimestampValidator;
import org.springframework.security.oauth2.jwt.NimbusJwtDecoder;
import org.springframework.security.oauth2.jwt.NimbusJwtEncoder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.access.AccessDeniedHandler;
import org.springframework.security.web.csrf.CookieCsrfTokenRepository;
import org.springframework.security.web.csrf.CsrfException;
import org.springframework.security.web.csrf.CsrfFilter;
import org.springframework.security.web.servlet.util.matcher.PathPatternRequestMatcher;
import org.springframework.security.oauth2.server.resource.web.authentication.BearerTokenAuthenticationFilter;
import tools.jackson.databind.json.JsonMapper;

@Configuration(proxyBeanMethods = false)
public class SecurityConfiguration {
    @Bean
    PasswordEncoder passwordEncoder() { return new BCryptPasswordEncoder(12); }

    @Bean
    SecretKey jwtSecret(@Value("${splitnest.jwt.secret}") String configuredSecret) {
        byte[] bytes;
        try {
            bytes = Base64.getDecoder().decode(configuredSecret);
        } catch (IllegalArgumentException exception) {
            throw new IllegalArgumentException("JWT_SECRET must be a Base64-encoded random key of at least 32 bytes");
        }
        if (bytes.length < 32) {
            throw new IllegalArgumentException("JWT_SECRET must decode to at least 32 random bytes");
        }
        return new SecretKeySpec(bytes, "HmacSHA256");
    }

    @Bean
    JwtEncoder jwtEncoder(SecretKey key) { return new NimbusJwtEncoder(new ImmutableSecret<>(key)); }

    @Bean
    JwtDecoder jwtDecoder(SecretKey key, Clock clock,
                          @Value("${splitnest.jwt.issuer:splitnest}") String issuer,
                          @Value("${splitnest.jwt.audience:splitnest-api}") String audience) {
        NimbusJwtDecoder decoder = NimbusJwtDecoder.withSecretKey(key).macAlgorithm(MacAlgorithm.HS256).build();
        JwtTimestampValidator timestamps = new JwtTimestampValidator(Duration.ZERO);
        timestamps.setClock(clock);
        decoder.setJwtValidator(new DelegatingOAuth2TokenValidator<>(timestamps, new JwtIssuerValidator(issuer),
                new JwtClaimValidator<List<String>>("aud", values -> values != null && values.contains(audience)),
                new JwtClaimValidator<Instant>("exp", Objects::nonNull),
                new JwtClaimValidator<String>("sub", SecurityConfiguration::isUuid)));
        return decoder;
    }

    @Bean
    SecurityFilterChain securityFilterChain(HttpSecurity http, JsonMapper json,
                                            BrowserSessionCookies browserCookies,
                                            @Value("${management.server.port:9090}") int managementPort) throws Exception {
        var unauthenticated = (org.springframework.security.web.AuthenticationEntryPoint) (request, response, exception) -> {
            ProblemDetail problem = ProblemDetail.forStatusAndDetail(HttpStatus.UNAUTHORIZED, "Authentication is required or the bearer token is invalid");
            problem.setInstance(URI.create(request.getRequestURI()));
            response.setStatus(401);
            response.setHeader("WWW-Authenticate", "Bearer");
            response.setContentType(MediaType.APPLICATION_PROBLEM_JSON_VALUE);
            json.writeValue(response.getOutputStream(), problem);
        };
        AccessDeniedHandler denied = (request, response, exception) -> {
            String detail = exception instanceof CsrfException
                    ? "A valid CSRF token is required for browser authentication" : "Access is denied";
            ProblemDetail problem = ProblemDetail.forStatusAndDetail(HttpStatus.FORBIDDEN, detail);
            problem.setInstance(URI.create(request.getRequestURI()));
            response.setStatus(403);
            response.setContentType(MediaType.APPLICATION_PROBLEM_JSON_VALUE);
            json.writeValue(response.getOutputStream(), problem);
        };
        var csrfCookies = new CookieCsrfTokenRepository();
        csrfCookies.setCookieName(BrowserSessionCookies.CSRF_NAME);
        csrfCookies.setHeaderName(BrowserSessionCookies.CSRF_HEADER);
        csrfCookies.setCookieCustomizer(cookie -> cookie.httpOnly(true).secure(browserCookies.secure())
                .sameSite("Strict").path(BrowserSessionCookies.AUTH_PATH));
        var browserCsrf = new CsrfFilter(csrfCookies);
        var browserAuthPaths = PathPatternRequestMatcher.withDefaults()
                .matcher(BrowserSessionCookies.AUTH_PATH + "/**");
        // Use MVC-compatible decoded path matching: raw URI prefixes miss encoded route segments.
        browserCsrf.setRequireCsrfProtectionMatcher(request ->
                browserAuthPaths.matches(request)
                        && CsrfFilter.DEFAULT_CSRF_MATCHER.matches(request));
        browserCsrf.setAccessDeniedHandler(denied);
        // Resource-server DSL exempts bearer requests from its CSRF config. A dedicated standard
        // filter keeps cookie-backed browser logout protected even when it also carries a JWT.
        return http.csrf(csrf -> csrf.disable())
                .addFilterBefore(browserCsrf, BearerTokenAuthenticationFilter.class)
                .sessionManagement(session -> session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .headers(headers -> headers.addHeaderWriter((request, response) -> {
                    if (SpaRoutes.page(request.getRequestURI()) || SpaRoutes.resource(request.getRequestURI())) {
                        response.setHeader("Content-Security-Policy", "default-src 'self'; script-src 'self'; "
                                + "style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'self'; "
                                + "object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'");
                    }
                }))
                .authorizeHttpRequests(auth -> auth
                        .requestMatchers(request -> (request.getMethod().equals("GET") || request.getMethod().equals("HEAD"))
                                && (SpaRoutes.page(request.getRequestURI()) || SpaRoutes.resource(request.getRequestURI()))).permitAll()
                        .requestMatchers("/api/v1/auth/register", "/api/v1/auth/login", "/api/v1/auth/refresh",
                                "/api/v1/browser-auth/csrf", "/api/v1/browser-auth/login", "/api/v1/browser-auth/refresh",
                                "/swagger-ui/**", "/swagger-ui.html", "/v3/api-docs/**", "/actuator/health", "/actuator/health/**").permitAll()
                        .requestMatchers(request -> request.getLocalPort() == managementPort
                                && request.getRequestURI().equals("/actuator/prometheus")).permitAll()
                        .anyRequest().authenticated())
                .exceptionHandling(errors -> errors.authenticationEntryPoint(unauthenticated)
                        .accessDeniedHandler(denied))
                .oauth2ResourceServer(resource -> resource.jwt(jwt -> { }).authenticationEntryPoint(unauthenticated))
                .build();
    }

    private static boolean isUuid(String value) {
        if (value == null) { return false; }
        try { UUID.fromString(value); return true; }
        catch (IllegalArgumentException exception) { return false; }
    }
}
