package com.splitnest.budget;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.splitnest.group.GroupAccessService;
import com.splitnest.group.GroupRepository;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import org.junit.jupiter.api.Test;

class BudgetServiceTest {
    @Test
    void budgetMonthUsesUtcEvenWhenTheClockZoneIsElsewhere() {
        var repository = mock(BudgetRepository.class);
        var metrics = new SimpleMeterRegistry();
        Instant boundary = Instant.parse("2026-11-01T00:30:00Z");
        var service = new BudgetService(repository, mock(GroupAccessService.class), mock(GroupRepository.class),
                Clock.fixed(boundary, ZoneId.of("America/Los_Angeles")), metrics);
        when(repository.createAlerts(LocalDate.of(2026, 11, 1), boundary)).thenReturn(2);
        assertThat(service.checkCurrentMonth()).isEqualTo(2);
        verify(repository).createAlerts(LocalDate.of(2026, 11, 1), boundary);
        assertThat(metrics.counter("splitnest.budget.alerts").count()).isEqualTo(2);
    }
}
