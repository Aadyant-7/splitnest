package com.splitnest.importjob;

import io.micrometer.core.instrument.MeterRegistry;
import java.time.Clock;
import java.time.Duration;
import org.springframework.stereotype.Component;

@Component
public class ImportMetrics {
    private final MeterRegistry registry;
    private final Clock clock;

    public ImportMetrics(MeterRegistry registry, Clock clock) { this.registry = registry; this.clock = clock; }

    void terminal(ImportJob job, String status) {
        registry.counter("splitnest.imports.processed", "status", status).increment();
        Duration elapsed = Duration.between(job.startedAt(), clock.instant());
        registry.timer("splitnest.imports.duration", "status", status).record(elapsed.isNegative() ? Duration.ZERO : elapsed);
    }
}
