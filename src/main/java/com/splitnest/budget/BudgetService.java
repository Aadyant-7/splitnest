package com.splitnest.budget;

import com.splitnest.expense.Category;
import com.splitnest.group.GroupAccessService;
import com.splitnest.group.GroupRepository;
import io.micrometer.core.instrument.MeterRegistry;
import java.time.Clock;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.List;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

@Service
public class BudgetService {
    private static final Logger LOG = LoggerFactory.getLogger(BudgetService.class);
    private final BudgetRepository repository;
    private final GroupAccessService access;
    private final GroupRepository groups;
    private final Clock clock;
    private final MeterRegistry metrics;

    public BudgetService(BudgetRepository repository, GroupAccessService access, GroupRepository groups,
            Clock clock, MeterRegistry metrics) {
        this.repository = repository;
        this.access = access;
        this.groups = groups;
        this.clock = clock;
        this.metrics = metrics;
    }

    @Transactional
    public BudgetResponse set(UUID groupId, Category category, BudgetRequest request) {
        groups.lockGroup(groupId);
        access.requireAdmin(groupId);
        return repository.upsert(groupId, category, request.monthlyLimit());
    }

    public List<BudgetResponse> list(UUID groupId) { access.requireMember(groupId); return repository.list(groupId); }
    public List<BudgetAlertResponse> alerts(UUID groupId) { access.requireMember(groupId); return repository.alerts(groupId); }

    public int checkCurrentMonth() {
        LocalDate month = LocalDate.ofInstant(clock.instant(), ZoneOffset.UTC).withDayOfMonth(1);
        long oversized = repository.oversizedSnapshots(month);
        if (oversized > 0) {
            LOG.error("Cannot persist {} budget alert snapshots: monthly spending exceeds NUMERIC(12,2); a schema range update is required", oversized);
        }
        int created = repository.createAlerts(month, clock.instant());
        if (created > 0) { metrics.counter("splitnest.budget.alerts").increment(created); }
        return created;
    }
}
