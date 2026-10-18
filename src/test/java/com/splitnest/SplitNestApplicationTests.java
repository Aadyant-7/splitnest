package com.splitnest;

import org.junit.jupiter.api.Test;
import static org.assertj.core.api.Assertions.assertThat;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.redis.core.StringRedisTemplate;

class SplitNestApplicationTests extends IntegrationTestSupport {
	@Autowired StringRedisTemplate redis;

	@Test
	void connectsToRealPostgresAndRedis() {
		assertThat(jdbc.sql("select current_database()").query(String.class).single()).isEqualTo("test");
		assertThat(redis.getConnectionFactory()).isNotNull();
		try (var connection = redis.getConnectionFactory().getConnection()) {
			assertThat(connection.ping()).isEqualTo("PONG");
		}
	}

}
