package com.splitnest.expense;

import org.springframework.cache.annotation.CacheEvict;
import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;

@Component
public class BalanceCacheInvalidation {
    @CacheEvict(cacheNames = "balances", key = "#event.groupId()")
    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    public void changed(ExpenseChanged event) {
        // AFTER_COMMIT prevents another reader from caching state that will roll back.
    }
}
