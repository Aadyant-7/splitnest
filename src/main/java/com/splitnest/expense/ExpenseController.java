package com.splitnest.expense;

import com.splitnest.expense.ExpenseDtos.CreateExpenseRequest;
import com.splitnest.expense.ExpenseDtos.ExpensePage;
import com.splitnest.expense.ExpenseDtos.ExpenseResponse;
import jakarta.validation.Valid;
import java.net.URI;
import java.util.List;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/groups/{groupId}")
public class ExpenseController {
    private final ExpenseService expenses;
    private final BalanceService balances;

    public ExpenseController(ExpenseService expenses, BalanceService balances) {
        this.expenses = expenses;
        this.balances = balances;
    }

    @PostMapping("/expenses")
    public ResponseEntity<ExpenseResponse> create(@PathVariable UUID groupId,
                                                 @Valid @RequestBody CreateExpenseRequest request) {
        var response = expenses.create(groupId, request);
        return ResponseEntity.created(URI.create("/api/v1/groups/" + groupId + "/expenses/" + response.id())).body(response);
    }

    @GetMapping("/expenses")
    public ExpensePage list(@PathVariable UUID groupId, @RequestParam(defaultValue = "0") int page,
                            @RequestParam(defaultValue = "20") int size) {
        return expenses.list(groupId, page, size);
    }

    @DeleteMapping("/expenses/{expenseId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@PathVariable UUID groupId, @PathVariable UUID expenseId) {
        expenses.delete(groupId, expenseId);
    }

    @GetMapping("/balances")
    public List<BalanceResponse> balances(@PathVariable UUID groupId) { return balances.getBalances(groupId); }
}
