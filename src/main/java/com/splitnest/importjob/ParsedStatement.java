package com.splitnest.importjob;

import com.splitnest.expense.ExpenseDraft;
import java.util.List;

public record ParsedStatement(int totalRows, List<ExpenseDraft> expenses) {
    public ParsedStatement { expenses = List.copyOf(expenses); }
    public int invalidRows() { return totalRows - expenses.size(); }
}
