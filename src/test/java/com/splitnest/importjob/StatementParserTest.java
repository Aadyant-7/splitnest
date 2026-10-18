package com.splitnest.importjob;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.splitnest.expense.Category;
import java.io.ByteArrayOutputStream;
import java.io.ByteArrayInputStream;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Map;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;
import java.util.zip.ZipOutputStream;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.junit.jupiter.api.Test;

class StatementParserTest {
    private final ImportProperties properties = new ImportProperties();
    private final StatementRows rows = new StatementRows(properties);
    private final CsvStatementParser csv = new CsvStatementParser(rows, properties);
    private final XlsxStatementParser xlsx = new XlsxStatementParser(rows, properties);

    @Test
    void csvSkipsInvalidRowsAndCategorizesKeywords() throws Exception {
        var result = csv.parse(resource("mixed.csv"));
        assertThat(result.totalRows()).isEqualTo(6);
        assertThat(result.invalidRows()).isEqualTo(3);
        assertThat(result.expenses()).extracting(expense -> expense.category())
                .containsExactly(Category.FOOD, Category.GROCERIES, Category.TRAVEL);
        assertThat(result.expenses().getFirst().amount()).isEqualByComparingTo("100.00");
    }

    @Test
    void csvAcceptsAnOptionalUtf8ByteOrderMark() {
        var parsed = csv.parse(bytes("\ufeffdate,description,amount\n2026-10-01,SWIGGY,10.00"));
        assertThat(parsed.expenses()).hasSize(1);
        assertThat(parsed.invalidRows()).isZero();
    }

    @Test
    void distinguishesReadableInvalidRowsFromUnreadableFiles() throws Exception {
        assertThat(csv.parse(resource("invalid.csv")).expenses()).isEmpty();
        assertThatThrownBy(() -> csv.parse(resource("missing-columns.csv"))).isInstanceOf(StatementParseException.class);
        assertThatThrownBy(() -> csv.parse(new byte[] {(byte) 0xc3, 0x28})).isInstanceOf(StatementParseException.class);
        assertThatThrownBy(() -> csv.parse(bytes("date,description,amount\n2026-10-01,\"unclosed,1.00")))
                .isInstanceOf(StatementParseException.class);
    }

    @Test
    void csvRejectsExcessRowsAndUnsupportedAmounts() {
        properties.setMaxRows(1);
        assertThatThrownBy(() -> csv.parse(bytes("date,description,amount\n2026-10-01,A,1\n2026-10-02,B,2")))
                .isInstanceOf(StatementParseException.class).hasMessageContaining("row limit");
        assertThat(rows.parse("2026-10-01", "too big", "10000000000.00")).isEmpty();
        assertThat(rows.parse("2026-10-01", "scientific notation", "1e2")).isEmpty();
        assertThat(rows.parse("2026-10-01", " ", "1.00")).isEmpty();
    }

    @Test
    void keywordOverridesAreCaseInsensitiveAndUnknownDescriptionsUseOther() {
        properties.setKeywords(Map.of(Category.RENT, List.of("landlord")));
        assertThat(rows.category("monthly LANDLORD payment")).isEqualTo(Category.RENT);
        assertThat(rows.category("Bookshop purchase")).isEqualTo(Category.OTHER);
    }

    @Test
    void extremeDatesAreInvalidRowsWithoutRejectingOtherExpenses() {
        var parsed = csv.parse(bytes("date,description,amount\n2026-10-01,Good,1\n+999999999-01-01,Too large,1\n0000-01-01,Year zero,1\n+10000-01-01,Five digits,1"));
        assertThat(parsed.totalRows()).isEqualTo(4);
        assertThat(parsed.invalidRows()).isEqualTo(3);
        assertThat(parsed.expenses()).hasSize(1);
    }

    @Test
    void xlsxReadsSampleWithExactNumericAmounts() throws Exception {
        var result = xlsx.parse(resource("sample.xlsx"));
        assertThat(result.totalRows()).isEqualTo(2);
        assertThat(result.expenses()).hasSize(2);
        assertThat(result.expenses().getFirst().amount()).isEqualByComparingTo("100.10");
        assertThat(result.expenses().getLast().category()).isEqualTo(Category.TRAVEL);
    }

    @Test
    void xlsxDoesNotEvaluateFormulas() throws Exception {
        try (var workbook = new XSSFWorkbook(); var output = new ByteArrayOutputStream()) {
            var sheet = workbook.createSheet("Statement");
            var header = sheet.createRow(0);
            header.createCell(0).setCellValue("date");
            header.createCell(1).setCellValue("description");
            header.createCell(2).setCellValue("amount");
            var row = sheet.createRow(1);
            row.createCell(0).setCellValue("2026-10-01");
            row.createCell(1).setCellValue("SWIGGY");
            row.createCell(2).setCellFormula("1+1");
            workbook.write(output);
            var parsed = xlsx.parse(output.toByteArray());
            assertThat(parsed.totalRows()).isEqualTo(1);
            assertThat(parsed.expenses()).isEmpty();
        }
    }

