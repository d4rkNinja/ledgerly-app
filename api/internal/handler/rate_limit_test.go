package handler

import (
	"testing"
	"time"
)

func TestRateLimiterResetsAndEvictsExpiredKeys(t *testing.T) {
	now := time.Date(2026, time.July, 26, 12, 0, 0, 0, time.UTC)
	limiter := newRateLimiter(1, time.Minute)
	limiter.now = func() time.Time { return now }

	if allowed, _ := limiter.Allow("client-a"); !allowed {
		t.Fatal("first request was denied")
	}
	if allowed, retryAfter := limiter.Allow("client-a"); allowed || retryAfter != time.Minute {
		t.Fatalf("second request = (%v, %s), want (false, 1m)", allowed, retryAfter)
	}

	now = now.Add(time.Minute)
	if allowed, _ := limiter.Allow("client-b"); !allowed {
		t.Fatal("request after window was denied")
	}
	if _, exists := limiter.entries["client-a"]; exists {
		t.Fatal("expired key was not evicted")
	}
	if allowed, _ := limiter.Allow("client-a"); !allowed {
		t.Fatal("expired client did not receive a fresh window")
	}
}

func TestRateLimiterEvictsOldestEntryAtCapacity(t *testing.T) {
	now := time.Date(2026, time.July, 26, 12, 0, 0, 0, time.UTC)
	limiter := newRateLimiter(1, time.Minute)
	limiter.capacity = 2
	limiter.now = func() time.Time { return now }

	if allowed, _ := limiter.Allow("oldest"); !allowed {
		t.Fatal("oldest first request was denied")
	}
	now = now.Add(time.Second)
	if allowed, _ := limiter.Allow("newer"); !allowed {
		t.Fatal("newer first request was denied")
	}
	now = now.Add(time.Second)
	if allowed, _ := limiter.Allow("new-client"); !allowed {
		t.Fatal("new client was denied at capacity")
	}
	if _, exists := limiter.entries["oldest"]; exists {
		t.Fatal("oldest entry was not evicted")
	}
}
