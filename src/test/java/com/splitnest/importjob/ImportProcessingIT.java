package com.splitnest.importjob;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.splitnest.IntegrationTestSupport;
import com.splitnest.expense.Category;
import com.splitnest.expense.ExpenseDraft;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
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
import org.springframework.mock.web.MockMultipartFile;

class ImportProcessingIT extends IntegrationTestSupport {
    @Autowired ImportRepository imports;
    @Autowired ImportTransactions transactions;
    @Autowired ImportDispatcher dispatcher;
    @Autowired ImportRecovery recovery;

    @Test
    void multipartUploadProcessesValidRowsAndClearsFileContent() throws Exception {
        String token = registerAndLogin(email());
        UUID group = createGroup(token);
        var file = new MockMultipartFile("file", "../statement.csv", "text/csv",
                bytes("date,description,amount\n2026-10-01,SWIGGY,100\ninvalid,skip,1"));
        var response = mvc.perform(multipart(path(group)).file(file).header("Authorization", "Bearer " + token))
                .andExpect(status().isAccepted()).andReturn().getResponse();
        UUID id = UUID.fromString(json.readTree(response.getContentAsString()).get("id").asText());
        assertThat(response.getHeader("Location")).endsWith("/imports/" + id);
        var job = awaitTerminal(id, group);
        assertThat(job.status()).isEqualTo(ImportStatus.COMPLETED);
        assertThat(job.fileName()).isEqualTo("statement.csv");
        assertThat(job.totalRows()).isEqualTo(2);
        assertThat(job.importedRows()).isEqualTo(1);
        assertThat(job.invalidRows()).isEqualTo(1);
        assertThat(job.content()).isEmpty();
        assertThat(jdbc.sql("SELECT COUNT(*) FROM expenses WHERE import_job_id = :id").param("id", id).query(Long.class).single()).isEqualTo(1);
    }

    @Test
    void periodicDispatcherRecoversLostEventAndZeroValidRowsFail() throws Exception {
        String token = registerAndLogin(email());
        UUID group = createGroup(token);
        UUID uploader = uploader(group);
        UUID id = UUID.randomUUID();
        imports.insert(id, group, uploader, "invalid.csv", bytes("date,description,amount\nnot-a-date,A,1"), Instant.now());
        dispatcher.dispatchPending();
        var failed = awaitTerminal(id, group);
        assertThat(failed.status()).isEqualTo(ImportStatus.FAILED);
        assertThat(failed.totalRows()).isEqualTo(1);
        assertThat(failed.importedRows()).isZero();
        assertThat(failed.invalidRows()).isEqualTo(1);
        assertThat(failed.errorMessage()).contains("no valid");
        assertThat(failed.content()).isEmpty();
    }

    @Test
    void atomicClaimAllowsOnlyOneWorker() throws Exception {
        String token = registerAndLogin(email());
        UUID group = createGroup(token);
        UUID id = insertPending(group);
        try (var pool = Executors.newFixedThreadPool(2)) {
            Callable<Boolean> claim = () -> transactions.claim(id).isPresent();
            var results = pool.invokeAll(List.of(claim, claim));
            assertThat(results.stream().map(result -> {
                try { return result.get(); } catch (Exception exception) { throw new RuntimeException(exception); }
            }).filter(Boolean::booleanValue).count()).isEqualTo(1);
        }
        transactions.fail(id, 0, "Test complete");
    }

    @Test
    void recoveryFencesAStaleWorkerAndCreatesNoExpenses() throws Exception {
        String token = registerAndLogin(email());
        UUID group = createGroup(token);
        UUID id = insertPending(group);
        var claimed = transactions.claim(id).orElseThrow();
        jdbc.sql("UPDATE import_jobs SET started_at = :old WHERE id = :id")
                .param("old", Timestamp.from(Instant.now().minusSeconds(601))).param("id", id).update();
        recovery.recover();
        var statement = new ParsedStatement(1, List.of(draft()));
        assertThat(transactions.complete(claimed, statement)).isFalse();
        assertThat(imports.find(id, group).orElseThrow().status()).isEqualTo(ImportStatus.FAILED);
        assertThat(jdbc.sql("SELECT COUNT(*) FROM expenses WHERE import_job_id = :id").param("id", id).query(Long.class).single()).isZero();
    }

