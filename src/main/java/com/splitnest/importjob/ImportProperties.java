package com.splitnest.importjob;

import com.splitnest.expense.Category;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.validation.annotation.Validated;

@Validated
@ConfigurationProperties("splitnest.imports")
public class ImportProperties {
    @Min(1) @Max(10000)
    private int maxRows = 10000;
    @Min(1048576) @Max(67108864)
    private long maxExpandedBytes = 33554432;
    private Map<Category, List<String>> keywords = new LinkedHashMap<>(Map.of(
            Category.FOOD, List.of("SWIGGY", "ZOMATO"),
            Category.GROCERIES, List.of("BLINKIT", "BIGBASKET"),
            Category.TRAVEL, List.of("UBER", "OLA")));

    public int getMaxRows() { return maxRows; }
    public void setMaxRows(int maxRows) { this.maxRows = maxRows; }
    public long getMaxExpandedBytes() { return maxExpandedBytes; }
    public void setMaxExpandedBytes(long maxExpandedBytes) { this.maxExpandedBytes = maxExpandedBytes; }
    public Map<Category, List<String>> getKeywords() { return keywords; }
    public void setKeywords(Map<Category, List<String>> keywords) { this.keywords = keywords; }
}
