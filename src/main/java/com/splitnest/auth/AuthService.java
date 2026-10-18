package com.splitnest.auth;

import com.splitnest.common.error.ApiException;
import com.splitnest.common.security.CurrentUser;
import com.splitnest.user.User;
import com.splitnest.user.UserRepository;
import com.splitnest.user.UserResponse;
import java.time.Clock;
import java.util.UUID;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class AuthService {
    private final UserRepository users;
    private final PasswordEncoder passwords;
    private final RefreshTokenService refreshTokens;
    private final CurrentUser currentUser;
    private final Clock clock;
    private final String dummyPasswordHash;

    public AuthService(UserRepository users, PasswordEncoder passwords, RefreshTokenService refreshTokens,
                       CurrentUser currentUser, Clock clock) {
        this.users = users;
        this.passwords = passwords;
        this.refreshTokens = refreshTokens;
        this.currentUser = currentUser;
        this.clock = clock;
        this.dummyPasswordHash = passwords.encode(UUID.randomUUID().toString());
    }

    @Transactional
    public UserResponse register(RegisterRequest request) {
        User user = new User(UUID.randomUUID(), request.email(), passwords.encode(request.password()),
                request.displayName(), clock.instant());
        try {
            // The unique database constraint remains authoritative during concurrent registrations.
            return UserResponse.from(users.saveAndFlush(user));
        } catch (DataIntegrityViolationException exception) {
            throw ApiException.conflict("Email is already registered");
        }
    }

    public TokenResponse login(LoginRequest request) {
        var user = users.findByEmail(request.email());
        // Use BCrypt for both branches to reduce email enumeration through response timing.
        String hash = user.map(User::getPasswordHash).orElse(dummyPasswordHash);
        boolean valid = passwords.matches(request.password(), hash);
        if (user.isEmpty() || !valid) {
            throw ApiException.unauthorized("Invalid email or password");
        }
        return refreshTokens.issue(user.get().getId());
    }

    public TokenResponse refresh(RefreshRequest request) {
        return refreshTokens.rotate(request.refreshToken())
                .orElseThrow(() -> ApiException.unauthorized("Invalid or expired refresh token"));
    }

    public void logout(RefreshRequest request) {
        refreshTokens.logout(request.refreshToken(), currentUser.id());
    }
}
