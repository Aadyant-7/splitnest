package com.splitnest.expense;

import java.math.BigDecimal;
import java.time.LocalDate;

public record ExpenseDraft(BigDecimal amount, String description, Category category, LocalDate expenseDate) {}
