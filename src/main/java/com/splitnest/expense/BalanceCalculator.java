package com.splitnest.expense;

import java.util.List;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.cache.annotation.Cacheable;

/** Separate bean so a cache proxy is invoked only after the caller's membership check. */
@Service
public class BalanceCalculator {
    private final ExpenseRepository expenses;

    public BalanceCalculator(ExpenseRepository expenses) { this.expenses = expenses; }

    @Cacheable(cacheNames = "balances", key = "#groupId", condition = "@environment.getProperty('splitnest.cache.enabled', 'true') == 'true'")
    public List<BalanceResponse> calculate(UUID groupId) { return expenses.balances(groupId); }
}
