package com.splitnest.expense;

import java.util.UUID;

/** Published inside the write transaction; cache listeners must run only after its commit. */
public record ExpenseChanged(UUID groupId) {}
