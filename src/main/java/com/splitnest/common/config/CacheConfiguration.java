package com.splitnest.common.config;

import com.splitnest.expense.BalanceResponse;
import java.time.Duration;
import java.util.List;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.cache.Cache;
import org.springframework.cache.CacheManager;
import org.springframework.cache.annotation.CachingConfigurer;
import org.springframework.cache.annotation.EnableCaching;
import org.springframework.cache.interceptor.CacheErrorHandler;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.data.redis.cache.RedisCacheConfiguration;
import org.springframework.data.redis.cache.RedisCacheManager;
import org.springframework.data.redis.connection.RedisConnectionFactory;
import org.springframework.data.redis.serializer.JacksonJsonRedisSerializer;
import org.springframework.data.redis.serializer.RedisSerializationContext;
import tools.jackson.databind.json.JsonMapper;

@Configuration(proxyBeanMethods = false)
@EnableCaching
public class CacheConfiguration implements CachingConfigurer {
    private static final Logger log = LoggerFactory.getLogger(CacheConfiguration.class);

    @Bean
    CacheManager cacheManager(RedisConnectionFactory connectionFactory, JsonMapper json) {
        var type = json.getTypeFactory().constructCollectionType(List.class, BalanceResponse.class);
        var serializer = new JacksonJsonRedisSerializer<List<BalanceResponse>>(json, type);
        var configuration = RedisCacheConfiguration.defaultCacheConfig()
                .entryTtl(Duration.ofSeconds(30)).disableCachingNullValues()
                .serializeValuesWith(RedisSerializationContext.SerializationPair.fromSerializer(serializer));
        return RedisCacheManager.builder(connectionFactory).cacheDefaults(configuration)
                .initialCacheNames(java.util.Set.of("balances")).build();
    }

    @Override
    public CacheErrorHandler errorHandler() {
        return new CacheErrorHandler() {
            private void unavailable(String operation) {
                // Balance reads can recompute from PostgreSQL; do not log sensitive values.
                log.warn("Balance cache {} failed; PostgreSQL remains authoritative", operation);
            }
            public void handleCacheGetError(RuntimeException error, Cache cache, Object key) { unavailable("read"); }
            public void handleCachePutError(RuntimeException error, Cache cache, Object key, Object value) { unavailable("write"); }
            public void handleCacheEvictError(RuntimeException error, Cache cache, Object key) { unavailable("eviction"); }
            public void handleCacheClearError(RuntimeException error, Cache cache) { unavailable("clear"); }
        };
    }
}
