package com.splitnest.ratelimit;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;
import com.splitnest.IntegrationTestSupport;
import com.splitnest.common.error.ApiException;
import java.time.Clock;
import java.time.Duration;
import java.util.ArrayList;
import java.util.UUID;
import java.util.concurrent.Callable;
import java.util.concurrent.Executors;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.redis.RedisConnectionFailureException;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.script.RedisScript;

class RateLimiterTest extends IntegrationTestSupport {
    @Autowired RateLimiter limiter;
    @Autowired StringRedisTemplate redis;

    @Test
    void allowsOnlyFiveRequestsAcrossConcurrentCallers() throws Exception {
        String email = UUID.randomUUID() + "@example.com";
        var calls = new ArrayList<Callable<Boolean>>();
        for (int index = 0; index < 20; index++) {
            calls.add(() -> {
                try { limiter.checkLogin(email, "127.0.0.1"); return true; }
                catch (RateLimitExceededException exception) {
                    assertThat(exception.getRetryAfter()).isBetween(1L, 60L);
                    return false;
                }
            });
        }
        try (var executor = Executors.newFixedThreadPool(8)) {
            long allowed = 0;
            for (var result : executor.invokeAll(calls)) { if (result.get()) { allowed++; } }
            assertThat(allowed).isEqualTo(5);
        }
    }

    @Test
    void resetsInNextBucketAndAlwaysSetsExpiry() {
        String identity = UUID.randomUUID().toString();
        var first = new RateLimiter(redis, Clock.fixed(java.time.Instant.parse("2026-01-01T00:00:00Z"), java.time.ZoneOffset.UTC));
        var next = new RateLimiter(redis, Clock.fixed(java.time.Instant.parse("2026-01-01T00:01:00Z"), java.time.ZoneOffset.UTC));
        first.check("test", identity, 1, Duration.ofMinutes(1));
        assertThatThrownBy(() -> first.check("test", identity, 1, Duration.ofMinutes(1)))
                .isInstanceOf(RateLimitExceededException.class);
        next.check("test", identity, 1, Duration.ofMinutes(1));
        // All limiter keys must expire, including ones created by racing requests.
        var keys = redis.keys("rate:test:*");
        assertThat(keys).isNotEmpty();
        keys.forEach(key -> assertThat(redis.getExpire(key)).isBetween(1L, 60L));
    }

    @Test
    @SuppressWarnings("unchecked")
    void returnsServiceUnavailableWhenRedisCannotEnforceTheLimit() {
        StringRedisTemplate unavailable = mock(StringRedisTemplate.class);
        when(unavailable.execute(any(RedisScript.class), any(java.util.List.class), any(Object[].class)))
                .thenThrow(new RedisConnectionFailureException("unavailable"));
        var isolated = new RateLimiter(unavailable, Clock.systemUTC());
        assertThatThrownBy(() -> isolated.checkLogin("test@example.com", "127.0.0.1"))
                .isInstanceOfSatisfying(ApiException.class, error -> assertThat(error.getStatus().value()).isEqualTo(503));
    }
}
