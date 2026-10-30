package com.splitnest.importjob;

import java.util.concurrent.ThreadPoolExecutor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.annotation.EnableAsync;
import org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor;

@Configuration(proxyBeanMethods = false)
@EnableAsync
@EnableConfigurationProperties(ImportProperties.class)
public class ImportConfiguration {
    @Bean("importExecutor")
    public ThreadPoolTaskExecutor importExecutor(
            @Value("${splitnest.imports.executor.core-pool-size:2}") int corePoolSize,
            @Value("${splitnest.imports.executor.max-pool-size:4}") int maxPoolSize,
            @Value("${splitnest.imports.executor.queue-capacity:16}") int queueCapacity) {
        if (corePoolSize < 1 || maxPoolSize < corePoolSize || queueCapacity < 0) {
            throw new IllegalArgumentException("Import executor requires 1 <= core <= max and a non-negative queue capacity");
        }
        var executor = new ThreadPoolTaskExecutor();
        executor.setCorePoolSize(corePoolSize);
        executor.setMaxPoolSize(maxPoolSize);
        executor.setQueueCapacity(queueCapacity);
        executor.setThreadNamePrefix("statement-import-");
        executor.setRejectedExecutionHandler(new ThreadPoolExecutor.AbortPolicy());
        executor.setWaitForTasksToCompleteOnShutdown(true);
        executor.setAwaitTerminationSeconds(25);
        return executor;
    }
}
