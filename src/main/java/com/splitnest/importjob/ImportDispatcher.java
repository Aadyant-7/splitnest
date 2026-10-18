package com.splitnest.importjob;

import java.util.UUID;
import java.util.concurrent.RejectedExecutionException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;

@Component
public class ImportDispatcher {
    private static final Logger LOG = LoggerFactory.getLogger(ImportDispatcher.class);
    private final ImportRepository repository;
    private final ImportWorker worker;

    public ImportDispatcher(ImportRepository repository, ImportWorker worker) { this.repository = repository; this.worker = worker; }

    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    public void uploaded(ImportQueued event) { submit(event.jobId()); }

    @Scheduled(fixedDelayString = "${splitnest.imports.dispatch-delay:15000}")
    public void dispatchPending() { repository.pending().forEach(this::submit); }

    private void submit(UUID id) {
        try { worker.process(id); }
        catch (RejectedExecutionException exception) {
            // The committed PENDING row survives overload; the dispatcher will try it later.
            LOG.info("Import {} remains pending because the worker queue is full", id);
        }
    }
}
