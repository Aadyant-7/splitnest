package com.splitnest.importjob;

import java.time.Instant;
import java.util.UUID;

record ImportJob(UUID id, UUID groupId, UUID uploadedBy, ImportStatus status, String fileName,
        byte[] content, int totalRows, int importedRows, int invalidRows, String errorMessage,
        Instant createdAt, Instant startedAt, Instant completedAt) {
    ImportResponse response() {
        return new ImportResponse(id, status, fileName, totalRows, importedRows,
                invalidRows, errorMessage, createdAt, startedAt, completedAt);
    }
}
