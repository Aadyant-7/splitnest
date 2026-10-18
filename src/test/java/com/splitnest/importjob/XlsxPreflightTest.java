package com.splitnest.importjob;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.nio.charset.StandardCharsets;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;
import java.util.zip.ZipOutputStream;
import org.junit.jupiter.api.Test;

class XlsxPreflightTest {
    private static final String NAMESPACE = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
    private final ImportProperties properties = new ImportProperties();
    private final XlsxStatementParser parser = new XlsxStatementParser(new StatementRows(properties), properties);

    @Test
    void rejectsRowCountAndSparseRowIndexBeforeCreatingWorkbookObjects() throws Exception {
        properties.setMaxRows(1);
        assertThatThrownBy(() -> parser.parse(fixture(Map.of())))
                .isInstanceOf(StatementParseException.class).hasMessageContaining("row limit");
        properties.setMaxRows(10000);
        var sparse = "<worksheet xmlns=\"" + NAMESPACE + "\"><sheetData><row r=\"1048576\"/></sheetData></worksheet>";
        assertThatThrownBy(() -> parser.parse(fixture(Map.of("xl/worksheets/sheet1.xml", bytes(sparse)))))
                .isInstanceOf(StatementParseException.class).hasMessageContaining("row limit");
    }

    @Test
    void rejectsTooManyCellsAndFarAwayColumnsBeforePoiReadsThem() throws Exception {
        var cells = "<worksheet xmlns=\"" + NAMESPACE + "\"><sheetData><row r=\"1\">"
                + "<c><v>1</v></c>".repeat(17) + "</row></sheetData></worksheet>";
        assertThatThrownBy(() -> parser.parse(fixture(Map.of("xl/worksheets/sheet1.xml", bytes(cells)))))
                .isInstanceOf(StatementParseException.class).hasMessageContaining("cell limit");
        var sparse = "<worksheet xmlns=\"" + NAMESPACE + "\"><sheetData><row r=\"1\"><c r=\"XFD1\"/></row></sheetData></worksheet>";
        assertThatThrownBy(() -> parser.parse(fixture(Map.of("xl/worksheets/sheet1.xml", bytes(sparse)))))
                .isInstanceOf(StatementParseException.class).hasMessageContaining("cell limit");
    }

    @Test
    void rejectsExcessStylesAndDishonestDeclaredStyleCounts() throws Exception {
        var styles = "<styleSheet xmlns=\"" + NAMESPACE + "\"><cellXfs>" + "<xf/>".repeat(257) + "</cellXfs></styleSheet>";
        assertThatThrownBy(() -> parser.parse(fixture(Map.of("xl/styles.xml", bytes(styles)))))
                .isInstanceOf(StatementParseException.class).hasMessageContaining("style limit");
        var declared = "<styleSheet xmlns=\"" + NAMESPACE + "\"><cellXfs count=\"2147483647\"/></styleSheet>";
        assertThatThrownBy(() -> parser.parse(fixture(Map.of("xl/styles.xml", bytes(declared)))))
                .isInstanceOf(StatementParseException.class).hasMessageContaining("style limit");
    }

    @Test
    void rejectsSharedStringCountAndIndividualStringExpansion() throws Exception {
        properties.setMaxRows(2);
        var many = "<sst xmlns=\"" + NAMESPACE + "\">" + "<si><t>a</t></si>".repeat(49) + "</sst>";
        assertThatThrownBy(() -> parser.parse(fixture(Map.of("xl/sharedStrings.xml", bytes(many)))))
                .isInstanceOf(StatementParseException.class).hasMessageContaining("shared string limit");
        var declared = "<sst xmlns=\"" + NAMESPACE + "\" count=\"2147483647\"/>";
        assertThatThrownBy(() -> parser.parse(fixture(Map.of("xl/sharedStrings.xml", bytes(declared)))))
                .isInstanceOf(StatementParseException.class).hasMessageContaining("shared string limit");
        var longString = "<sst xmlns=\"" + NAMESPACE + "\"><si><t>" + "a".repeat(1025) + "</t></si></sst>";
        assertThatThrownBy(() -> parser.parse(fixture(Map.of("xl/sharedStrings.xml", bytes(longString)))))
                .isInstanceOf(StatementParseException.class).hasMessageContaining("complexity limit");
    }

