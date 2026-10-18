package com.splitnest.expense;

import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Digits;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

public final class ExpenseDtos {
    private ExpenseDtos() {}

    public record CreateExpenseRequest(
            @NotNull @DecimalMin("0.01") @DecimalMax("9999999999.99") @Digits(integer = 10, fraction = 2)
            BigDecimal amount,
            @NotBlank @Size(max = 500) String description,
            @NotNull Category category,
            @NotNull LocalDate expenseDate,
            UUID paidBy) {}

    public record SplitResponse(UUID userId, BigDecimal shareAmount) {}
    public record ExpenseResponse(UUID id, UUID groupId, UUID paidBy, BigDecimal amount,
                                  String description, Category category, LocalDate expenseDate,
                                  UUID createdBy, UUID importJobId, Instant createdAt,
                                  List<SplitResponse> splits) {}
    public record ExpensePage(List<ExpenseResponse> content, int number, int size,
                              long totalElements, long totalPages, boolean first, boolean last) {}
}
