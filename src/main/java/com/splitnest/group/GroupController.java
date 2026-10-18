package com.splitnest.group;

import com.splitnest.group.GroupDtos.AddMemberRequest;
import com.splitnest.group.GroupDtos.CreateGroupRequest;
import com.splitnest.group.GroupDtos.GroupResponse;
import com.splitnest.group.GroupDtos.GroupSummary;
import com.splitnest.group.GroupDtos.MemberResponse;
import jakarta.validation.Valid;
import java.net.URI;
import java.util.List;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/groups")
public class GroupController {
    private final GroupService groups;

    public GroupController(GroupService groups) { this.groups = groups; }

    @PostMapping
    public ResponseEntity<GroupResponse> create(@Valid @RequestBody CreateGroupRequest request) {
        var response = groups.create(request);
        return ResponseEntity.created(URI.create("/api/v1/groups/" + response.id())).body(response);
    }

    @GetMapping
    public List<GroupSummary> list() { return groups.list(); }

    @GetMapping("/{groupId}")
    public GroupResponse get(@PathVariable UUID groupId) { return groups.get(groupId); }

    @PostMapping("/{groupId}/members")
    @ResponseStatus(HttpStatus.CREATED)
    public MemberResponse addMember(@PathVariable UUID groupId, @Valid @RequestBody AddMemberRequest request) {
        return groups.addMember(groupId, request.email());
    }

    @DeleteMapping("/{groupId}/members/{userId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void removeMember(@PathVariable UUID groupId, @PathVariable UUID userId) {
        groups.removeMember(groupId, userId);
    }
}
