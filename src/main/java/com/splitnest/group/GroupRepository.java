package com.splitnest.group;

import com.splitnest.common.error.ApiException;
import com.splitnest.group.GroupDtos.GroupResponse;
import com.splitnest.group.GroupDtos.GroupSummary;
import com.splitnest.group.GroupDtos.MemberResponse;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

@Repository
public class GroupRepository {
    private final JdbcClient jdbc;

    public GroupRepository(JdbcClient jdbc) { this.jdbc = jdbc; }

    public void create(UUID id, String name, UUID creator, Instant now) {
        jdbc.sql("INSERT INTO expense_groups(id,name,created_by,created_at) VALUES (:id,:name,:creator,:now)")
                .param("id", id).param("name", name).param("creator", creator)
                .param("now", java.sql.Timestamp.from(now)).update();
        addMember(id, creator, GroupRole.ADMIN, now);
    }

    // All membership and financial writes use this lock to agree on one current roster.
    public void lockGroup(UUID groupId) {
        if (jdbc.sql("SELECT id FROM expense_groups WHERE id=:id FOR UPDATE")
                .param("id", groupId).query(UUID.class).optional().isEmpty()) {
            throw ApiException.notFound("Group not found");
        }
    }

    public List<UUID> memberIds(UUID groupId) {
        return jdbc.sql("SELECT user_id FROM group_members WHERE group_id=:id ORDER BY user_id::text")
                .param("id", groupId).query(UUID.class).list();
    }

    public Optional<GroupRole> role(UUID groupId, UUID userId) {
        return jdbc.sql("SELECT role FROM group_members WHERE group_id=:groupId AND user_id=:userId")
                .param("groupId", groupId).param("userId", userId).query(String.class).optional()
                .map(GroupRole::valueOf);
    }

    public Optional<UUID> userByEmail(String email) {
        return jdbc.sql("SELECT id FROM users WHERE email=:email").param("email", email)
                .query(UUID.class).optional();
    }

    public void addMember(UUID groupId, UUID userId, GroupRole role, Instant now) {
        jdbc.sql("INSERT INTO group_members(group_id,user_id,role,joined_at) VALUES (:groupId,:userId,:role,:now)")
                .param("groupId", groupId).param("userId", userId).param("role", role.name())
                .param("now", java.sql.Timestamp.from(now)).update();
    }

    public long adminCount(UUID groupId) {
        return jdbc.sql("SELECT count(*) FROM group_members WHERE group_id=:id AND role='ADMIN'")
                .param("id", groupId).query(Long.class).single();
    }

    public void removeMember(UUID groupId, UUID userId) {
        jdbc.sql("DELETE FROM group_members WHERE group_id=:groupId AND user_id=:userId")
                .param("groupId", groupId).param("userId", userId).update();
    }

    public List<GroupSummary> findForUser(UUID userId) {
        return jdbc.sql("""
                SELECT g.id,g.name,g.created_by,g.created_at,m.role
                FROM expense_groups g JOIN group_members m ON m.group_id=g.id
                WHERE m.user_id=:id ORDER BY g.created_at DESC,g.id DESC
                """).param("id", userId).query((rs, row) -> new GroupSummary(rs.getObject("id", UUID.class),
                rs.getString("name"), rs.getObject("created_by", UUID.class), instant(rs, "created_at"),
                GroupRole.valueOf(rs.getString("role")))).list();
    }

    public GroupResponse find(UUID groupId) {
        var members = members(groupId);
        return jdbc.sql("SELECT id,name,created_by,created_at FROM expense_groups WHERE id=:id")
                .param("id", groupId).query((rs, row) -> new GroupResponse(rs.getObject("id", UUID.class),
                        rs.getString("name"), rs.getObject("created_by", UUID.class),
                        instant(rs, "created_at"), members))
                .optional().orElseThrow(() -> ApiException.notFound("Group not found"));
    }

    public List<MemberResponse> members(UUID groupId) {
        return jdbc.sql("""
                SELECT m.user_id,u.email,u.display_name,m.role,m.joined_at
                FROM group_members m JOIN users u ON u.id=m.user_id
                WHERE m.group_id=:id ORDER BY m.user_id::text
                """).param("id", groupId).query((rs, row) -> new MemberResponse(
                rs.getObject("user_id", UUID.class), rs.getString("email"), rs.getString("display_name"),
                GroupRole.valueOf(rs.getString("role")), instant(rs, "joined_at"))).list();
    }

    private static Instant instant(ResultSet rs, String column) throws SQLException {
        return rs.getTimestamp(column).toInstant();
    }
}