    @Test
    void rejectsGlobalElementTextAndDepthBudgetsIncludingNonWorksheetXml() throws Exception {
        properties.setMaxRows(2);
        var elements = "<theme>" + "<item/>".repeat(8400) + "</theme>";
        assertThatThrownBy(() -> parser.parse(fixture(Map.of("xl/theme/theme1.xml", bytes(elements)))))
                .isInstanceOf(StatementParseException.class).hasMessageContaining("complexity limit");
        var text = "<theme>" + "a".repeat(70000) + "</theme>";
        assertThatThrownBy(() -> parser.parse(fixture(Map.of("xl/theme/theme1.xml", bytes(text)))))
                .isInstanceOf(StatementParseException.class).hasMessageContaining("complexity limit");
        var depth = "<theme>" + "<a>".repeat(65) + "</a>".repeat(65) + "</theme>";
        assertThatThrownBy(() -> parser.parse(fixture(Map.of("xl/theme/theme1.xml", bytes(depth)))))
                .isInstanceOf(StatementParseException.class).hasMessageContaining("complexity limit");
    }

    @Test
    void rejectsDoctypeExternalEntitiesAndExternalRelationships() throws Exception {
        for (String unsafe : new String[] {
                "<!DOCTYPE worksheet [<!ENTITY boom 'expanded'>]><worksheet>&boom;</worksheet>",
                "<!DOCTYPE worksheet [<!ENTITY remote SYSTEM 'file:///nonexistent-splitnest-test'>]><worksheet>&remote;</worksheet>",
                "<Relationships><Relationship Id=\"rId2\" Target=\"https://example.com/remote\" TargetMode=\"External\"/></Relationships>"
        }) {
            assertThatThrownBy(() -> parser.parse(fixture(Map.of("xl/unsafe.xml", bytes(unsafe)))))
                    .isInstanceOf(StatementParseException.class);
        }
    }

    @Test
    void ordinaryThemeAndBinaryImageDoNotGetParsedAsWorksheets() throws Exception {
        var result = parser.parse(fixture(Map.of(
                "xl/theme/theme1.xml", bytes("<theme><colors><accent value=\"blue\"/></colors></theme>"),
                "xl/media/image1.png", new byte[] {(byte) 0x89, 'P', 'N', 'G', 13, 10, 26, 10, 0, 0})));
        assertThat(result.expenses()).hasSize(2);
    }

    @Test
    void xmlMasqueradingAsBinaryMediaCannotBypassPreflight() throws Exception {
        assertThatThrownBy(() -> parser.parse(fixture(Map.of("xl/media/disguised.png", bytes("<styleSheet><cellXfs count=\"2147483647\"/></styleSheet>")))))
                .isInstanceOf(StatementParseException.class).hasMessageContaining("binary part");
        assertThatThrownBy(() -> parser.parse(fixture(Map.of("xl/theme/theme1.xml", new byte[] {0, 1, 2, 3}))))
                .isInstanceOf(StatementParseException.class).hasMessageContaining("unsafe XML");
    }

    private byte[] fixture(Map<String, byte[]> replacements) throws Exception {
        Map<String, byte[]> entries = new LinkedHashMap<>();
        try (var source = getClass().getResourceAsStream("/statements/sample.xlsx"); var zip = new ZipInputStream(source)) {
            ZipEntry entry;
            while ((entry = zip.getNextEntry()) != null) { entries.put(entry.getName(), zip.readAllBytes()); }
        }
        entries.putAll(replacements);
        if (entries.keySet().stream().anyMatch(name -> name.endsWith(".png"))) {
            String types = new String(entries.get("[Content_Types].xml"), StandardCharsets.UTF_8);
            entries.put("[Content_Types].xml", bytes(types.replace("</Types>",
                    "<Default Extension=\"png\" ContentType=\"image/png\"/></Types>")));
        }
        var output = new ByteArrayOutputStream();
        try (var zip = new ZipOutputStream(output)) {
            for (var entry : entries.entrySet()) {
                zip.putNextEntry(new ZipEntry(entry.getKey()));
                zip.write(entry.getValue());
                zip.closeEntry();
            }
        }
        return output.toByteArray();
    }

    private byte[] bytes(String text) { return text.getBytes(StandardCharsets.UTF_8); }
}
