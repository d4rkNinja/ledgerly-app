package handler

import (
	"math"
	"net/http"
	"strconv"
	"sync"
	"time"
)

const maxRateLimitEntries = 10_000

type rateEntry struct {
	count   int
	resetAt time.Time
}

type rateLimiter struct {
	mu          sync.Mutex
	entries     map[string]rateEntry
	limit       int
	capacity    int
	window      time.Duration
	nextCleanup time.Time
	now         func() time.Time
}

func newRateLimiter(limit int, window time.Duration) *rateLimiter {
	return &rateLimiter{
		entries:  make(map[string]rateEntry),
		limit:    limit,
		capacity: maxRateLimitEntries,
		window:   window,
		now:      time.Now,
	}
}

func (l *rateLimiter) Allow(key string) (bool, time.Duration) {
	l.mu.Lock()
	defer l.mu.Unlock()

	now := l.now()
	if l.nextCleanup.IsZero() || !now.Before(l.nextCleanup) {
		for entryKey, entry := range l.entries {
			if !now.Before(entry.resetAt) {
				delete(l.entries, entryKey)
			}
		}
		l.nextCleanup = now.Add(l.window)
	}

	entry, exists := l.entries[key]
	if exists && !now.Before(entry.resetAt) {
		entry = rateEntry{}
		exists = false
	}
	if !exists {
		if len(l.entries) >= l.capacity {
			var oldestKey string
			var earliestReset time.Time
			for entryKey, candidate := range l.entries {
				if earliestReset.IsZero() || candidate.resetAt.Before(earliestReset) {
					oldestKey = entryKey
					earliestReset = candidate.resetAt
				}
			}
			delete(l.entries, oldestKey)
		}
		entry.resetAt = now.Add(l.window)
	}
	entry.count++
	l.entries[key] = entry
	if entry.count <= l.limit {
		return true, 0
	}
	return false, entry.resetAt.Sub(now)
}

func (a *API) allowRequest(w http.ResponseWriter, key, message string) bool {
	allowed, retryAfter := a.rateLimiter.Allow(key)
	if allowed {
		return true
	}
	seconds := int64(math.Ceil(retryAfter.Seconds()))
	if seconds < 1 {
		seconds = 1
	}
	w.Header().Set("Retry-After", strconv.FormatInt(seconds, 10))
	writeError(w, http.StatusTooManyRequests, "rate_limited", message, nil)
	return false
}
