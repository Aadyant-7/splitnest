package com.splitnest.budget;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.splitnest.IntegrationTestSupport;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.Callable;
import java.util.concurrent.Executors;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;

class BudgetIT extends IntegrationTestSupport {
    @Autowired BudgetRepository budgets;

    @Test
    void budgetUpsertsAndRequiresAdminWhileReadsRequireMembership() throws Exception {
        String admin = registerAndLogin(email());
        String memberEmail = email();
        String member = registerAndLogin(memberEmail);
        String outsider = registerAndLogin(email());
        UUID group = createGroup(admin);
        post("/api/v1/groups/" + group + "/members", Map.of("email", memberEmail), admin, 201);
        String path = "/api/v1/groups/" + group + "/budgets/FOOD";
        mvc.perform(put(path).contentType(MediaType.APPLICATION_JSON).content("{\"monthlyLimit\":100.00}")
                .header("Authorization", "Bearer " + member)).andExpect(status().isForbidden());
        mvc.perform(put(path).contentType(MediaType.APPLICATION_JSON).content("{\"monthlyLimit\":100.00}")
                .header("Authorization", "Bearer " + outsider)).andExpect(status().isNotFound());
        var first = mvc.perform(put(path).contentType(MediaType.APPLICATION_JSON).content("{\"monthlyLimit\":100.00}")
                .header("Authorization", "Bearer " + admin)).andExpect(status().isOk()).andReturn().getResponse();
        var second = mvc.perform(put(path).contentType(MediaType.APPLICATION_JSON).content("{\"monthlyLimit\":150.00}")
                .header("Authorization", "Bearer " + admin)).andExpect(status().isOk()).andReturn().getResponse();
        assertThat(json.readTree(first.getContentAsString()).get("id").asText()).isEqualTo(json.readTree(second.getContentAsString()).get("id").asText());
        assertThat(budgets.list(group)).hasSize(1);
        assertThat(budgets.list(group).getFirst().monthlyLimit()).isEqualByComparingTo("150.00");
        mvc.perform(get("/api/v1/groups/" + group + "/budgets").header("Authorization", "Bearer " + member)).andExpect(status().isOk());
        mvc.perform(get("/api/v1/groups/" + group + "/alerts").header("Authorization", "Bearer " + outsider)).andExpect(status().isNotFound());
        mvc.perform(put(path).contentType(MediaType.APPLICATION_JSON).content("{\"monthlyLimit\":0}")
                .header("Authorization", "Bearer " + admin)).andExpect(status().isBadRequest());
    }

    @Test
    void alertsUseExpenseDatesAndStrictThresholdWithConflictSafeConcurrency() throws Exception {
        String admin = registerAndLogin(email());
        UUID group = createGroup(admin);
        budgets.upsert(group, com.splitnest.expense.Category.FOOD, new java.math.BigDecimal("100.00"));
        budgets.upsert(group, com.splitnest.expense.Category.RENT, new java.math.BigDecimal("100.00"));
        expense(admin, group, "2026-10-01", "40.00", "FOOD");
        expense(admin, group, "2026-10-31", "60.01", "FOOD");
        expense(admin, group, "2026-09-30", "999.00", "FOOD");
        expense(admin, group, "2026-11-01", "999.00", "FOOD");
        expense(admin, group, "2026-10-05", "100.00", "RENT");
        LocalDate month = LocalDate.of(2026, 10, 1);
        try (var pool = Executors.newFixedThreadPool(2)) {
            Callable<Integer> check = () -> budgets.createAlerts(month, Instant.parse("2026-10-31T23:59:59Z"));
            var results = pool.invokeAll(List.of(check, check));
            assertThat(results.get(0).get() + results.get(1).get()).isEqualTo(1);
        }
        var alerts = budgets.alerts(group);
        assertThat(alerts).hasSize(1);
        assertThat(alerts.getFirst().spent()).isEqualByComparingTo("100.01");
        assertThat(alerts.getFirst().month()).isEqualTo(month);
        assertThat(budgets.createAlerts(month, Instant.now())).isZero();
    }

    @Test
    void oversizedMonthlyAggregateIsGuardedWithoutClampingIt() throws Exception {
        String admin = registerAndLogin(email());
        UUID group = createGroup(admin);
        budgets.upsert(group, com.splitnest.expense.Category.OTHER, new java.math.BigDecimal("100.00"));
        expense(admin, group, "2026-10-01", "9999999999.99", "OTHER");
        expense(admin, group, "2026-10-02", "1.00", "OTHER");
        assertThat(budgets.oversizedSnapshots(LocalDate.of(2026, 10, 1))).isGreaterThanOrEqualTo(1);
        budgets.createAlerts(LocalDate.of(2026, 10, 1), Instant.now());
        assertThat(budgets.alerts(group)).isEmpty();
    }

    private UUID createGroup(String token) throws Exception {
        return UUID.fromString(post("/api/v1/groups", Map.of("name", "Budget group"), token, 201).get("id").asText());
    }

    private void expense(String token, UUID group, String date, String amount, String category) throws Exception {
        post("/api/v1/groups/" + group + "/expenses", Map.of("expenseDate", date, "amount", amount,
                "description", "Budget test", "category", category), token, 201);
    }

    private String email() { return "budget-" + UUID.randomUUID() + "@example.com"; }
}
