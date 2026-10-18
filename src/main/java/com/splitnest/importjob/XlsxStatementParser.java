package com.splitnest.importjob;

import com.splitnest.expense.ExpenseDraft;
import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.math.BigDecimal;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.zip.ZipInputStream;
import javax.xml.XMLConstants;
import javax.xml.stream.XMLInputFactory;
import javax.xml.stream.XMLStreamConstants;
import javax.xml.stream.XMLStreamException;
import javax.xml.stream.XMLStreamReader;
import org.apache.poi.ss.usermodel.Cell;
import org.apache.poi.ss.usermodel.CellType;
import org.apache.poi.ss.usermodel.DateUtil;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.apache.poi.xssf.usermodel.XSSFCell;
import org.springframework.stereotype.Component;

@Component
public class XlsxStatementParser implements StatementParser {
    private final StatementRows rows;
    private final ImportProperties properties;

    public XlsxStatementParser(StatementRows rows, ImportProperties properties) {
        this.rows = rows;
        this.properties = properties;
    }

    @Override public boolean supports(String extension) { return "xlsx".equals(extension); }

    @Override public ParsedStatement parse(byte[] content) {
        inspectArchive(content);
        List<ExpenseDraft> expenses = new ArrayList<>();
        try (var workbook = new XSSFWorkbook(new ByteArrayInputStream(content))) {
            if (!workbook.getExternalLinksTable().isEmpty() || workbook.getNumberOfSheets() != 1) {
                throw new StatementParseException("Use one worksheet without external links");
            }
            var sheet = workbook.getSheetAt(0);
            var header = sheet.getRow(0);
            if (header == null || header.getLastCellNum() > 16) { throw new StatementParseException("XLSX header is missing or too wide"); }
            List<String> names = new ArrayList<>();
            for (int i = 0; i < header.getLastCellNum(); i++) { names.add(text(header.getCell(i), false).strip().toLowerCase(Locale.ROOT)); }
            if (!names.containsAll(List.of("date", "description", "amount")) || names.stream().distinct().count() != names.size()) {
                throw new StatementParseException("XLSX must contain unique date, description and amount columns");
            }
            if (sheet.getLastRowNum() > properties.getMaxRows()) { throw new StatementParseException("Statement exceeds the row limit"); }
            int total = 0;
            for (int i = 1; i <= sheet.getLastRowNum(); i++) {
                var row = sheet.getRow(i);
                if (row == null) { continue; }
                ++total;
                if (row.getLastCellNum() > 16) { continue; }
                var date = row.getCell(names.indexOf("date"));
                var description = row.getCell(names.indexOf("description"));
                var amount = row.getCell(names.indexOf("amount"));
                if (formula(date) || formula(description) || formula(amount)) { continue; }
                rows.parse(text(date, true), text(description, false), text(amount, false)).ifPresent(expenses::add);
            }
            return new ParsedStatement(total, expenses);
        } catch (IOException | RuntimeException exception) {
            if (exception instanceof StatementParseException parseException) { throw parseException; }
            throw new StatementParseException("XLSX is unreadable or unsupported");
        }
    }

