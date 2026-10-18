package com.splitnest.user;

import com.splitnest.common.error.ApiException;
import com.splitnest.common.security.CurrentUser;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class UserService {
    private final UserRepository users;
    private final CurrentUser currentUser;

    public UserService(UserRepository users, CurrentUser currentUser) {
        this.users = users;
        this.currentUser = currentUser;
    }

    @Transactional(readOnly = true)
    public UserResponse me() {
        return users.findById(currentUser.id()).map(UserResponse::from)
                .orElseThrow(() -> ApiException.unauthorized("User no longer exists"));
    }
}
