package com.splitnest.auth;

import com.splitnest.common.error.ApiException;
import com.splitnest.user.UserRepository;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.time.Clock;
import java.time.Duration;
import java.util.Base64;
import java.util.HexFormat;
import java.util.Optional;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class RefreshTokenService {
    private static final Duration REFRESH_LIFETIME = Duration.ofDays(7);
    private final SecureRandom random = new SecureRandom();
    private final RefreshTokenRepository tokens;
    private final UserRepository users;
    private final JwtService jwt;
    private final Clock clock;

    public RefreshTokenService(RefreshTokenRepository tokens, UserRepository users, JwtService jwt, Clock clock) {
        this.tokens = tokens;
        this.users = users;
        this.jwt = jwt;
        this.clock = clock;
    }

    @Transactional
    public TokenResponse issue(UUID userId) {
        users.findLockedById(userId).orElseThrow(() -> ApiException.unauthorized("User no longer exists"));
        return create(userId, UUID.randomUUID());
    }

    @Transactional
    public Optional<TokenResponse> rotate(String rawToken) {
        String hash = hash(rawToken);
        Optional<UUID> userId = tokens.findUserIdByTokenHash(hash);
        if (userId.isEmpty()) {
            return Optional.empty();
        }
        // All changes to a user's families acquire the same lock before reading token state.
        // This also serializes replay against rotation of the token's successor.
        users.findLockedById(userId.get()).orElseThrow(() -> ApiException.unauthorized("Invalid refresh token"));
        RefreshToken token = tokens.findByTokenHash(hash).orElseThrow();
        if (token.isRevoked() || !token.getExpiresAt().isAfter(clock.instant())) {
            tokens.revokeFamily(token.getFamilyId());
            // Return a rejection value so the family revocation commits before HTTP 401 is raised.
            return Optional.empty();
        }
        token.revoke();
        return Optional.of(create(token.getUserId(), token.getFamilyId()));
    }

    @Transactional
    public void logout(String rawToken, UUID ownerId) {
        String hash = hash(rawToken);
        UUID tokenOwner = tokens.findUserIdByTokenHash(hash)
                .orElseThrow(() -> ApiException.unauthorized("Invalid refresh token"));
        if (!tokenOwner.equals(ownerId)) {
            throw ApiException.forbidden("Refresh token belongs to another user");
        }
        users.findLockedById(ownerId).orElseThrow(() -> ApiException.unauthorized("User no longer exists"));
        RefreshToken token = tokens.findByTokenHash(hash).orElseThrow();
        // Revoking the family makes logout effective even when a client supplied an old token.
        tokens.revokeFamily(token.getFamilyId());
    }

    private TokenResponse create(UUID userId, UUID familyId) {
        byte[] bytes = new byte[32];
        random.nextBytes(bytes);
        String rawToken = Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
        String accessToken = jwt.createAccessToken(userId);
        var now = clock.instant();
        tokens.save(new RefreshToken(userId, familyId, hash(rawToken), now, now.plus(REFRESH_LIFETIME)));
        return new TokenResponse(accessToken, rawToken, "Bearer", JwtService.ACCESS_LIFETIME.toSeconds());
    }

    static String hash(String token) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256")
                    .digest(token.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException exception) {
            throw new IllegalStateException("Java runtime is missing SHA-256", exception);
        }
    }
}