    @Test
    void xlsxRejectsBadArchivesAndExpandedContentBeyondLimit() throws Exception {
        assertThatThrownBy(() -> xlsx.parse(bytes("not a workbook"))).isInstanceOf(StatementParseException.class);
        properties.setMaxExpandedBytes(10);
        assertThatThrownBy(() -> xlsx.parse(resource("sample.xlsx"))).isInstanceOf(StatementParseException.class)
                .hasMessageContaining("expanded content");
    }

    @Test
    void xlsxRejectsHugeExponentsBeforeExpandingDecimalStrings() throws Exception {
        for (String hostile : List.of("1E1000000000", "1E-1000000000", "0E-1000000000")) {
            var output = new ByteArrayOutputStream();
            try (var source = new ZipInputStream(new ByteArrayInputStream(resource("sample.xlsx")));
                    var target = new ZipOutputStream(output)) {
                ZipEntry entry;
                while ((entry = source.getNextEntry()) != null) {
                    byte[] content = source.readAllBytes();
                    if (entry.getName().equals("xl/worksheets/sheet1.xml")) {
                        content = new String(content, StandardCharsets.UTF_8)
                                .replace("<v>100.10</v>", "<v>" + hostile + "</v>").getBytes(StandardCharsets.UTF_8);
                    }
                    target.putNextEntry(new ZipEntry(entry.getName()));
                    target.write(content);
                    target.closeEntry();
                }
            }
            var parsed = xlsx.parse(output.toByteArray());
            assertThat(parsed.totalRows()).isEqualTo(2);
            assertThat(parsed.invalidRows()).isEqualTo(1);
            assertThat(parsed.expenses()).hasSize(1);
        }
    }

    @Test
    void hugeNumericDateIsSkippedWithoutFailingValidRows() throws Exception {
        byte[] normal;
        try (var workbook = new XSSFWorkbook(); var output = new ByteArrayOutputStream()) {
            var sheet = workbook.createSheet("Statement");
            var header = sheet.createRow(0);
            header.createCell(0).setCellValue("date");
            header.createCell(1).setCellValue("description");
            header.createCell(2).setCellValue("amount");
            var good = sheet.createRow(1);
            good.createCell(0).setCellValue("2026-10-01");
            good.createCell(1).setCellValue("SWIGGY");
            good.createCell(2).setCellValue(10);
            var invalid = sheet.createRow(2);
            invalid.createCell(0).setCellValue(1);
            invalid.createCell(1).setCellValue("Invalid date");
            invalid.createCell(2).setCellValue(5);
            var style = workbook.createCellStyle();
            style.setDataFormat(workbook.createDataFormat().getFormat("yyyy-mm-dd"));
            invalid.getCell(0).setCellStyle(style);
            workbook.write(output);
            normal = output.toByteArray();
        }
        for (String hostile : List.of("1E1000000000", "0E-1000000000", "3000000")) {
            var output = new ByteArrayOutputStream();
            try (var source = new ZipInputStream(new ByteArrayInputStream(normal)); var target = new ZipOutputStream(output)) {
                ZipEntry entry;
                while ((entry = source.getNextEntry()) != null) {
                    byte[] content = source.readAllBytes();
                    if (entry.getName().equals("xl/worksheets/sheet1.xml")) {
                        String xml = new String(content, StandardCharsets.UTF_8);
                        int cellStart = xml.indexOf("<c r=\"A3\"");
                        int valueStart = xml.indexOf("<v>", cellStart) + 3;
                        int valueEnd = xml.indexOf("</v>", valueStart);
                        assertThat(cellStart).isNotNegative();
                        content = (xml.substring(0, valueStart) + hostile + xml.substring(valueEnd)).getBytes(StandardCharsets.UTF_8);
                    }
                    target.putNextEntry(new ZipEntry(entry.getName()));
                    target.write(content);
                    target.closeEntry();
                }
            }
            var parsed = xlsx.parse(output.toByteArray());
            assertThat(parsed.totalRows()).isEqualTo(2);
            assertThat(parsed.expenses()).hasSize(1);
            assertThat(parsed.invalidRows()).isEqualTo(1);
        }
    }

    private byte[] resource(String name) throws Exception {
        try (var input = getClass().getResourceAsStream("/statements/" + name)) {
            if (input == null) { throw new IllegalStateException("Missing fixture " + name); }
            return input.readAllBytes();
        }
    }

    private byte[] bytes(String value) { return value.getBytes(StandardCharsets.UTF_8); }
}
