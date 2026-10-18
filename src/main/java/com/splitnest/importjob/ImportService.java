package com.splitnest.importjob;

import com.splitnest.common.error.ApiException;
import com.splitnest.common.security.CurrentUser;
import com.splitnest.group.GroupAccessService;
import com.splitnest.group.GroupRepository;
import java.io.IOException;
import java.time.Clock;
import java.util.Locale;
import java.util.Set;
import java.util.UUID;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

@Service
public class ImportService {
    public static final int MAX_FILE_BYTES = 5 * 1024 * 1024;
    private final ImportRepository repository;
    private final GroupAccessService access;
    private final GroupRepository groups;
    private final CurrentUser currentUser;
    private final ApplicationEventPublisher events;
    private final Clock clock;

    public ImportService(ImportRepository repository, GroupAccessService access, GroupRepository groups,
            CurrentUser currentUser, ApplicationEventPublisher events, Clock clock) {
        this.repository = repository;
        this.access = access;
        this.groups = groups;
        this.currentUser = currentUser;
        this.events = events;
        this.clock = clock;
    }

    @Transactional
    public ImportResponse upload(UUID groupId, MultipartFile file) {
        groups.lockGroup(groupId);
        access.requireMember(groupId);
        if (file.isEmpty()) { throw ApiException.badRequest("The statement must not be empty"); }
        if (file.getSize() > MAX_FILE_BYTES) { throw new ApiException(HttpStatus.PAYLOAD_TOO_LARGE, "Statement must be at most 5 MB"); }
        String name = safeName(file.getOriginalFilename());
        String extension = extension(name);
        String contentType = file.getContentType() == null ? "application/octet-stream" : file.getContentType().toLowerCase(Locale.ROOT);
        Set<String> supported = "csv".equals(extension)
                ? Set.of("text/csv", "application/csv", "text/plain", "application/octet-stream")
                : Set.of("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "application/octet-stream");
        if (!Set.of("csv", "xlsx").contains(extension) || !supported.contains(contentType)) {
            throw ApiException.badRequest("Upload a CSV or XLSX statement");
        }
        byte[] content;
        try { content = file.getBytes(); }
        catch (IOException exception) { throw ApiException.badRequest("The statement could not be read"); }
        if (content.length > MAX_FILE_BYTES) { throw new ApiException(HttpStatus.PAYLOAD_TOO_LARGE, "Statement must be at most 5 MB"); }
        UUID id = UUID.randomUUID();
        repository.insert(id, groupId, currentUser.id(), name, content, clock.instant());
        events.publishEvent(new ImportQueued(id));
        return repository.find(id, groupId).orElseThrow().response();
    }

    public ImportResponse get(UUID groupId, UUID jobId) {
        access.requireMember(groupId);
        return repository.find(jobId, groupId).orElseThrow(() -> ApiException.notFound("Import job not found")).response();
    }

    static String extension(String name) {
        int dot = name.lastIndexOf('.');
        return dot < 0 ? "" : name.substring(dot + 1).toLowerCase(Locale.ROOT);
    }

    private String safeName(String original) {
        if (original == null || original.isBlank()) { throw ApiException.badRequest("Statement filename is required"); }
        String name = original.replace('\\', '/');
        name = name.substring(name.lastIndexOf('/') + 1).replaceAll("[\\p{Cntrl}]", "_");
        if (name.length() > 255) { throw ApiException.badRequest("Statement filename is too long"); }
        return name;
    }
}
