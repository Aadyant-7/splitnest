package com.splitnest.expense;

import java.math.BigDecimal;
import java.util.UUID;

public record BalanceResponse(UUID userId, String displayName, boolean currentMember,
                              BigDecimal totalPaid, BigDecimal totalShare, BigDecimal netBalance)
        implements java.io.Serializable {}
