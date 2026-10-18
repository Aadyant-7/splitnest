package com.splitnest.auth;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class PasswordValidatorTest {
    private final PasswordValidator validator = new PasswordValidator();

    @Test
    void acceptsEightCharactersAndExactlySeventyTwoUtf8Bytes() {
        assertThat(validator.isValid("password", null)).isTrue();
        assertThat(validator.isValid("界".repeat(24), null)).isTrue();
        assertThat(validator.isValid("a".repeat(72), null)).isTrue();
    }

    @Test
    void rejectsMissingShortAndUnicodePasswordsBeyondBcryptLimit() {
        assertThat(validator.isValid(null, null)).isFalse();
        assertThat(validator.isValid("short", null)).isFalse();
        assertThat(validator.isValid("        ", null)).isFalse();
        assertThat(validator.isValid("界".repeat(25), null)).isFalse();
        assertThat(validator.isValid("a".repeat(73), null)).isFalse();
        assertThat(validator.isValid("😀".repeat(7), null)).isFalse();
    }
}
