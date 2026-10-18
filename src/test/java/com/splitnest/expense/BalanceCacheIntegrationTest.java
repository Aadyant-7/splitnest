package com.splitnest.expense;

import com.splitnest.IntegrationTestSupport;
import java.math.BigDecimal;
import java.time.Duration;
import java.time.LocalDate;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.mock.web.MockMultipartFile;
import tools.jackson.databind.JsonNode;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class BalanceCacheIntegrationTest extends IntegrationTestSupport {
    @Autowired StringRedisTemplate redis;

    @Test
    void populatedCacheRoundTripsAndCommittedCreatesAndDeletesInvalidateIt() throws Exception {
        var owner = user();
        String groupId = createGroup(owner.token());
        String key = key(groupId);
        var expense = expense(groupId, owner.token(), "120.00");
        var first = balances(groupId, owner.token());
        assertMoney(first.get(0), "totalPaid", "120.00");
        assertThat(redis.hasKey(key)).isTrue();
        assertThat(redis.getExpire(key)).isBetween(1L, 30L);
        var cached = balances(groupId, owner.token());
        assertThat(cached).isEqualTo(first);

        expense(groupId, owner.token(), "30.00");
        assertThat(redis.hasKey(key)).isFalse();
        assertMoney(balances(groupId, owner.token()).get(0), "totalPaid", "150.00");
        assertThat(redis.hasKey(key)).isTrue();
        mvc.perform(delete("/api/v1/groups/" + groupId + "/expenses/" + expense.get("id").asText())
                        .header("Authorization", "Bearer " + owner.token())).andExpect(status().isNoContent());
        assertThat(redis.hasKey(key)).isFalse();
        assertMoney(balances(groupId, owner.token()).get(0), "totalPaid", "30.00");
    }

    @Test
    void membershipChangesEvictCacheAndCachedBalancesCannotBypassAuthorization() throws Exception {
        var owner = user();
        var member = user();
        var outsider = user();
        String groupId = createGroup(owner.token());
        balances(groupId, owner.token());
        assertThat(redis.hasKey(key(groupId))).isTrue();
        mvc.perform(get("/api/v1/groups/" + groupId + "/balances").header("Authorization", "Bearer " + outsider.token()))
                .andExpect(status().isNotFound());

        post("/api/v1/groups/" + groupId + "/members", Map.of("email", member.email()), owner.token(), 201);
        assertThat(redis.hasKey(key(groupId))).isFalse();
        expense(groupId, owner.token(), "100.00");
        assertThat(balances(groupId, member.token()).size()).isEqualTo(2);
        assertThat(redis.hasKey(key(groupId))).isTrue();
        mvc.perform(delete("/api/v1/groups/" + groupId + "/members/" + member.id())
                        .header("Authorization", "Bearer " + owner.token())).andExpect(status().isNoContent());
        assertThat(redis.hasKey(key(groupId))).isFalse();
        JsonNode afterRemoval = balances(groupId, owner.token());
        assertThat(afterRemoval.size()).isEqualTo(2);
        JsonNode historical = row(afterRemoval, member.id());
        assertThat(historical.get("currentMember").asBoolean()).isFalse();
        assertMoney(historical, "totalShare", "50.00");
        assertThat(redis.hasKey(key(groupId))).isTrue();
        mvc.perform(get("/api/v1/groups/" + groupId + "/balances").header("Authorization", "Bearer " + member.token()))
                .andExpect(status().isNotFound());
    }

    @Test
    void rejectedExpenseDoesNotChangeDatabaseOrPreviouslyCachedBalances() throws Exception {
        var owner = user();
        var outsider = user();
        String groupId = createGroup(owner.token());
        expense(groupId, owner.token(), "90.00");
        JsonNode before = balances(groupId, owner.token());
        post("/api/v1/groups/" + groupId + "/expenses", Map.of("amount", "12.00", "description", "Invalid payer",
                "category", "FOOD", "expenseDate", LocalDate.now().toString(), "paidBy", outsider.id()), owner.token(), 404);
        assertThat(jdbc.sql("select count(*) from expenses where group_id = :groupId")
                .param("groupId", UUID.fromString(groupId)).query(Integer.class).single()).isEqualTo(1);
        assertThat(balances(groupId, owner.token())).isEqualTo(before);
    }

    @Test
    void completedStatementImportInvalidatesPreviouslyPopulatedBalances() throws Exception {
        var owner = user();
        String groupId = createGroup(owner.token());
        balances(groupId, owner.token());
        assertThat(redis.hasKey(key(groupId))).isTrue();
        var file = new MockMultipartFile("file", "cache-test.csv", "text/csv",
                ("date,description,amount\n" + LocalDate.now() + ",SWIGGY dinner,45.00\n")
                        .getBytes(java.nio.charset.StandardCharsets.UTF_8));
        var upload = mvc.perform(multipart("/api/v1/groups/" + groupId + "/imports").file(file)
                        .header("Authorization", "Bearer " + owner.token()))
                .andExpect(status().isAccepted()).andReturn().getResponse();
        String jobId = json.readTree(upload.getContentAsString()).get("id").asText();
        InstantDeadline deadline = new InstantDeadline(Duration.ofSeconds(15));
        JsonNode job;
        do {
            var result = mvc.perform(get("/api/v1/groups/" + groupId + "/imports/" + jobId)
                            .header("Authorization", "Bearer " + owner.token()))
                    .andExpect(status().isOk()).andReturn().getResponse();
            job = json.readTree(result.getContentAsString());
            if (job.get("status").asText().equals("COMPLETED") || job.get("status").asText().equals("FAILED")) { break; }
            Thread.sleep(25);
        } while (!deadline.expired());
        assertThat(job.get("status").asText()).as("import job: %s", job).isEqualTo("COMPLETED");
        assertThat(job.get("importedRows").asInt()).isEqualTo(1);
        var evictionDeadline = new InstantDeadline(Duration.ofSeconds(3));
        while (Boolean.TRUE.equals(redis.hasKey(key(groupId))) && !evictionDeadline.expired()) {
            Thread.sleep(10);
        }
        assertThat(redis.hasKey(key(groupId))).as("committed import evicts before the 30-second cache TTL").isFalse();
        assertMoney(balances(groupId, owner.token()).get(0), "totalPaid", "45.00");
    }

    private TestUser user() throws Exception {
        String email = UUID.randomUUID() + "@example.com";
        var registered = register(email);
        String token = post("/api/v1/auth/login", Map.of("email", email, "password", "Strong-Pass-123!"), null, 200)
                .get("accessToken").asText();
        return new TestUser(registered.get("id").asText(), email, token);
    }

    private String createGroup(String token) throws Exception {
        return post("/api/v1/groups", Map.of("name", "Cache integration"), token, 201).get("id").asText();
    }

    private JsonNode expense(String groupId, String token, String amount) throws Exception {
        return post("/api/v1/groups/" + groupId + "/expenses", Map.of("amount", amount, "description", "Dinner",
                "category", "FOOD", "expenseDate", LocalDate.now().toString()), token, 201);
    }

    private JsonNode balances(String groupId, String token) throws Exception {
        var response = mvc.perform(get("/api/v1/groups/" + groupId + "/balances").header("Authorization", "Bearer " + token))
                .andExpect(status().isOk()).andReturn().getResponse();
        return json.readTree(response.getContentAsString());
    }

    private static JsonNode row(JsonNode rows, String userId) {
        for (JsonNode row : rows) { if (row.get("userId").asText().equals(userId)) { return row; } }
        throw new AssertionError("Missing balance for " + userId);
    }

    private static void assertMoney(JsonNode row, String field, String expected) {
        assertThat(new BigDecimal(row.get(field).asText())).isEqualByComparingTo(expected);
    }

    private static String key(String groupId) { return "balances::" + groupId; }
    private record TestUser(String id, String email, String token) { }
    private record InstantDeadline(long deadlineNanos) {
        InstantDeadline(Duration duration) { this(System.nanoTime() + duration.toNanos()); }
        boolean expired() { return System.nanoTime() >= deadlineNanos; }
    }
}
