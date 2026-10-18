package com.splitnest.importjob;

import com.splitnest.expense.Category;
import com.splitnest.expense.ExpenseDraft;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.format.DateTimeParseException;
import java.util.Locale;
import java.util.Optional;
import org.springframework.stereotype.Component;

@Component
public class StatementRows {
    private final ImportProperties properties;

    public StatementRows(ImportProperties properties) { this.properties = properties; }

    public Optional<ExpenseDraft> parse(String date, String description, String amount) {
        description = description.strip();
        amount = amount.strip();
        date = date.strip();
        if (description.isBlank() || description.length() > 500 ||
                !date.matches("[0-9]{4}-[0-9]{2}-[0-9]{2}") ||
                !amount.matches("[0-9]{1,10}(\\.[0-9]{1,2})?")) {
            return Optional.empty();
        }
        try {
            var value = new BigDecimal(amount).setScale(2);
            if (value.signum() <= 0) { return Optional.empty(); }
            var parsedDate = LocalDate.parse(date);
            if (parsedDate.getYear() < 1) { return Optional.empty(); }
            return Optional.of(new ExpenseDraft(value, description, category(description), parsedDate));
        } catch (DateTimeParseException | NumberFormatException exception) {
            return Optional.empty();
        }
    }

    public Category category(String description) {
        String normalized = description.toUpperCase(Locale.ROOT);
        // Enum order makes overlapping keyword rules deterministic across restarts.
        for (Category category : Category.values()) {
            for (String keyword : properties.getKeywords().getOrDefault(category, java.util.List.of())) {
                if (!keyword.isBlank() && normalized.contains(keyword.toUpperCase(Locale.ROOT))) { return category; }
            }
        }
        return Category.OTHER;
    }
}
