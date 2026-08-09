package service

import (
	"context"
	"errors"
	"strings"
	"testing"
	"time"
)

func TestPasswordHashRoundTrip(t *testing.T) {
	hash, err := hashPassword("correct horse battery staple")
	if err != nil {
		t.Fatalf("hashPassword: %v", err)
	}
	if hash == "correct horse battery staple" {
		t.Fatal("password was stored in plaintext")
	}
	if !verifyPassword(hash, "correct horse battery staple") {
		t.Fatal("valid password did not verify")
	}
	if verifyPassword(hash, "wrong password") {
		t.Fatal("invalid password verified")
	}
	if verifyPassword("pbkdf2-sha256$210000$MDEyMzQ1Njc4OWFiY2RlZg$", "anything") {
		t.Fatal("empty derived key accepted a password")
	}
}

func TestRandomTokensAreHashedAndUnique(t *testing.T) {
	tokenA, hashA, err := randomToken(tokenBytes)
	if err != nil {
		t.Fatal(err)
	}
	tokenB, hashB, err := randomToken(tokenBytes)
	if err != nil {
		t.Fatal(err)
	}
	if tokenA == tokenB || hashA == hashB {
		t.Fatal("tokens are not unique")
	}
	if tokenA == hashA {
		t.Fatal("token hash equals plaintext token")
	}
	got, _ := tokenHash(tokenA)
	if got != hashA {
		t.Fatal("token hashing is not stable")
	}
}

func TestTokenHashRejectsMalformedOrOversizedTokens(t *testing.T) {
	for _, token := range []string{
		"",
		"short",
		" " + strings.Repeat("A", 43),
		strings.Repeat("A", 44),
		strings.Repeat("*", 43),
	} {
		if _, err := tokenHash(token); err == nil {
			t.Fatalf("tokenHash(%q) accepted an invalid token", token)
		}
	}
}

func TestDummyPasswordHashUsesProductionWorkFactor(t *testing.T) {
	if !verifyPassword(dummyPasswordHash, "invalid-login-password") {
		t.Fatal("dummy password hash is not a valid production-strength hash")
	}
	if verifyPassword(dummyPasswordHash, "different-password") {
		t.Fatal("dummy password hash accepted a different password")
	}
}

func TestLoginRejectsOversizedPasswordBeforeStoreAccess(t *testing.T) {
	store := &authStore{}
	service := NewAuthService(store, time.Hour)

	_, err := service.Login(
		context.Background(),
		LoginInput{Email: "person@example.test", Password: strings.Repeat("x", maxPasswordBytes+1)},
		"",
		"",
	)
	if !errors.Is(err, ErrUnauthorized) {
		t.Fatalf("Login() error = %v, want unauthorized", err)
	}
	if store.findOneCalls != 0 {
		t.Fatalf("oversized password reached the store %d times", store.findOneCalls)
	}
}

func TestValidateCurrency(t *testing.T) {
	got, err := validCurrency(" inr ")
	if err != nil || got != "INR" {
		t.Fatalf("expected INR, got %q (%v)", got, err)
	}
	for _, invalid := range []string{"", "IN", "₹₹₹", "123"} {
		if _, err := validCurrency(invalid); err == nil {
			t.Fatalf("expected %q to be rejected", invalid)
		}
	}
}

func TestTruncatePreservesUTF8(t *testing.T) {
	got := truncate("नमस्ते", 3)
	if got != "नमस" {
		t.Fatalf("unexpected rune truncation %q", got)
	}
}
