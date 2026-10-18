package com.splitnest.importjob;

import com.splitnest.expense.ExpenseService;
import java.time.Clock;
import java.time.Duration;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class ImportTransactions {
    private final ImportRepository repository;
    private final ExpenseService expenses;
    private final Clock clock;

    public ImportTransactions(ImportRepository repository, ExpenseService expenses, Clock clock) {
        this.repository = repository;
        this.expenses = expenses;
        this.clock = clock;
    }

    @Transactional
    public Optional<ImportJob> claim(UUID id) { return repository.claim(id, clock.instant()); }

    @Transactional
    public boolean complete(ImportJob job, ParsedStatement statement) {
        var locked = repository.lock(job.id()).orElseThrow();
        // Recovery may already have failed this worker's job while parsing was in progress.
        if (locked.status() != ImportStatus.PROCESSING) { return false; }
        expenses.createImported(job.groupId(), job.uploadedBy(), job.id(), statement.expenses());
        repository.complete(job.id(), statement.totalRows(), statement.expenses().size(), clock.instant());
        return true;
    }

    @Transactional
    public boolean fail(UUID id, int total, String reason) { return repository.fail(id, total, 0, reason, clock.instant()); }

    @Transactional
    public boolean fail(UUID id, int total, int invalid, String reason) {
        return repository.fail(id, total, invalid, reason, clock.instant());
    }

    @Transactional
    public List<ImportJob> recoverStale() {
        return repository.recoverStale(clock.instant().minus(Duration.ofMinutes(10)), clock.instant());
    }
}
