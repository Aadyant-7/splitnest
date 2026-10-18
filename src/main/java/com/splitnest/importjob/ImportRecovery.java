package com.splitnest.importjob;

import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

@Component
public class ImportRecovery {
    private final ImportTransactions transactions;
    private final ImportMetrics metrics;

    public ImportRecovery(ImportTransactions transactions, ImportMetrics metrics) { this.transactions = transactions; this.metrics = metrics; }

    @EventListener(ApplicationReadyEvent.class)
    @Scheduled(fixedDelayString = "${splitnest.imports.recovery-delay:60000}")
    public void recover() { transactions.recoverStale().forEach(job -> metrics.terminal(job, "FAILED")); }
}
