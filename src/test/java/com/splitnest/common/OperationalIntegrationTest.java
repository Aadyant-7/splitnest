package com.splitnest.common;

import com.splitnest.IntegrationTestSupport;
import com.splitnest.budget.BudgetService;
import io.micrometer.prometheusmetrics.PrometheusMeterRegistry;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.Map;
import java.util.UUID;
import javax.sql.DataSource;
import net.javacrumbs.shedlock.core.LockConfiguration;
import net.javacrumbs.shedlock.provider.jdbctemplate.JdbcTemplateLockProvider;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.micrometer.metrics.test.autoconfigure.AutoConfigureMetrics;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mock.web.MockMultipartFile;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@AutoConfigureMetrics(export = true)
class OperationalIntegrationTest extends IntegrationTestSupport {
    @Autowired DataSource dataSource;
    @Autowired PrometheusMeterRegistry prometheus;
    @Autowired BudgetService budgets;

    @Test
    void databaseTimeLocksExcludeAnotherReplicaUntilUnlock() {
        var firstReplica = provider();
        var secondReplica = provider();
        String name = "replica-lock-" + UUID.randomUUID();
        var configuration = new LockConfiguration(Instant.now(), name, Duration.ofMinutes(1), Duration.ZERO);
        var held = firstReplica.lock(configuration);
        assertThat(held).isPresent();
        try {
            assertThat(secondReplica.lock(configuration)).isEmpty();
            assertThat(jdbc.sql("select count(*) from shedlock where name = :name and lock_until > current_timestamp")
                    .param("name", name).query(Integer.class).single()).isEqualTo(1);
        } finally {
            held.orElseThrow().unlock();
        }
        var acquiredAfterRelease = secondReplica.lock(new LockConfiguration(Instant.now(), name,
                Duration.ofMinutes(1), Duration.ZERO));
        assertThat(acquiredAfterRelease).isPresent();
        acquiredAfterRelease.orElseThrow().unlock();
    }

    @Test
    void realImportAndBudgetWorkEmitPrometheusCountersAndDurationHistogram() throws Exception {
        String email = UUID.randomUUID() + "@example.com";
        String token = registerAndLogin(email);
        String groupId = post("/api/v1/groups", Map.of("name", "Metrics integration"), token, 201).get("id").asText();
        var budgetResponse = mvc.perform(put("/api/v1/groups/" + groupId + "/budgets/FOOD")
                        .header("Authorization", "Bearer " + token).contentType("application/json")
                        .content("{\"monthlyLimit\":10.00}"))
                .andExpect(status().isOk()).andReturn().getResponse();
        assertThat(json.readTree(budgetResponse.getContentAsString()).get("monthlyLimit").asText()).isNotBlank();

        LocalDate today = LocalDate.now(ZoneOffset.UTC);
        var statement = new MockMultipartFile("file", "metrics.csv", "text/csv",
                ("date,description,amount\n" + today + ",SWIGGY dinner,25.00\n")
                        .getBytes(java.nio.charset.StandardCharsets.UTF_8));
        var uploaded = mvc.perform(multipart("/api/v1/groups/" + groupId + "/imports").file(statement)
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isAccepted()).andReturn().getResponse();
        String jobId = json.readTree(uploaded.getContentAsString()).get("id").asText();
        long deadline = System.nanoTime() + Duration.ofSeconds(15).toNanos();
        String jobStatus;
        do {
            var result = mvc.perform(get("/api/v1/groups/" + groupId + "/imports/" + jobId)
                            .header("Authorization", "Bearer " + token))
                    .andExpect(status().isOk()).andReturn().getResponse();
            jobStatus = json.readTree(result.getContentAsString()).get("status").asText();
            if (jobStatus.equals("COMPLETED") || jobStatus.equals("FAILED")) { break; }
            Thread.sleep(20);
        } while (System.nanoTime() < deadline);
        assertThat(jobStatus).isEqualTo("COMPLETED");
        budgets.checkCurrentMonth();
        assertThat(jdbc.sql("select count(*) from budget_alerts where group_id = :group")
                .param("group", UUID.fromString(groupId)).query(Integer.class).single()).isEqualTo(1);

        // The asynchronous metric update follows the committed job state by a few instructions.
        String scrape;
        do {
            scrape = prometheus.scrape();
            if (scrape.contains("splitnest_imports_duration_seconds_bucket")) { break; }
            Thread.sleep(10);
        } while (System.nanoTime() < deadline);
        assertThat(scrape).contains("splitnest_imports_processed_total{status=\"COMPLETED\"}",
                "splitnest_imports_duration_seconds_count{status=\"COMPLETED\"}",
                "splitnest_imports_duration_seconds_bucket", "splitnest_budget_alerts_total");
        assertThat(scrape).doesNotContain(email, token, groupId);
    }

    private JdbcTemplateLockProvider provider() {
        return new JdbcTemplateLockProvider(JdbcTemplateLockProvider.Configuration.builder()
                .withJdbcTemplate(new JdbcTemplate(dataSource)).usingDbTime().build());
    }
}
