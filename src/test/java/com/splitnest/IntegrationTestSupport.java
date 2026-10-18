package com.splitnest;

import java.security.SecureRandom;
import java.util.Base64;
import java.util.Map;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

@SpringBootTest
@AutoConfigureMockMvc
@Import(TestcontainersConfiguration.class)
public abstract class IntegrationTestSupport {
    private static final String TEST_SECRET;
    static {
        byte[] bytes = new byte[32];
        new SecureRandom().nextBytes(bytes);
        TEST_SECRET = Base64.getEncoder().encodeToString(bytes);
    }

    @DynamicPropertySource
    static void properties(DynamicPropertyRegistry registry) {
        registry.add("splitnest.jwt.secret", () -> TEST_SECRET);
        registry.add("spring.datasource.password", () -> "unused-by-service-connection");
        registry.add("splitnest.scheduling.enabled", () -> "false");
    }

    @Autowired protected MockMvc mvc;
    @Autowired protected JsonMapper json;
    @Autowired protected JdbcClient jdbc;

    protected JsonNode post(String path, Object body, String token, int expectedStatus) throws Exception {
        var request = MockMvcRequestBuilders.post(path).contentType(MediaType.APPLICATION_JSON)
                .content(json.writeValueAsString(body));
        if (token != null) { request.header("Authorization", "Bearer " + token); }
        var response = mvc.perform(request).andReturn().getResponse();
        org.assertj.core.api.Assertions.assertThat(response.getStatus())
                .as("HTTP status for %s: %s", path, response.getContentAsString()).isEqualTo(expectedStatus);
        return response.getContentAsByteArray().length == 0 ? json.createObjectNode() : json.readTree(response.getContentAsString());
    }

    protected JsonNode register(String email) throws Exception {
        return post("/api/v1/auth/register", Map.of("email", email, "password", "Strong-Pass-123!", "displayName", "Test User"), null, 201);
    }

    protected String registerAndLogin(String email) throws Exception {
        register(email);
        return post("/api/v1/auth/login", Map.of("email", email, "password", "Strong-Pass-123!"), null, 200)
                .get("accessToken").asText();
    }
}
