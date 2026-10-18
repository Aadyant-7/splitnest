package com.splitnest.expense;

import com.splitnest.expense.ExpenseDtos.SplitResponse;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.Comparator;
import java.util.List;
import java.util.UUID;
import java.util.stream.IntStream;
import org.springframework.stereotype.Component;

@Component
public class EqualSplitCalculator {
    public List<SplitResponse> split(BigDecimal amount, List<UUID> members) {
        if (amount == null || amount.signum() <= 0 || amount.compareTo(new BigDecimal("9999999999.99")) > 0
                || amount.scale() > 2) {
            throw new IllegalArgumentException("Amount must be positive with at most two decimal places and fit NUMERIC(12,2)");
        }
        if (members == null || members.isEmpty() || members.stream().anyMatch(java.util.Objects::isNull)
                || members.stream().distinct().count() != members.size()) {
            throw new IllegalArgumentException("A split requires distinct non-null members");
        }
        // Java's UUID natural ordering uses signed longs; canonical text ordering matches the documented rule.
        var ordered = members.stream().sorted(Comparator.comparing(UUID::toString)).toList();
        long paise = amount.movePointRight(2).setScale(0, RoundingMode.UNNECESSARY).longValueExact();
        long share = paise / ordered.size();
        long remainder = paise % ordered.size();
        return IntStream.range(0, ordered.size())
                .mapToObj(index -> new SplitResponse(ordered.get(index),
                        BigDecimal.valueOf(share + (index < remainder ? 1 : 0), 2)))
                .toList();
    }
}
