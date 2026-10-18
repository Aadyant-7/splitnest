package com.splitnest.expense;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;

import com.splitnest.IntegrationTestSupport;
import com.splitnest.common.error.ApiException;
import com.splitnest.group.GroupRepository;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import tools.jackson.databind.JsonNode;

class FinancialApiIntegrationTests extends IntegrationTestSupport {
    @Autowired ExpenseService expenses;
    @Autowired GroupRepository groups;
    @Autowired PlatformTransactionManager transactionManager;

    @Test
    void createsAnAdminGroupAndListsOnlyTheCallersOwnGroups() throws Exception {
        Actor owner = actor();
        Actor outsider = actor();
        UUID groupId = group(owner, "Flatmates");
        UUID otherGroup = group(outsider, "Another household");
        JsonNode group = getJson("/api/v1/groups/" + groupId, owner.token(), 200);
        assertThat(group.get("name").asText()).isEqualTo("Flatmates");
        assertThat(group.get("members").size()).isEqualTo(1);
        assertThat(group.get("members").get(0).get("role").asText()).isEqualTo("ADMIN");
        JsonNode list = getJson("/api/v1/groups", owner.token(), 200);
        assertThat(list.size()).isEqualTo(1);
        assertThat(list.get(0).get("id").asText()).isEqualTo(groupId.toString());
        assertThat(list.toString()).doesNotContain(otherGroup.toString());
    }

    @Test
    void knownScenarioUsesExactSharesAndSqlAggregatesWithoutMultiplyingPayments() throws Exception {
        Actor owner = actor();
        Actor second = actor();
        Actor third = actor();
        UUID groupId = group(owner, "Trip");
        add(groupId, owner, second);
        add(groupId, owner, third);
        JsonNode firstExpense = create(groupId, owner, "100.00");
        assertThat(firstExpense.get("splits").size()).isEqualTo(3);
        var ordered = List.of(owner.id(), second.id(), third.id()).stream()
                .sorted(Comparator.comparing(UUID::toString)).toList();
        for (int index = 0; index < 3; index++) {
            var split = firstExpense.get("splits").get(index);
            assertThat(split.get("userId").asText()).isEqualTo(ordered.get(index).toString());
            assertThat(split.get("shareAmount").decimalValue())
                    .isEqualByComparingTo(index == 0 ? "33.34" : "33.33");
        }
        create(groupId, second, "30.00");
        JsonNode balances = getJson("/api/v1/groups/" + groupId + "/balances", owner.token(), 200);
        assertThat(balances.size()).isEqualTo(3);
        BigDecimal sum = BigDecimal.ZERO;
        for (JsonNode balance : balances) {
            UUID userId = UUID.fromString(balance.get("userId").asText());
            BigDecimal paid = userId.equals(owner.id()) ? new BigDecimal("100.00")
                    : userId.equals(second.id()) ? new BigDecimal("30.00") : BigDecimal.ZERO;
            BigDecimal share = new BigDecimal(userId.equals(ordered.getFirst()) ? "43.34" : "43.33");
            assertThat(balance.get("totalPaid").decimalValue()).isEqualByComparingTo(paid);
            assertThat(balance.get("totalShare").decimalValue()).isEqualByComparingTo(share);
            assertThat(balance.get("netBalance").decimalValue()).isEqualByComparingTo(paid.subtract(share));
            assertThat(balance.get("currentMember").asBoolean()).isTrue();
            sum = sum.add(balance.get("netBalance").decimalValue());
        }
        assertThat(sum).isEqualByComparingTo("0.00");
    }

