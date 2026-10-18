package com.splitnest.budget;

import com.splitnest.expense.Category;
import jakarta.validation.Valid;
import java.util.List;
import java.util.UUID;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/groups/{groupId}")
public class BudgetController {
    private final BudgetService service;

    public BudgetController(BudgetService service) { this.service = service; }

    @PutMapping("/budgets/{category}")
    public BudgetResponse set(@PathVariable UUID groupId, @PathVariable Category category, @Valid @RequestBody BudgetRequest request) {
        return service.set(groupId, category, request);
    }

    @GetMapping("/budgets")
    public List<BudgetResponse> list(@PathVariable UUID groupId) { return service.list(groupId); }

    @GetMapping("/alerts")
    public List<BudgetAlertResponse> alerts(@PathVariable UUID groupId) { return service.alerts(groupId); }
}
