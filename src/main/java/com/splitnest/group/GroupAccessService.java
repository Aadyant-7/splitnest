package com.splitnest.group;

import com.splitnest.common.error.ApiException;
import com.splitnest.common.security.CurrentUser;
import java.util.UUID;
import org.springframework.stereotype.Service;

@Service
public class GroupAccessService {
    private final GroupRepository groups;
    private final CurrentUser currentUser;

    public GroupAccessService(GroupRepository groups, CurrentUser currentUser) {
        this.groups = groups;
        this.currentUser = currentUser;
    }

    public void requireMember(UUID groupId) { requireMember(groupId, currentUser.id()); }

    public void requireMember(UUID groupId, UUID userId) {
        groups.role(groupId, userId).orElseThrow(() -> ApiException.notFound("Group not found"));
    }

    public void requireAdmin(UUID groupId) { requireAdmin(groupId, currentUser.id()); }

    public void requireAdmin(UUID groupId, UUID userId) {
        var role = groups.role(groupId, userId).orElseThrow(() -> ApiException.notFound("Group not found"));
        if (role != GroupRole.ADMIN) {
            throw ApiException.forbidden("Group administrator access is required");
        }
    }

    public boolean isAdmin(UUID groupId, UUID userId) {
        return groups.role(groupId, userId).filter(role -> role == GroupRole.ADMIN).isPresent();
    }
}
