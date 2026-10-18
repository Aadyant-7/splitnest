package com.splitnest.group;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

public final class GroupDtos {
    private GroupDtos() {}

    public record CreateGroupRequest(@NotBlank @Size(max = 120) String name) {}
    public record AddMemberRequest(@NotBlank @Email @Size(max = 320) String email) {}
    public record GroupSummary(UUID id, String name, UUID createdBy, Instant createdAt, GroupRole role) {}
    public record GroupResponse(UUID id, String name, UUID createdBy, Instant createdAt,
                                List<MemberResponse> members) {}
    public record MemberResponse(UUID userId, String email, String displayName, GroupRole role,
                                 Instant joinedAt) {}
}
