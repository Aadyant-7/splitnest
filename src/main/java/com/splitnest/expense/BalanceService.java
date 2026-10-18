package com.splitnest.expense;

import com.splitnest.group.GroupAccessService;
import java.util.List;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class BalanceService {
    private final GroupAccessService access;
    private final BalanceCalculator calculator;

    public BalanceService(GroupAccessService access, BalanceCalculator calculator) {
        this.access = access;
        this.calculator = calculator;
    }

    @Transactional(readOnly = true)
    public List<BalanceResponse> getBalances(UUID groupId) {
        access.requireMember(groupId);
        return calculator.calculate(groupId);
    }

}
