package com.splitnest.ratelimit;

import com.splitnest.common.error.ApiException;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Clock;
import java.time.Duration;
import java.util.HexFormat;
import java.util.List;
import java.util.Locale;
import java.util.UUID;
import org.springframework.dao.DataAccessException;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.script.DefaultRedisScript;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;

@Service
public class RateLimiter {
    private static final DefaultRedisScript<Long> INCREMENT = new DefaultRedisScript<>("""
            local count = redis.call('INCR', KEYS[1])
            if count == 1 then redis.call('EXPIRE', KEYS[1], ARGV[2]) end
            if count > tonumber(ARGV[1]) then return redis.call('TTL', KEYS[1]) end
            return -1
            """, Long.class);
    private final StringRedisTemplate redis;
    private final Clock clock;

    public RateLimiter(StringRedisTemplate redis, Clock clock) {
        this.redis = redis;
        this.clock = clock;
    }

    public void checkLogin(String email, String ip) {
        check("login", email.strip().toLowerCase(Locale.ROOT) + "|" + ip, 5, Duration.ofMinutes(1));
    }

    public void checkImport(UUID userId) {
        check("import", userId.toString(), 10, Duration.ofHours(1));
    }

    void check(String scope, String identity, int limit, Duration window) {
        long seconds = window.toSeconds();
        long now = clock.instant().getEpochSecond();
        long bucket = Math.floorDiv(now, seconds);
        long remaining = seconds - Math.floorMod(now, seconds);
        String key = "rate:" + scope + ":" + hash(identity) + ":" + bucket;
        try {
            Long retryAfter = redis.execute(INCREMENT, List.of(key), Integer.toString(limit), Long.toString(remaining));
            if (retryAfter == null) { throw new IllegalStateException("Redis returned no limiter result"); }
            if (retryAfter >= 0) { throw new RateLimitExceededException(Math.max(1, retryAfter)); }
        } catch (DataAccessException exception) {
            // Login/upload must not silently lose their limits on another replica or during an outage.
            throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE, "Rate limiting is temporarily unavailable");
        }
    }

    private String hash(String identity) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256")
                    .digest(identity.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException exception) {
            throw new IllegalStateException("SHA-256 is required by the Java runtime", exception);
        }
    }
}