    @Test
    void everyGroupAndFinancialEndpointHidesForeignGroupsAndConstrainsNestedIds() throws Exception {
        Actor admin = actor();
        Actor member = actor();
        Actor outsider = actor();
        UUID groupId = group(admin, "Private");
        add(groupId, admin, member);
        UUID otherGroup = group(outsider, "Foreign");
        JsonNode expense = create(groupId, admin, "12.00");
        JsonNode foreignExpense = create(otherGroup, outsider, "9.00");
        String base = "/api/v1/groups/" + groupId;
        for (String path : List.of(base, base + "/expenses", base + "/balances")) {
            getJson(path, outsider.token(), 404);
        }
        post(base + "/expenses", expenseBody("3.00"), outsider.token(), 404);
        post(base + "/members", Map.of("email", outsider.email()), outsider.token(), 404);
        deleteStatus(base + "/members/" + member.id(), outsider.token(), 404);
        deleteStatus(base + "/expenses/" + expense.get("id").asText(), outsider.token(), 404);
        post(base + "/members", Map.of("email", outsider.email()), member.token(), 403);
        deleteStatus(base + "/members/" + admin.id(), member.token(), 403);
        deleteStatus(base + "/expenses/" + expense.get("id").asText(), member.token(), 403);
        deleteStatus(base + "/expenses/" + foreignExpense.get("id").asText(), admin.token(), 404);
        deleteStatus(base + "/members/" + outsider.id(), admin.token(), 404);
        getJson("/api/v1/groups/" + UUID.randomUUID(), outsider.token(), 404);
        // Both denied mutations and a mismatched child ID leave the real expense untouched.
        assertThat(getJson(base + "/expenses", admin.token(), 200).get("totalElements").asLong()).isEqualTo(1);
        assertThat(getJson("/api/v1/groups/" + otherGroup + "/expenses", outsider.token(), 200)
                .get("totalElements").asLong()).isEqualTo(1);
    }

    @Test
    void memberRemovalRetainsOldSplitsAndBalancesWhileNewExpensesUseTheNewRoster() throws Exception {
        Actor owner = actor();
        Actor removed = actor();
        Actor remaining = actor();
        UUID groupId = group(owner, "History");
        add(groupId, owner, removed);
        add(groupId, owner, remaining);
        JsonNode original = create(groupId, removed, "100.00");
        String base = "/api/v1/groups/" + groupId;
        deleteStatus(base + "/members/" + removed.id(), owner.token(), 204);
        getJson(base + "/balances", removed.token(), 404);
        post(base + "/expenses", expenseBody("1.00"), removed.token(), 404);
        JsonNode next = create(groupId, owner, "60.00");
        assertThat(next.get("splits").size()).isEqualTo(2);
        assertThat(next.get("splits").toString()).doesNotContain(removed.id().toString());
        assertThat(jdbc.sql("SELECT count(*) FROM expense_splits WHERE expense_id=:id")
                .param("id", UUID.fromString(original.get("id").asText())).query(Long.class).single()).isEqualTo(3);
        JsonNode balances = getJson(base + "/balances", owner.token(), 200);
        assertThat(balances.size()).isEqualTo(3);
        for (JsonNode balance : balances) {
            if (balance.get("userId").asText().equals(removed.id().toString())) {
                assertThat(balance.get("currentMember").asBoolean()).isFalse();
                assertThat(balance.get("totalPaid").decimalValue()).isEqualByComparingTo("100.00");
                assertThat(balance.get("totalShare").decimalValue()).isBetween(new BigDecimal("33.33"), new BigDecimal("33.34"));
            }
        }
        assertThat(sumNet(balances)).isEqualByComparingTo("0.00");
    }

    @Test
    void acceptsOnlyValidMoneyAndPayersAndReturnsStableBoundedPages() throws Exception {
        Actor owner = actor();
        Actor outsider = actor();
        UUID groupId = group(owner, "Validation");
        String base = "/api/v1/groups/" + groupId;
        for (String amount : List.of("0", "-1", "1.001", "10000000000.00")) {
            post(base + "/expenses", expenseBody(amount), owner.token(), 400);
        }
        var foreignPayer = new java.util.HashMap<>(expenseBody("1.00"));
        foreignPayer.put("paidBy", outsider.id());
        post(base + "/expenses", foreignPayer, owner.token(), 404);
        JsonNode first = create(groupId, owner, "1.00");
        JsonNode second = create(groupId, owner, "2.00");
        JsonNode page = getJson(base + "/expenses?page=0&size=1", owner.token(), 200);
        assertThat(page.get("content").get(0).get("id").asText()).isEqualTo(second.get("id").asText());
        assertThat(page.get("totalElements").asLong()).isEqualTo(2);
        assertThat(page.get("totalPages").asLong()).isEqualTo(2);
        assertThat(page.get("first").asBoolean()).isTrue();
        assertThat(page.get("last").asBoolean()).isFalse();
        JsonNode next = getJson(base + "/expenses?page=1&size=1", owner.token(), 200);
        assertThat(next.get("content").get(0).get("id").asText()).isEqualTo(first.get("id").asText());
        assertThat(next.get("last").asBoolean()).isTrue();
        getJson(base + "/expenses?size=101", owner.token(), 400);
        getJson(base + "/expenses?size=0", owner.token(), 400);
        getJson(base + "/expenses?page=-1", owner.token(), 400);
        assertThat(getJson(base + "/expenses?page=2147483647&size=100", owner.token(), 200)
                .get("content").size()).isZero();
    }