    @Test
    void failedPersistenceRollsBackEarlierRowsAndCompletion() throws Exception {
        String token = registerAndLogin(email());
        UUID group = createGroup(token);
        UUID id = insertPending(group);
        var claimed = transactions.claim(id).orElseThrow();
        var invalid = new ExpenseDraft(new BigDecimal("-1.00"), "Invalid", Category.OTHER, LocalDate.of(2026, 10, 1));
        org.assertj.core.api.Assertions.assertThatThrownBy(() -> transactions.complete(claimed, new ParsedStatement(2, List.of(draft(), invalid))))
                .isInstanceOf(RuntimeException.class);
        assertThat(jdbc.sql("SELECT COUNT(*) FROM expenses WHERE import_job_id = :id").param("id", id).query(Long.class).single()).isZero();
        assertThat(imports.find(id, group).orElseThrow().status()).isEqualTo(ImportStatus.PROCESSING);
        transactions.fail(id, 2, "Test complete");
    }

    @Test
    void membershipIsRecheckedBeforePersistingAnUploadedStatement() throws Exception {
        String admin = registerAndLogin(email());
        String memberEmail = email();
        registerAndLogin(memberEmail);
        UUID group = createGroup(admin);
        var member = post("/api/v1/groups/" + group + "/members", Map.of("email", memberEmail), admin, 201);
        UUID memberId = UUID.fromString(member.get("userId").asText());
        UUID id = UUID.randomUUID();
        imports.insert(id, group, memberId, "statement.csv", bytes("date,description,amount\n2026-10-01,A,1"), Instant.now());
        var claimed = transactions.claim(id).orElseThrow();
        mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete("/api/v1/groups/" + group + "/members/" + memberId)
                .header("Authorization", "Bearer " + admin)).andExpect(status().isNoContent());
        org.assertj.core.api.Assertions.assertThatThrownBy(() -> transactions.complete(claimed, new ParsedStatement(1, List.of(draft()))))
                .isInstanceOf(com.splitnest.common.error.ApiException.class);
        assertThat(jdbc.sql("SELECT COUNT(*) FROM expenses WHERE import_job_id = :id").param("id", id).query(Long.class).single()).isZero();
        transactions.fail(id, 1, "Uploader is no longer a member");
    }

    @Test
    void accessIsScopedToBothGroupAndJobAndRejectsWrongType() throws Exception {
        String owner = registerAndLogin(email());
        String outsider = registerAndLogin(email());
        UUID group = createGroup(owner);
        UUID otherGroup = createGroup(owner);
        UUID id = insertPending(group);
        mvc.perform(get(path(group) + "/" + id).header("Authorization", "Bearer " + outsider)).andExpect(status().isNotFound());
        mvc.perform(get(path(otherGroup) + "/" + id).header("Authorization", "Bearer " + owner)).andExpect(status().isNotFound());
        var wrongType = new MockMultipartFile("file", "statement.xls", "application/vnd.ms-excel", bytes("content"));
        mvc.perform(multipart(path(group)).file(wrongType).header("Authorization", "Bearer " + outsider)).andExpect(status().isNotFound());
        mvc.perform(multipart(path(group)).file(wrongType).header("Authorization", "Bearer " + owner)).andExpect(status().isBadRequest());
    }

    private UUID insertPending(UUID group) {
        UUID id = UUID.randomUUID();
        imports.insert(id, group, uploader(group), "statement.csv", bytes("date,description,amount\n2026-10-01,Food,1"), Instant.now());
        return id;
    }

    private UUID uploader(UUID group) {
        return jdbc.sql("SELECT created_by FROM expense_groups WHERE id = :id").param("id", group).query(UUID.class).single();
    }

    private ImportJob awaitTerminal(UUID id, UUID group) throws InterruptedException {
        for (int attempt = 0; attempt < 200; attempt++) {
            var job = imports.find(id, group).orElseThrow();
            if (job.status() == ImportStatus.COMPLETED || job.status() == ImportStatus.FAILED) { return job; }
            Thread.sleep(50);
        }
        throw new AssertionError("Import did not finish within ten seconds");
    }

    private UUID createGroup(String token) throws Exception {
        return UUID.fromString(post("/api/v1/groups", Map.of("name", "Import group"), token, 201).get("id").asText());
    }

    private ExpenseDraft draft() { return new ExpenseDraft(new BigDecimal("10.00"), "Food", Category.FOOD, LocalDate.of(2026, 10, 1)); }
    private String path(UUID group) { return "/api/v1/groups/" + group + "/imports"; }
    private String email() { return "import-" + UUID.randomUUID() + "@example.com"; }
    private byte[] bytes(String value) { return value.getBytes(StandardCharsets.UTF_8); }
}