    private void inspectArchive(byte[] content) {
        var budget = new WorkbookBudget(properties.getMaxRows());
        int entries = 0;
        var factory = secureXmlFactory();
        // Stream structural limits before POI creates a full graph of workbook objects.
        try (var zip = new ZipInputStream(new ByteArrayInputStream(content))) {
            var entry = zip.getNextEntry();
            byte[] buffer = new byte[8192];
            while (entry != null) {
                if (++entries > 1000) { throw new StatementParseException("XLSX contains too many entries"); }
                if (entry.getName().contains("externalLinks/") || entry.getName().contains("vbaProject")) {
                    throw new StatementParseException("External links and macros are unsupported");
                }
                var input = new InputStream() {
                    @Override public int read() throws IOException {
                        int value = zip.read();
                        if (value >= 0) { expanded(1); }
                        return value;
                    }
                    @Override public int read(byte[] bytes, int offset, int length) throws IOException {
                        int count = zip.read(bytes, offset, length);
                        if (count > 0) { expanded(count); }
                        return count;
                    }
                    private void expanded(int count) {
                        budget.expandedBytes += count;
                        if (budget.expandedBytes > properties.getMaxExpandedBytes()) {
                            throw new StatementParseException("XLSX expanded content exceeds the limit");
                        }
                    }
                    // An XML reader must not close the containing ZIP stream.
                    @Override public void close() { }
                };
                String name = entry.getName().toLowerCase(Locale.ROOT);
                if (!entry.isDirectory()) {
                    if (name.endsWith(".xml") || name.endsWith(".rels")) {
                        inspectXml(factory, input, budget);
                    } else {
                        inspectBinary(name, input);
                    }
                }
                while (input.read(buffer) != -1) { /* Count any remaining entry bytes. */ }
                entry = zip.getNextEntry();
            }
            if (entries == 0) { throw new StatementParseException("XLSX is not a valid workbook archive"); }
        } catch (IOException exception) {
            throw new StatementParseException("XLSX is not a valid workbook archive");
        }
    }

    private XMLInputFactory secureXmlFactory() {
        var factory = XMLInputFactory.newDefaultFactory();
        factory.setProperty(XMLInputFactory.SUPPORT_DTD, false);
        factory.setProperty(XMLInputFactory.IS_SUPPORTING_EXTERNAL_ENTITIES, false);
        factory.setProperty(XMLInputFactory.IS_REPLACING_ENTITY_REFERENCES, false);
        factory.setProperty(XMLConstants.ACCESS_EXTERNAL_DTD, "");
        factory.setXMLResolver((publicId, systemId, baseUri, namespace) -> {
            throw new XMLStreamException("External entities are unsupported");
        });
        return factory;
    }

    private void inspectXml(XMLInputFactory factory, InputStream input, WorkbookBudget budget) {
        XMLStreamReader xml = null;
        try {
            xml = factory.createXMLStreamReader(input);
            String root = "";
            int depth = 0;
            int rowCells = 0;
            int rowDepth = 0;
            int valueDepth = 0;
            int valueElements = 0;
            long valueCharacters = 0;
            while (xml.hasNext()) {
                int event = xml.next();
                if (event == XMLStreamConstants.DTD || event == XMLStreamConstants.ENTITY_REFERENCE) {
                    throw new StatementParseException("XLSX XML declarations and entities are unsupported");
                }
                if (event == XMLStreamConstants.START_ELEMENT) {
                    if (++depth > 64 || ++budget.elements > budget.maxElements || xml.getAttributeCount() > 32
                            || xml.getNamespaceCount() > 16) { throw complexity(); }
                    String element = xml.getLocalName();
                    if (depth == 1) {
                        root = element;
                        if ("worksheet".equals(root) && ++budget.worksheets > 1) {
                            throw new StatementParseException("Use one worksheet without external links");
                        }
                    }
                    inspectAttributes(xml, root, budget);
                    if ("worksheet".equals(root)) {
                        if ("row".equals(element)) {
                            if (rowDepth != 0 || ++budget.rows > budget.maxRows) {
                                throw new StatementParseException("Statement exceeds the row limit");
                            }
                            rowDepth = depth;
                            rowCells = 0;
                        } else if ("c".equals(element)) {
                            if (rowDepth == 0 || ++rowCells > 16 || ++budget.cells > budget.maxCells) {
                                throw new StatementParseException("XLSX exceeds the cell limit");
                            }
                            valueDepth = depth;
                            valueElements = 0;
                            valueCharacters = 0;
                        }
                    } else if ("sst".equals(root) && "si".equals(element)) {
                        if (++budget.sharedStrings > budget.maxCells) {
                            throw new StatementParseException("XLSX exceeds the shared string limit");
                        }
                        valueDepth = depth;
                        valueElements = 0;
                        valueCharacters = 0;
                    } else if ("styleSheet".equals(root)) {
                        if (++budget.styleElements > 4096) { throw new StatementParseException("XLSX exceeds the style limit"); }
                        if (List.of("xf", "font", "fill", "border", "numFmt", "dxf").contains(element)
                                && ++budget.styles > 256) { throw new StatementParseException("XLSX exceeds the style limit"); }
                    }
                    if (valueDepth > 0 && ++valueElements > 64) { throw complexity(); }
                } else if (event == XMLStreamConstants.END_ELEMENT) {
                    if (depth == rowDepth) { rowDepth = 0; }
                    if (depth == valueDepth) { valueDepth = 0; }
                    --depth;
                } else if (event == XMLStreamConstants.CHARACTERS || event == XMLStreamConstants.CDATA
                        || event == XMLStreamConstants.SPACE) {
                    int length = xml.getTextLength();
                    budget.textCharacters += length;
                    if (budget.textCharacters > budget.maxTextCharacters) { throw complexity(); }
                    if (valueDepth > 0 && (valueCharacters += length) > 1024) { throw complexity(); }
                } else if (event == XMLStreamConstants.COMMENT) {
                    if (xml.getTextLength() > 4096) { throw complexity(); }
                    budget.textCharacters += xml.getTextLength();
                    if (budget.textCharacters > budget.maxTextCharacters) { throw complexity(); }
                } else if (event == XMLStreamConstants.PROCESSING_INSTRUCTION) {
                    throw new StatementParseException("XLSX XML processing instructions are unsupported");
                }
            }
        } catch (XMLStreamException exception) {
            throw new StatementParseException("XLSX contains unreadable or unsafe XML");
        } finally {
            if (xml != null) {
                try { xml.close(); } catch (XMLStreamException ignored) { /* The ZIP stream is owned by inspectArchive. */ }
            }
        }
    }

