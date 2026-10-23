package com.splitnest.common.config;

import java.util.Set;
import java.util.regex.Pattern;

public final class SpaRoutes {
    private static final Set<String> PAGES = Set.of(
            "/", "/login", "/register", "/app", "/app/home", "/app/guide", "/app/groups");
    private static final Pattern GROUP = Pattern.compile(
            "/app/groups/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}");

    private SpaRoutes() { }

    public static boolean page(String path) { return PAGES.contains(path) || GROUP.matcher(path).matches(); }

    public static boolean resource(String path) {
        return path.equals("/index.html") || path.equals("/favicon.ico") || path.equals("/favicon.svg")
                || path.equals("/examples/statement.csv") || path.startsWith("/assets/");
    }
}
