package com.splitnest.expense;

import com.splitnest.common.error.ApiException;
import com.splitnest.common.security.CurrentUser;
import com.splitnest.expense.ExpenseDtos.CreateExpenseRequest;
import com.splitnest.expense.ExpenseDtos.ExpensePage;
import com.splitnest.expense.ExpenseDtos.ExpenseResponse;
import com.splitnest.group.GroupAccessService;
import com.splitnest.group.GroupRepository;
import java.time.Clock;
import java.util.List;
import java.util.UUID;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;

@Service
public class ExpenseService {
    private final ExpenseRepository expenses;
    private final GroupRepository groups;
    private final GroupAccessService access;
    private final CurrentUser currentUser;
    private final EqualSplitCalculator splitter;
    private final Clock clock;
    private final ApplicationEventPublisher events;

    public ExpenseService(ExpenseRepository expenses, GroupRepository groups, GroupAccessService access,
                          CurrentUser currentUser, EqualSplitCalculator splitter, Clock clock,
                          ApplicationEventPublisher events) {
        this.expenses = expenses;
        this.groups = groups;
        this.access = access;
        this.currentUser = currentUser;
        this.splitter = splitter;
        this.clock = clock;
        this.events = events;
    }

    @Transactional
    public ExpenseResponse create(UUID groupId, CreateExpenseRequest request) {
        groups.lockGroup(groupId);
        UUID userId = currentUser.id();
        access.requireMember(groupId, userId);
        UUID paidBy = request.paidBy() == null ? userId : request.paidBy();
        access.requireMember(groupId, paidBy);
        UUID expenseId = UUID.randomUUID();
        var draft = new ExpenseDraft(request.amount(), request.description(), request.category(), request.expenseDate());
        validateDraft(draft);
        expenses.insert(expenseId, groupId, paidBy, draft, userId, null, clock.instant(),
                splitter.split(request.amount(), groups.memberIds(groupId)));
        events.publishEvent(new ExpenseChanged(groupId));
        return expenses.find(groupId, expenseId);
    }

    @Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
    public ExpensePage list(UUID groupId, int page, int size) {
        access.requireMember(groupId);
        if (page < 0 || size < 1 || size > 100) {
            throw ApiException.badRequest("Page must be nonnegative and size must be between 1 and 100");
        }
        long total = expenses.count(groupId);
        long totalPages = (total + size - 1) / size;
        return new ExpensePage(expenses.page(groupId, page, size), page, size, total, totalPages,
                page == 0, (long) page + 1 >= totalPages);
    }

    @Transactional
    public void delete(UUID groupId, UUID expenseId) {
        groups.lockGroup(groupId);
        UUID userId = currentUser.id();
        access.requireMember(groupId, userId);
        var expense = expenses.find(groupId, expenseId);
        if (!expense.createdBy().equals(userId) && !access.isAdmin(groupId, userId)) {
            throw ApiException.forbidden("Only the expense creator or a group administrator can delete this expense");
        }
        expenses.delete(groupId, expenseId);
        events.publishEvent(new ExpenseChanged(groupId));
    }

    @Transactional
    public void createImported(UUID groupId, UUID userId, UUID importJobId, List<ExpenseDraft> rows) {
        groups.lockGroup(groupId);
        access.requireMember(groupId, userId);
        var roster = groups.memberIds(groupId);
        var now = clock.instant();
        for (var draft : rows) {
            validateDraft(draft);
            expenses.insert(UUID.randomUUID(), groupId, userId, draft, userId, importJobId, now,
                    splitter.split(draft.amount(), roster));
        }
        if (!rows.isEmpty()) { events.publishEvent(new ExpenseChanged(groupId)); }
    }

    private static void validateDraft(ExpenseDraft draft) {
        if (draft == null || draft.amount() == null || draft.amount().scale() > 2
                || draft.amount().signum() <= 0 || draft.amount().compareTo(new java.math.BigDecimal("9999999999.99")) > 0
                || draft.description() == null || draft.description().isBlank() || draft.description().length() > 500
                || draft.category() == null || draft.expenseDate() == null
                || draft.expenseDate().getYear() < 1 || draft.expenseDate().getYear() > 9999) {
            throw ApiException.badRequest("Invalid expense: use a positive INR amount with at most two decimals, a description up to 500 characters, category and a date in years 0001-9999");
        }
    }
}
