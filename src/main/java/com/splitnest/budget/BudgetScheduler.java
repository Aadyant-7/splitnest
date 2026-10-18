package com.splitnest.budget;

import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import net.javacrumbs.shedlock.spring.annotation.SchedulerLock;

@Component
public class BudgetScheduler {
    private final BudgetService budgets;

    public BudgetScheduler(BudgetService budgets) { this.budgets = budgets; }

    @Scheduled(cron = "${splitnest.budgets.cron:0 0 0 * * *}", zone = "UTC")
    @SchedulerLock(name = "budget-check", lockAtMostFor = "PT10M", lockAtLeastFor = "PT1S")
    public void checkBudgets() { budgets.checkCurrentMonth(); }
}
