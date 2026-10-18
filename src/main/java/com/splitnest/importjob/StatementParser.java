package com.splitnest.importjob;

public interface StatementParser {
    boolean supports(String extension);
    ParsedStatement parse(byte[] content);
}
