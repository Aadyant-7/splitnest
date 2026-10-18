package com.splitnest.importjob;

import java.time.Instant;
import java.util.UUID;

public record ImportResponse(UUID id, ImportStatus status, String fileName, int totalRows,
        int importedRows, int invalidRows, String errorMessage,
        Instant createdAt, Instant startedAt, Instant completedAt) { }
