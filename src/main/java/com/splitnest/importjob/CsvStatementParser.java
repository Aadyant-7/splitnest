package com.splitnest.importjob;

import com.splitnest.expense.ExpenseDraft;
import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.InputStreamReader;
import java.nio.charset.CodingErrorAction;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import org.apache.commons.csv.CSVFormat;
import org.apache.commons.csv.DuplicateHeaderMode;
import org.springframework.stereotype.Component;

@Component
public class CsvStatementParser implements StatementParser {
    private final StatementRows rows;
    private final ImportProperties properties;

    public CsvStatementParser(StatementRows rows, ImportProperties properties) {
        this.rows = rows;
        this.properties = properties;
    }

    @Override public boolean supports(String extension) { return "csv".equals(extension); }

    @Override public ParsedStatement parse(byte[] content) {
        var decoder = StandardCharsets.UTF_8.newDecoder().onMalformedInput(CodingErrorAction.REPORT)
                .onUnmappableCharacter(CodingErrorAction.REPORT);
        var format = CSVFormat.DEFAULT.builder().setHeader().setSkipHeaderRecord(true)
                .setIgnoreHeaderCase(true).setTrim(true).setDuplicateHeaderMode(DuplicateHeaderMode.DISALLOW).get();
        List<ExpenseDraft> expenses = new ArrayList<>();
        int total = 0;
        int offset = content.length >= 3 && content[0] == (byte) 0xef && content[1] == (byte) 0xbb && content[2] == (byte) 0xbf ? 3 : 0;
        try (var reader = new InputStreamReader(new ByteArrayInputStream(content, offset, content.length - offset), decoder);
                var parser = format.parse(reader)) {
            if (!parser.getHeaderMap().keySet().stream().map(String::toLowerCase).toList()
                    .containsAll(List.of("date", "description", "amount"))) {
                throw new StatementParseException("CSV must contain date, description and amount columns");
            }
            for (var record : parser) {
                if (++total > properties.getMaxRows()) { throw new StatementParseException("Statement exceeds the row limit"); }
                if (record.isConsistent()) {
                    rows.parse(record.get("date"), record.get("description"), record.get("amount")).ifPresent(expenses::add);
                }
            }
            return new ParsedStatement(total, expenses);
        } catch (IOException | IllegalArgumentException | java.io.UncheckedIOException exception) {
            throw new StatementParseException("CSV is unreadable; provide valid UTF-8 CSV");
        }
    }
}