    private void inspectAttributes(XMLStreamReader xml, String root, WorkbookBudget budget) {
        String element = xml.getLocalName();
        if (element.length() > 256) { throw complexity(); }
        for (int index = 0; index < xml.getNamespaceCount(); index++) {
            String namespace = xml.getNamespaceURI(index);
            if (namespace != null) {
                budget.textCharacters += namespace.length();
                if (namespace.length() > 2048 || budget.textCharacters > budget.maxTextCharacters) { throw complexity(); }
            }
        }
        for (int index = 0; index < xml.getAttributeCount(); index++) {
            String name = xml.getAttributeLocalName(index);
            String value = xml.getAttributeValue(index);
            budget.textCharacters += value.length();
            if (name.length() > 256 || value.length() > 2048 || budget.textCharacters > budget.maxTextCharacters) { throw complexity(); }
            if ("Relationship".equals(element) && "TargetMode".equals(name) && "External".equalsIgnoreCase(value)) {
                throw new StatementParseException("External links and macros are unsupported");
            }
            if ("worksheet".equals(root) && "row".equals(element) && "r".equals(name)) {
                boundedInteger(value, budget.maxRows, "Statement exceeds the row limit");
            }
            if ("worksheet".equals(root) && "c".equals(element) && "r".equals(name)) {
                if (!value.matches("[A-Pa-p][1-9][0-9]{0,4}")) { throw new StatementParseException("XLSX exceeds the cell limit"); }
                boundedInteger(value.substring(1), budget.maxRows, "Statement exceeds the row limit");
            }
            if ("styleSheet".equals(root) && "count".equals(name)) {
                boundedInteger(value, 256, "XLSX exceeds the style limit");
            }
            if ("sst".equals(root) && ("count".equals(name) || "uniqueCount".equals(name))) {
                boundedInteger(value, budget.maxCells, "XLSX exceeds the shared string limit");
            }
        }
    }

