package com.splitnest.common.config;

import com.splitnest.common.error.ApiException;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.GetMapping;

@Controller
public class SpaController {
    @GetMapping({"/", "/login", "/register", "/app", "/app/groups", "/app/groups/{groupId}"})
    public String index(HttpServletRequest request) {
        // Enumerated UI routes keep missing API/static resources from becoming HTML successes.
        if (!SpaRoutes.page(request.getRequestURI())) {
            throw ApiException.notFound("Page not found");
        }
        return "forward:/index.html";
    }
}