    @Test
    void onlyCreatorOrAdminCanDeleteAndSplitsDisappearInTheSameTransaction() throws Exception {
        Actor admin = actor();
        Actor member = actor();
        UUID groupId = group(admin, "Deletion");
        add(groupId, admin, member);
        String base = "/api/v1/groups/" + groupId;
        UUID own = UUID.fromString(create(groupId, member, "10.00").get("id").asText());
        deleteStatus(base + "/expenses/" + own, member.token(), 204);
        assertThat(jdbc.sql("SELECT count(*) FROM expense_splits WHERE expense_id=:id")
                .param("id", own).query(Long.class).single()).isZero();
        UUID other = UUID.fromString(create(groupId, member, "11.00").get("id").asText());
        deleteStatus(base + "/expenses/" + other, admin.token(), 204);
        assertThat(getJson(base + "/expenses", admin.token(), 200).get("totalElements").asLong()).isZero();
        assertThat(sumNet(getJson(base + "/balances", admin.token(), 200))).isEqualByComparingTo("0.00");
    }

    @Test
    void aFailedImportBatchRollsBackEarlierExpensesAndTheirSplits() throws Exception {
        Actor owner = actor();
        UUID groupId = group(owner, "Rollback");
        var valid = new ExpenseDraft(new BigDecimal("10.00"), "Valid row", Category.FOOD, LocalDate.of(2026, 1, 1));
        var invalid = new ExpenseDraft(new BigDecimal("5.00"), "", Category.OTHER, LocalDate.of(2026, 1, 1));
        assertThatThrownBy(() -> expenses.createImported(groupId, owner.id(), null, List.of(valid, invalid)))
                .isInstanceOf(ApiException.class);
        assertThat(jdbc.sql("SELECT count(*) FROM expenses WHERE group_id=:id")
                .param("id", groupId).query(Long.class).single()).isZero();
        assertThat(jdbc.sql("""
                SELECT count(*) FROM expense_splits s JOIN expenses e ON e.id=s.expense_id WHERE e.group_id=:id
                """).param("id", groupId).query(Long.class).single()).isZero();
    }

    @Test
    void importWaitsForMembershipMutationAndRechecksAccessAfterTakingTheGroupLock() throws Exception {
        Actor owner = actor();
        Actor member = actor();
        UUID groupId = group(owner, "Concurrent roster");
        add(groupId, owner, member);
        var started = new CountDownLatch(1);
        try (var executor = Executors.newSingleThreadExecutor()) {
            var holder = new java.util.concurrent.atomic.AtomicReference<java.util.concurrent.Future<?>>();
            new TransactionTemplate(transactionManager).executeWithoutResult(status -> {
                groups.lockGroup(groupId);
                holder.set(executor.submit(() -> {
                    started.countDown();
                    expenses.createImported(groupId, member.id(), null, List.of(new ExpenseDraft(
                            new BigDecimal("1.00"), "Should not be saved", Category.OTHER, LocalDate.of(2026, 1, 1))));
                }));
                try {
                    assertThat(started.await(5, TimeUnit.SECONDS)).isTrue();
                    assertThatThrownBy(() -> holder.get().get(150, TimeUnit.MILLISECONDS)).isInstanceOf(TimeoutException.class);
                } catch (InterruptedException exception) {
                    Thread.currentThread().interrupt();
                    throw new AssertionError(exception);
                }
                groups.removeMember(groupId, member.id());
            });
            assertThatThrownBy(() -> holder.get().get(10, TimeUnit.SECONDS))
                    .hasCauseInstanceOf(ApiException.class);
        }
        assertThat(jdbc.sql("SELECT count(*) FROM expenses WHERE group_id=:id")
                .param("id", groupId).query(Long.class).single()).isZero();
    }