    private void inspectBinary(String name, InputStream input) throws IOException {
        if (!name.startsWith("xl/media/") && !name.startsWith("docprops/thumbnail.")) {
            throw new StatementParseException("XLSX contains an unsupported binary part");
        }
        byte[] signature = input.readNBytes(8);
        boolean png = signature.length == 8 && signature[0] == (byte) 0x89 && signature[1] == 'P'
                && signature[2] == 'N' && signature[3] == 'G' && signature[4] == 13 && signature[5] == 10
                && signature[6] == 26 && signature[7] == 10;
        boolean jpeg = signature.length >= 3 && signature[0] == (byte) 0xff
                && signature[1] == (byte) 0xd8 && signature[2] == (byte) 0xff;
        boolean gif = signature.length >= 6 && signature[0] == 'G' && signature[1] == 'I' && signature[2] == 'F'
                && signature[3] == '8' && (signature[4] == '7' || signature[4] == '9') && signature[5] == 'a';
        boolean bmp = signature.length >= 2 && signature[0] == 'B' && signature[1] == 'M';
        // XML disguised as a media/binary part must not bypass the structural preflight.
        if (!png && !jpeg && !gif && !bmp) { throw new StatementParseException("XLSX contains an unsupported binary part"); }
    }

    private void boundedInteger(String value, long maximum, String message) {
        try {
            if (value.length() > 10 || Long.parseLong(value) < 0 || Long.parseLong(value) > maximum) {
                throw new StatementParseException(message);
            }
        } catch (NumberFormatException exception) {
            throw new StatementParseException(message);
        }
    }

    private StatementParseException complexity() { return new StatementParseException("XLSX exceeds the XML complexity limit"); }

    private static final class WorkbookBudget {
        final long maxRows;
        final long maxCells;
        final long maxElements;
        final long maxTextCharacters;
        long expandedBytes;
        long elements;
        long rows;
        long cells;
        long sharedStrings;
        long styles;
        long styleElements;
        long textCharacters;
        int worksheets;

        WorkbookBudget(int dataRows) {
            maxRows = (long) dataRows + 1;
            maxCells = maxRows * 16;
            // Allow ordinary themes/styles plus rich text, while bounding POI's later object graph.
            maxElements = maxRows * 64 + 8192;
            maxTextCharacters = maxRows * 1024 + 65536;
        }
    }

    private boolean formula(Cell cell) { return cell != null && cell.getCellType() == CellType.FORMULA; }

    private String text(Cell cell, boolean date) {
        if (cell == null) { return ""; }
        return switch (cell.getCellType()) {
            case STRING -> cell.getStringCellValue();
            case NUMERIC -> numericCell(cell, date);
            default -> "";
        };
    }

    private String numericCell(Cell cell, boolean date) {
        String number = boundedNumber(((XSSFCell) cell).getRawValue());
        if (number.isEmpty()) { return ""; }
        try {
            if (date && DateUtil.isCellDateFormatted(cell)) {
                var serial = new BigDecimal(number);
                // Reject invalid date serials before POI converts the numeric value through double.
                if (serial.signum() < 0 || serial.compareTo(new BigDecimal("2958465.99999")) > 0) { return ""; }
                return cell.getLocalDateTimeCellValue().toLocalDate().format(DateTimeFormatter.ISO_LOCAL_DATE);
            }
            return number;
        } catch (RuntimeException exception) {
            return "";
        }
    }

    private String boundedNumber(String raw) {
        // Small XML values such as 1E1000000000 must never expand into enormous decimal strings.
        if (raw == null || raw.length() > 64) { return ""; }
        try {
            var value = new BigDecimal(raw);
            if (value.precision() > 30 || value.scale() < -10 || value.scale() > 20
                    || value.abs().compareTo(new BigDecimal("9999999999.99")) > 0) { return ""; }
            return value.stripTrailingZeros().toPlainString();
        } catch (NumberFormatException exception) {
            return "";
        }
    }
}
