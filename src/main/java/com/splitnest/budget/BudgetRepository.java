package com.splitnest.budget;

import com.splitnest.expense.Category;
import java.math.BigDecimal;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

@Repository
public class BudgetRepository {
    private static final RowMapper<BudgetResponse> MAPPER = (rs, number) -> new BudgetResponse(
            rs.getObject("id", UUID.class), rs.getObject("group_id", UUID.class),
            Category.valueOf(rs.getString("category")), rs.getBigDecimal("monthly_limit"));
    private final JdbcClient jdbc;

    public BudgetRepository(JdbcClient jdbc) { this.jdbc = jdbc; }

    public BudgetResponse upsert(UUID groupId, Category category, BigDecimal limit) {
        return jdbc.sql("""
                INSERT INTO budgets(id, group_id, category, monthly_limit) VALUES (:id, :group, :category, :limit)
                ON CONFLICT (group_id, category) DO UPDATE SET monthly_limit = EXCLUDED.monthly_limit RETURNING *
                """).param("id", UUID.randomUUID()).param("group", groupId).param("category", category.name())
                .param("limit", limit).query(MAPPER).single();
    }

    public List<BudgetResponse> list(UUID groupId) {
        return jdbc.sql("SELECT * FROM budgets WHERE group_id = :group ORDER BY category")
                .param("group", groupId).query(MAPPER).list();
    }

    public List<BudgetAlertResponse> alerts(UUID groupId) {
        return jdbc.sql("SELECT * FROM budget_alerts WHERE group_id = :group ORDER BY month DESC, category")
                .param("group", groupId).query((rs, number) -> new BudgetAlertResponse(rs.getObject("id", UUID.class),
                        Category.valueOf(rs.getString("category")), rs.getObject("month", LocalDate.class),
                        rs.getBigDecimal("spent"), rs.getBigDecimal("monthly_limit"), rs.getTimestamp("created_at").toInstant())).list();
    }

    public int createAlerts(LocalDate month, Instant now) {
        // PostgreSQL resolves concurrent inserts without putting the transaction into a failed state.
        return jdbc.sql("""
                INSERT INTO budget_alerts(id, group_id, category, month, spent, monthly_limit, created_at)
                SELECT gen_random_uuid(), b.group_id, b.category, :month, s.spent, b.monthly_limit, :now
                FROM budgets b JOIN (
                    SELECT group_id, category, SUM(amount) AS spent FROM expenses
                    WHERE expense_date >= :month AND expense_date < :nextMonth GROUP BY group_id, category
                ) s ON s.group_id = b.group_id AND s.category = b.category
                WHERE s.spent > b.monthly_limit AND s.spent <= 9999999999.99
                ON CONFLICT (group_id, category, month) DO NOTHING
                """).param("month", month).param("nextMonth", month.plusMonths(1)).param("now", Timestamp.from(now)).update();
    }

    public long oversizedSnapshots(LocalDate month) {
        return jdbc.sql("""
                SELECT COUNT(*) FROM (
                    SELECT e.group_id, e.category FROM expenses e
                    JOIN budgets b ON b.group_id = e.group_id AND b.category = e.category
                    WHERE e.expense_date >= :month AND e.expense_date < :nextMonth
                    GROUP BY e.group_id, e.category HAVING SUM(e.amount) > 9999999999.99
                ) oversized
                """).param("month", month).param("nextMonth", month.plusMonths(1)).query(Long.class).single();
    }
}
