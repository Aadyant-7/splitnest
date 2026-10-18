package com.splitnest.expense;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatIllegalArgumentException;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;

class EqualSplitCalculatorTests {
    private final EqualSplitCalculator calculator = new EqualSplitCalculator();
    private final UUID first = UUID.fromString("00000000-0000-0000-0000-000000000001");
    private final UUID second = UUID.fromString("7fffffff-0000-0000-0000-000000000002");
    private final UUID third = UUID.fromString("80000000-0000-0000-0000-000000000003");

    @Test
    void dividesUnevenAmountByCanonicalUuidTextAndPreservesEveryPaisa() {
        var result = calculator.split(new BigDecimal("100.00"), List.of(third, first, second));
        assertThat(result).extracting(ExpenseDtos.SplitResponse::userId).containsExactly(first, second, third);
        assertThat(result).extracting(ExpenseDtos.SplitResponse::shareAmount)
                .containsExactly(new BigDecimal("33.34"), new BigDecimal("33.33"), new BigDecimal("33.33"));
    }

    @Test
    void permitsZeroSharesWhenThereAreFewerPaiseThanMembers() {
        var result = calculator.split(new BigDecimal("0.02"), List.of(third, second, first));
        assertThat(result).extracting(ExpenseDtos.SplitResponse::shareAmount)
                .containsExactly(new BigDecimal("0.01"), new BigDecimal("0.01"), new BigDecimal("0.00"));
    }

    @Test
    void resultAlwaysSumsExactlyAndSharesDifferByAtMostOnePaisa() {
        for (int count = 1; count <= 15; count++) {
            List<UUID> members = new ArrayList<>();
            for (int i = 0; i < count; i++) { members.add(new UUID(0, i + 1)); }
            Collections.reverse(members);
            for (long paise : new long[] {1, 2, 99, 10000, 10001, 999999999999L}) {
                BigDecimal amount = BigDecimal.valueOf(paise, 2);
                var result = calculator.split(amount, members);
                assertThat(result.stream().map(ExpenseDtos.SplitResponse::shareAmount)
                        .reduce(BigDecimal.ZERO, BigDecimal::add)).isEqualByComparingTo(amount);
                var min = result.stream().map(ExpenseDtos.SplitResponse::shareAmount).min(BigDecimal::compareTo).orElseThrow();
                var max = result.stream().map(ExpenseDtos.SplitResponse::shareAmount).max(BigDecimal::compareTo).orElseThrow();
                assertThat(max.subtract(min)).isLessThanOrEqualTo(new BigDecimal("0.01"));
            }
        }
    }

    @Test
    void rejectsInvalidAmountsAndRostersInsteadOfRoundingOrDroppingMembers() {
        for (var amount : List.of(new BigDecimal("0"), new BigDecimal("-1"), new BigDecimal("0.001"),
                new BigDecimal("10000000000.00"))) {
            assertThatIllegalArgumentException().isThrownBy(() -> calculator.split(amount, List.of(first)));
        }
        assertThatIllegalArgumentException().isThrownBy(() -> calculator.split(new BigDecimal("1.00"), List.of()));
        assertThatIllegalArgumentException().isThrownBy(() -> calculator.split(new BigDecimal("1.00"), List.of(first, first)));
        assertThatIllegalArgumentException().isThrownBy(() -> calculator.split(null, List.of(first)));
    }
}
