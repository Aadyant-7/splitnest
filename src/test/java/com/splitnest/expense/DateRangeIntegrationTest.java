package com.splitnest.expense;

import static org.assertj.core.api.Assertions.assertThat;
import com.splitnest.IntegrationTestSupport;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;

class DateRangeIntegrationTest extends IntegrationTestSupport {
    @Test
    void rejectsExpandedYearBeforeDatabasePersistence() throws Exception {
        String token = registerAndLogin(UUID.randomUUID() + "@example.com");
        String group = post("/api/v1/groups", Map.of("name", "Date validation"), token, 201).get("id").asText();
        var problem = post("/api/v1/groups/" + group + "/expenses", Map.of(
                "amount", "10.00", "description", "Unsupported date", "category", "OTHER",
                "expenseDate", "+999999998-01-01"), token, 400);
        assertThat(problem.get("detail").asText()).contains("0001-9999");
        assertThat(jdbc.sql("select count(*) from expenses where group_id=:id")
                .param("id", UUID.fromString(group)).query(Long.class).single()).isZero();
    }
}
