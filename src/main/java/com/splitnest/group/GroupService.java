package com.splitnest.group;

import com.splitnest.common.error.ApiException;
import com.splitnest.common.security.CurrentUser;
import com.splitnest.expense.ExpenseChanged;
import com.splitnest.group.GroupDtos.CreateGroupRequest;
import com.splitnest.group.GroupDtos.GroupResponse;
import com.splitnest.group.GroupDtos.GroupSummary;
import com.splitnest.group.GroupDtos.MemberResponse;
import java.time.Clock;
import java.util.List;
import java.util.Locale;
import java.util.UUID;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class GroupService {
    private final GroupRepository groups;
    private final GroupAccessService access;
    private final CurrentUser currentUser;
    private final Clock clock;
    private final ApplicationEventPublisher events;

    public GroupService(GroupRepository groups, GroupAccessService access, CurrentUser currentUser,
                        Clock clock, ApplicationEventPublisher events) {
        this.groups = groups;
        this.access = access;
        this.currentUser = currentUser;
        this.clock = clock;
        this.events = events;
    }

    @Transactional
    public GroupResponse create(CreateGroupRequest request) {
        UUID id = UUID.randomUUID();
        groups.create(id, request.name().strip(), currentUser.id(), clock.instant());
        return groups.find(id);
    }

    @Transactional(readOnly = true)
    public List<GroupSummary> list() { return groups.findForUser(currentUser.id()); }

    @Transactional(readOnly = true)
    public GroupResponse get(UUID groupId) {
        access.requireMember(groupId);
        return groups.find(groupId);
    }

    @Transactional
    public MemberResponse addMember(UUID groupId, String email) {
        groups.lockGroup(groupId);
        access.requireAdmin(groupId);
        UUID userId = groups.userByEmail(email.strip().toLowerCase(Locale.ROOT))
                .orElseThrow(() -> ApiException.notFound("User not found"));
        if (groups.role(groupId, userId).isPresent()) {
            throw ApiException.conflict("User is already a member of this group");
        }
        groups.addMember(groupId, userId, GroupRole.MEMBER, clock.instant());
        events.publishEvent(new ExpenseChanged(groupId));
        return groups.members(groupId).stream().filter(member -> member.userId().equals(userId)).findFirst().orElseThrow();
    }

    @Transactional
    public void removeMember(UUID groupId, UUID userId) {
        groups.lockGroup(groupId);
        access.requireAdmin(groupId);
        GroupRole role = groups.role(groupId, userId)
                .orElseThrow(() -> ApiException.notFound("Group member not found"));
        if (role == GroupRole.ADMIN && groups.adminCount(groupId) == 1) {
            throw ApiException.conflict("The last administrator cannot be removed");
        }
        // Only current membership is deleted; paid amounts and split snapshots remain intact.
        groups.removeMember(groupId, userId);
        events.publishEvent(new ExpenseChanged(groupId));
    }
}
