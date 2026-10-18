package com.splitnest.importjob;

import com.splitnest.common.security.CurrentUser;
import com.splitnest.group.GroupAccessService;
import com.splitnest.ratelimit.RateLimiter;
import java.net.URI;
import java.util.UUID;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

@RestController
@RequestMapping("/api/v1/groups/{groupId}/imports")
public class ImportController {
    private final ImportService service;
    private final GroupAccessService access;
    private final RateLimiter limiter;
    private final CurrentUser currentUser;

    public ImportController(ImportService service, GroupAccessService access, RateLimiter limiter, CurrentUser currentUser) {
        this.service = service;
        this.access = access;
        this.limiter = limiter;
        this.currentUser = currentUser;
    }

    @PostMapping(consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<ImportResponse> upload(@PathVariable UUID groupId, @RequestParam("file") MultipartFile file) {
        access.requireMember(groupId);
        limiter.checkImport(currentUser.id());
        var response = service.upload(groupId, file);
        return ResponseEntity.accepted().location(URI.create("/api/v1/groups/" + groupId + "/imports/" + response.id())).body(response);
    }

    @GetMapping("/{jobId}")
    public ImportResponse get(@PathVariable UUID groupId, @PathVariable UUID jobId) { return service.get(groupId, jobId); }
}