    @Test
    void lastAdministratorCannotRemoveThemselvesAndDuplicateMembershipIsAConflict() throws Exception {
        Actor admin = actor();
        Actor member = actor();
        UUID groupId = group(admin, "Admin invariant");
        add(groupId, admin, member);
        post("/api/v1/groups/" + groupId + "/members", Map.of("email", member.email()), admin.token(), 409);
        deleteStatus("/api/v1/groups/" + groupId + "/members/" + admin.id(), admin.token(), 409);
        assertThat(groups.adminCount(groupId)).isEqualTo(1);
        assertThat(getJson("/api/v1/groups/" + groupId, admin.token(), 200).get("members").size()).isEqualTo(2);
    }

    @Test
    void concurrentAdministratorRemovalsCannotLeaveAGroupWithoutAnAdministrator() throws Exception {
        Actor first = actor();
        Actor second = actor();
        UUID groupId = group(first, "Concurrent admins");
        add(groupId, first, second);
        // There is no promotion endpoint in this product; seed the second admin to exercise the invariant.
        jdbc.sql("UPDATE group_members SET role='ADMIN' WHERE group_id=:groupId AND user_id=:userId")
                .param("groupId", groupId).param("userId", second.id()).update();
        CountDownLatch start = new CountDownLatch(1);
        try (var executor = Executors.newFixedThreadPool(2)) {
            var removeFirst = executor.submit(() -> {
                start.await();
                return mvc.perform(delete("/api/v1/groups/" + groupId + "/members/" + first.id())
                        .header("Authorization", "Bearer " + first.token())).andReturn().getResponse().getStatus();
            });
            var removeSecond = executor.submit(() -> {
                start.await();
                return mvc.perform(delete("/api/v1/groups/" + groupId + "/members/" + second.id())
                        .header("Authorization", "Bearer " + second.token())).andReturn().getResponse().getStatus();
            });
            start.countDown();
            assertThat(List.of(removeFirst.get(10, TimeUnit.SECONDS), removeSecond.get(10, TimeUnit.SECONDS)))
                    .containsExactlyInAnyOrder(204, 409);
        }
        assertThat(groups.adminCount(groupId)).isEqualTo(1);
    }

    private Actor actor() throws Exception {
        String email = "financial-" + UUID.randomUUID() + "@example.com";
        UUID id = UUID.fromString(register(email).get("id").asText());
        String token = post("/api/v1/auth/login", Map.of("email", email, "password", "Strong-Pass-123!"), null, 200)
                .get("accessToken").asText();
        return new Actor(id, email, token);
    }

    private UUID group(Actor owner, String name) throws Exception {
        return UUID.fromString(post("/api/v1/groups", Map.of("name", name), owner.token(), 201).get("id").asText());
    }

    private void add(UUID groupId, Actor admin, Actor member) throws Exception {
        post("/api/v1/groups/" + groupId + "/members", Map.of("email", member.email()), admin.token(), 201);
    }

    private JsonNode create(UUID groupId, Actor actor, String amount) throws Exception {
        return post("/api/v1/groups/" + groupId + "/expenses", expenseBody(amount), actor.token(), 201);
    }

    private Map<String, Object> expenseBody(String amount) {
        return Map.of("amount", new BigDecimal(amount), "description", "Shared expense", "category", "FOOD",
                "expenseDate", "2026-01-01");
    }

    private JsonNode getJson(String path, String token, int expected) throws Exception {
        var response = mvc.perform(get(path).header("Authorization", "Bearer " + token)).andReturn().getResponse();
        assertThat(response.getStatus()).as("GET %s: %s", path, response.getContentAsString()).isEqualTo(expected);
        return json.readTree(response.getContentAsString());
    }

    private void deleteStatus(String path, String token, int expected) throws Exception {
        var response = mvc.perform(delete(path).header("Authorization", "Bearer " + token)).andReturn().getResponse();
        assertThat(response.getStatus()).as("DELETE %s: %s", path, response.getContentAsString()).isEqualTo(expected);
    }

    private BigDecimal sumNet(JsonNode balances) {
        BigDecimal sum = BigDecimal.ZERO;
        for (JsonNode balance : balances) { sum = sum.add(balance.get("netBalance").decimalValue()); }
        return sum;
    }

    private record Actor(UUID id, String email, String token) {}
}
