package com.splitnest.importjob;

import java.util.List;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;

@Service
public class ImportWorker {
    private static final Logger LOG = LoggerFactory.getLogger(ImportWorker.class);
    private final ImportTransactions transactions;
    private final List<StatementParser> parsers;
    private final ImportMetrics metrics;

    public ImportWorker(ImportTransactions transactions, List<StatementParser> parsers, ImportMetrics metrics) {
        this.transactions = transactions;
        this.parsers = parsers;
        this.metrics = metrics;
    }

    @Async("importExecutor")
    public void process(UUID id) {
        var claimed = transactions.claim(id);
        if (claimed.isEmpty()) { return; }
        var job = claimed.get();
        int total = 0;
        int invalid = 0;
        try {
            var parser = parsers.stream().filter(candidate -> candidate.supports(ImportService.extension(job.fileName())))
                    .findFirst().orElseThrow(() -> new StatementParseException("Unsupported statement type"));
            // Parsing holds no database transaction or group lock.
            var statement = parser.parse(job.content());
            total = statement.totalRows();
            invalid = statement.invalidRows();
            if (statement.expenses().isEmpty()) { throw new StatementParseException("Statement contains no valid expense rows"); }
            if (transactions.complete(job, statement)) { metrics.terminal(job, "COMPLETED"); }
        } catch (StatementParseException exception) {
            if (transactions.fail(id, total, invalid, exception.getMessage())) { metrics.terminal(job, "FAILED"); }
        } catch (RuntimeException exception) {
            // Driver/parser exceptions can contain uploaded data, so retain only a safe public reason.
            LOG.warn("Import {} failed during persistence or parsing", id);
            if (transactions.fail(id, total, invalid, "Import could not be saved; verify membership and upload again")) {
                metrics.terminal(job, "FAILED");
            }
        }
    }
}
