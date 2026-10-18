package com.splitnest.budget;

import com.splitnest.expense.Category;
import java.math.BigDecimal;
import java.util.UUID;

public record BudgetResponse(UUID id, UUID groupId, Category category, BigDecimal monthlyLimit) { }
