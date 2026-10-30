package com.splitnest.auth;

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.ConfigDataApplicationContextInitializer;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;

import static org.assertj.core.api.Assertions.assertThat;

class PublicDemoCookieConfigurationTest {
    private final ApplicationContextRunner context = new ApplicationContextRunner()
            .withInitializer(new ConfigDataApplicationContextInitializer())
            .withUserConfiguration(BrowserSessionCookies.class)
            .withPropertyValues("BROWSER_COOKIE_SECURE=false");

    @Test
    void preservesTheExplicitLocalHttpCookieExceptionWithoutThePublicProfile() {
        context.run(application -> assertThat(application.getBean(BrowserSessionCookies.class).secure()).isFalse());
    }

    @Test
    void thePublicProfileDoesNotInheritTheLocalHttpCookieException() {
        context.withPropertyValues("spring.profiles.active=public-demo")
                .run(application -> assertThat(application.getBean(BrowserSessionCookies.class).secure()).isTrue());
    }
}
