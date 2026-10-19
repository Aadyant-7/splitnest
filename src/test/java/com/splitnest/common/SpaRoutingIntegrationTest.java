package com.splitnest.common;

import com.splitnest.IntegrationTestSupport;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.forwardedUrl;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class SpaRoutingIntegrationTest extends IntegrationTestSupport {
    @Test
    void onlyExplicitBrowserPagesForwardToTheStaticIndexWithoutAuthentication() throws Exception {
        for (String route : new String[] {"/", "/login", "/register", "/app", "/app/groups", "/app/groups/" + UUID.randomUUID()}) {
            var result = mvc.perform(get(route)).andExpect(status().isOk())
                    .andExpect(forwardedUrl("/index.html")).andReturn();
            assertThat(result.getResponse().getHeader("Content-Security-Policy"))
                    .contains("script-src 'self'", "object-src 'none'", "frame-ancestors 'none'")
                    .doesNotContain("unsafe-inline", "unsafe-eval");
            assertThat(result.getRequest().getSession(false)).isNull();
        }
        mvc.perform(get("/index.html")).andExpect(status().isOk())
                .andExpect(content().contentTypeCompatibleWith(MediaType.TEXT_HTML))
                .andExpect(content().string(org.hamcrest.Matchers.containsString("SplitNest routing test fixture")));
    }

    @Test
    void missingStaticApiAndActuatorPathsNeverReturnTheSpaIndex() throws Exception {
        String token = registerAndLogin(UUID.randomUUID() + "@example.com");
        for (String path : new String[] {"/assets/missing.js", "/api/v1/missing", "/actuator/missing", "/app/groups/not-a-uuid", "/app/unknown"}) {
            var response = mvc.perform(get(path).header("Authorization", "Bearer " + token))
                    .andExpect(status().isNotFound()).andReturn().getResponse();
            assertThat(response.getForwardedUrl()).isNull();
            assertThat(response.getContentType()).startsWith(MediaType.APPLICATION_PROBLEM_JSON_VALUE);
            assertThat(response.getContentAsString()).doesNotContain("SplitNest routing test fixture");
        }
        mvc.perform(get("/api/v1/users/me")).andExpect(status().isUnauthorized());
    }

    @Test
    void uiRoutesAreReadOnlyAndSwaggerStillLoadsUnderItsExistingPolicy() throws Exception {
        String token = registerAndLogin(UUID.randomUUID() + "@example.com");
        mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post("/app")
                .header("Authorization", "Bearer " + token)).andExpect(status().isMethodNotAllowed());
        var swagger = mvc.perform(get("/swagger-ui/index.html")).andExpect(status().isOk()).andReturn().getResponse();
        assertThat(swagger.getHeader("Content-Security-Policy")).isNull();
        mvc.perform(get("/v3/api-docs")).andExpect(status().isOk());
    }
}
