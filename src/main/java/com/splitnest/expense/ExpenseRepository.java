package com.splitnest.expense;

import com.splitnest.common.error.ApiException;
import com.splitnest.expense.ExpenseDtos.ExpenseResponse;
import com.splitnest.expense.ExpenseDtos.SplitResponse;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Types;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

@Repository
public class ExpenseRepository {
    private final JdbcClient jdbc;

    public ExpenseRepository(JdbcClient jdbc) { this.jdbc = jdbc; }

    public void insert(UUID id, UUID groupId, UUID paidBy, ExpenseDraft draft, UUID createdBy,
                       UUID importJobId, Instant now, List<SplitResponse> splits) {
        jdbc.sql("""
                INSERT INTO expenses(id,group_id,paid_by,amount,description,category,expense_date,
                                     created_by,import_job_id,created_at)
                VALUES (:id,:groupId,:paidBy,:amount,:description,:category,:date,:createdBy,:importJobId,:now)
                """).param("id", id).param("groupId", groupId).param("paidBy", paidBy)
                .param("amount", draft.amount()).param("description", draft.description().strip())
                .param("category", draft.category().name()).param("date", draft.expenseDate())
                .param("createdBy", createdBy).param("importJobId", importJobId, Types.OTHER)
                .param("now", java.sql.Timestamp.from(now)).update();
        for (var split : splits) {
            jdbc.sql("INSERT INTO expense_splits(expense_id,user_id,share_amount) VALUES (:expenseId,:userId,:amount)")
                    .param("expenseId", id).param("userId", split.userId()).param("amount", split.shareAmount()).update();
        }
    }

    public ExpenseResponse find(UUID groupId, UUID expenseId) {
        var row = jdbc.sql("SELECT * FROM expenses WHERE group_id=:groupId AND id=:id")
                .param("groupId", groupId).param("id", expenseId).query(ExpenseRepository::row)
                .optional().orElseThrow(() -> ApiException.notFound("Expense not found"));
        return response(row, splits(List.of(expenseId)).getOrDefault(expenseId, List.of()));
    }

    public long count(UUID groupId) {
        return jdbc.sql("SELECT count(*) FROM expenses WHERE group_id=:id").param("id", groupId)
                .query(Long.class).single();
    }

    public List<ExpenseResponse> page(UUID groupId, int page, int size) {
        var rows = jdbc.sql("""
                SELECT * FROM expenses WHERE group_id=:groupId
                ORDER BY created_at DESC,id DESC LIMIT :size OFFSET :offset
                """).param("groupId", groupId).param("size", size).param("offset", (long) page * size)
                .query(ExpenseRepository::row).list();
        if (rows.isEmpty()) { return List.of(); }
        var byExpense = splits(rows.stream().map(ExpenseRow::id).toList());
        return rows.stream().map(row -> response(row, byExpense.getOrDefault(row.id(), List.of()))).toList();
    }

    public void delete(UUID groupId, UUID expenseId) {
        jdbc.sql("DELETE FROM expenses WHERE group_id=:groupId AND id=:id")
                .param("groupId", groupId).param("id", expenseId).update();
    }

    public List<BalanceResponse> balances(UUID groupId) {
        // Aggregate payments and shares separately: joining raw payments to splits would multiply amounts.
        return jdbc.sql("""
                WITH paid AS (
                    SELECT paid_by AS user_id,sum(amount) AS total_paid
                    FROM expenses WHERE group_id=:groupId GROUP BY paid_by
                ), shared AS (
                    SELECT s.user_id,sum(s.share_amount) AS total_share
                    FROM expense_splits s JOIN expenses e ON e.id=s.expense_id
                    WHERE e.group_id=:groupId GROUP BY s.user_id
                ), participants AS (
                    SELECT user_id FROM group_members WHERE group_id=:groupId
                    UNION SELECT user_id FROM paid
                    UNION SELECT user_id FROM shared
                )
                SELECT u.id,u.display_name,
                       EXISTS(SELECT 1 FROM group_members m WHERE m.group_id=:groupId AND m.user_id=u.id) AS current_member,
                       coalesce(p.total_paid,0.00) AS total_paid,
                       coalesce(s.total_share,0.00) AS total_share,
                       coalesce(p.total_paid,0.00)-coalesce(s.total_share,0.00) AS net_balance
                FROM participants participants JOIN users u ON u.id=participants.user_id
                LEFT JOIN paid p ON p.user_id=u.id LEFT JOIN shared s ON s.user_id=u.id
                ORDER BY u.id::text
                """).param("groupId", groupId).query((rs, row) -> new BalanceResponse(
                rs.getObject("id", UUID.class), rs.getString("display_name"), rs.getBoolean("current_member"),
                rs.getBigDecimal("total_paid"), rs.getBigDecimal("total_share"), rs.getBigDecimal("net_balance"))).list();
    }

    private Map<UUID, List<SplitResponse>> splits(List<UUID> expenseIds) {
        Map<UUID, List<SplitResponse>> splits = new HashMap<>();
        jdbc.sql("SELECT expense_id,user_id,share_amount FROM expense_splits WHERE expense_id IN (:ids) ORDER BY user_id::text")
                .param("ids", expenseIds).query((rs, row) -> new SplitRow(rs.getObject("expense_id", UUID.class),
                        new SplitResponse(rs.getObject("user_id", UUID.class), rs.getBigDecimal("share_amount"))))
                .list().forEach(row -> splits.computeIfAbsent(row.expenseId(), ignored -> new ArrayList<>()).add(row.split()));
        splits.replaceAll((id, values) -> List.copyOf(values));
        return splits;
    }

    private static ExpenseRow row(ResultSet rs, int row) throws SQLException {
        return new ExpenseRow(rs.getObject("id", UUID.class), rs.getObject("group_id", UUID.class),
                rs.getObject("paid_by", UUID.class), rs.getBigDecimal("amount"), rs.getString("description"),
                Category.valueOf(rs.getString("category")), rs.getObject("expense_date", LocalDate.class),
                rs.getObject("created_by", UUID.class), rs.getObject("import_job_id", UUID.class),
                rs.getTimestamp("created_at").toInstant());
    }

    private static ExpenseResponse response(ExpenseRow row, List<SplitResponse> splits) {
        return new ExpenseResponse(row.id(), row.groupId(), row.paidBy(), row.amount(), row.description(),
                row.category(), row.expenseDate(), row.createdBy(), row.importJobId(), row.createdAt(), splits);
    }

    private record ExpenseRow(UUID id, UUID groupId, UUID paidBy, java.math.BigDecimal amount,
                              String description, Category category, LocalDate expenseDate,
                              UUID createdBy, UUID importJobId, Instant createdAt) {}
    private record SplitRow(UUID expenseId, SplitResponse split) {}
}
