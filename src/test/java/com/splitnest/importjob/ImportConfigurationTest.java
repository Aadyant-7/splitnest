package com.splitnest.importjob;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class ImportConfigurationTest {
    @Test
    void supportsTheExistingLocalPoolAndTheSmallerPublicDemoPool() {
        var configuration = new ImportConfiguration();
        var local = configuration.importExecutor(2, 4, 16);
        assertThat(local.getCorePoolSize()).isEqualTo(2);
        assertThat(local.getMaxPoolSize()).isEqualTo(4);
        assertThat(local.getQueueCapacity()).isEqualTo(16);
        var demo = configuration.importExecutor(1, 1, 4);
        assertThat(demo.getCorePoolSize()).isEqualTo(1);
        assertThat(demo.getMaxPoolSize()).isEqualTo(1);
        assertThat(demo.getQueueCapacity()).isEqualTo(4);
    }

    @ParameterizedTest
    @CsvSource({"0,1,4", "-1,1,4", "2,1,4", "1,0,4", "1,1,-1"})
    void rejectsAnInvalidPoolBeforeStartingWorkers(int core, int max, int capacity) {
        assertThatThrownBy(() -> new ImportConfiguration().importExecutor(core, max, capacity))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("1 <= core <= max");
    }
}
