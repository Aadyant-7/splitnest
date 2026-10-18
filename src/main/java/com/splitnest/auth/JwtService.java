package com.splitnest.auth;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.oauth2.jose.jws.MacAlgorithm;
import org.springframework.security.oauth2.jwt.JwtClaimsSet;
import org.springframework.security.oauth2.jwt.JwtEncoder;
import org.springframework.security.oauth2.jwt.JwtEncoderParameters;
import org.springframework.security.oauth2.jwt.JwsHeader;
import org.springframework.stereotype.Service;

@Service
public class JwtService {
    public static final Duration ACCESS_LIFETIME = Duration.ofMinutes(15);
    private final JwtEncoder encoder;
    private final Clock clock;
    private final String issuer;
    private final String audience;

    public JwtService(JwtEncoder encoder, Clock clock,
                      @Value("${splitnest.jwt.issuer:splitnest}") String issuer,
                      @Value("${splitnest.jwt.audience:splitnest-api}") String audience) {
        this.encoder = encoder;
        this.clock = clock;
        this.issuer = issuer;
        this.audience = audience;
    }

    public String createAccessToken(UUID userId) {
        Instant now = clock.instant();
        JwtClaimsSet claims = JwtClaimsSet.builder().issuer(issuer).subject(userId.toString())
                .audience(List.of(audience)).issuedAt(now).expiresAt(now.plus(ACCESS_LIFETIME))
                .id(UUID.randomUUID().toString()).build();
        return encoder.encode(JwtEncoderParameters.from(
                JwsHeader.with(MacAlgorithm.HS256).type("JWT").build(), claims)).getTokenValue();
    }
}
