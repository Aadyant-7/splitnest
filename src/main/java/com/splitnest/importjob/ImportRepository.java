package com.splitnest.importjob;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

@Repository
public class ImportRepository {
    private static final RowMapper<ImportJob> MAPPER = (rs, number) -> new ImportJob(
            rs.getObject("id", UUID.class), rs.getObject("group_id", UUID.class),
            rs.getObject("uploaded_by", UUID.class), ImportStatus.valueOf(rs.getString("status")),
            rs.getString("file_name"), rs.getBytes("file_content"), rs.getInt("total_rows"),
            rs.getInt("imported_rows"), rs.getInt("invalid_rows"), rs.getString("error_message"),
            instant(rs, "created_at"), instant(rs, "started_at"), instant(rs, "completed_at"));
    private final JdbcClient jdbc;

    public ImportRepository(JdbcClient jdbc) { this.jdbc = jdbc; }

    public void insert(UUID id, UUID groupId, UUID userId, String fileName, byte[] content, Instant now) {
        jdbc.sql("""
                INSERT INTO import_jobs(id, group_id, uploaded_by, status, file_name, file_content, created_at)
                VALUES (:id, :group, :user, 'PENDING', :name, :content, :now)
                """).param("id", id).param("group", groupId).param("user", userId).param("name", fileName)
                .param("content", content).param("now", Timestamp.from(now)).update();
    }

    public Optional<ImportJob> find(UUID id, UUID groupId) {
        return jdbc.sql("SELECT * FROM import_jobs WHERE id = :id AND group_id = :group")
                .param("id", id).param("group", groupId).query(MAPPER).optional();
    }

    public Optional<ImportJob> lock(UUID id) {
        return jdbc.sql("SELECT * FROM import_jobs WHERE id = :id FOR UPDATE")
                .param("id", id).query(MAPPER).optional();
    }

    public Optional<ImportJob> claim(UUID id, Instant now) {
        return jdbc.sql("""
                UPDATE import_jobs SET status = 'PROCESSING', started_at = :now
                WHERE id = :id AND status = 'PENDING' RETURNING *
                """).param("id", id).param("now", Timestamp.from(now)).query(MAPPER).optional();
    }

    public List<UUID> pending() {
        return jdbc.sql("SELECT id FROM import_jobs WHERE status = 'PENDING' ORDER BY created_at, id LIMIT 20")
                .query(UUID.class).list();
    }

    public void complete(UUID id, int total, int imported, Instant now) {
        jdbc.sql("""
                UPDATE import_jobs SET status = 'COMPLETED', total_rows = :total, imported_rows = :imported,
                    invalid_rows = :total - :imported,
                    completed_at = :now, file_content = ''::bytea WHERE id = :id AND status = 'PROCESSING'
                """).param("total", total).param("imported", imported).param("now", Timestamp.from(now)).param("id", id).update();
    }

    public boolean fail(UUID id, int total, int invalid, String reason, Instant now) {
        return jdbc.sql("""
                UPDATE import_jobs SET status = 'FAILED', total_rows = :total, imported_rows = 0,
                    invalid_rows = :invalid,
                    error_message = :reason, completed_at = :now, file_content = ''::bytea
                WHERE id = :id AND status = 'PROCESSING'
                """).param("total", total).param("invalid", invalid).param("reason", reason)
                .param("now", Timestamp.from(now)).param("id", id).update() == 1;
    }

    public List<ImportJob> recoverStale(Instant cutoff, Instant now) {
        return jdbc.sql("""
                UPDATE import_jobs SET status = 'FAILED', error_message = 'Processing exceeded ten minutes; upload again',
                    completed_at = :now, file_content = ''::bytea
                WHERE status = 'PROCESSING' AND started_at < :cutoff RETURNING *
                """).param("now", Timestamp.from(now)).param("cutoff", Timestamp.from(cutoff)).query(MAPPER).list();
    }

    private static Instant instant(ResultSet rs, String column) throws SQLException {
        var value = rs.getTimestamp(column);
        return value == null ? null : value.toInstant();
    }
}
