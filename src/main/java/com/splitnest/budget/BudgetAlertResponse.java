package com.splitnest.budget;

import com.splitnest.expense.Category;
import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

public record BudgetAlertResponse(UUID id, Category category, LocalDate month, BigDecimal spent,
        BigDecimal monthlyLimit, Instant createdAt) { }
