package com.splitnest.ratelimit;

public class RateLimitExceededException extends RuntimeException {
    private final long retryAfter;

    public RateLimitExceededException(long retryAfter) {
        super("Too many requests. Try again after the current window.");
        this.retryAfter = retryAfter;
    }

    public long getRetryAfter() { return retryAfter; }
}
