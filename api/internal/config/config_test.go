package config

import (
	"os"
	"slices"
	"strings"
	"testing"
	"time"
)

func TestLoadDefaultsIncludeViteDevelopmentOrigins(t *testing.T) {
	t.Setenv("APP_ENV", "development")
	original, wasSet := os.LookupEnv("CORS_ALLOWED_ORIGINS")
	if err := os.Unsetenv("CORS_ALLOWED_ORIGINS"); err != nil {
		t.Fatalf("unset CORS_ALLOWED_ORIGINS: %v", err)
	}
	t.Cleanup(func() {
		if wasSet {
			if err := os.Setenv("CORS_ALLOWED_ORIGINS", original); err != nil {
				t.Errorf("restore CORS_ALLOWED_ORIGINS: %v", err)
			}
			return
		}
		if err := os.Unsetenv("CORS_ALLOWED_ORIGINS"); err != nil {
			t.Errorf("clear CORS_ALLOWED_ORIGINS: %v", err)
		}
	})

	origins := Load().AllowedOrigins
	for _, expected := range []string{
		"http://localhost:5173",
		"http://127.0.0.1:5173",
	} {
		if !slices.Contains(origins, expected) {
			t.Fatalf("AllowedOrigins = %#v, want default to include %q", origins, expected)
		}
	}
	if slices.Contains(origins, "*") {
		t.Fatalf("AllowedOrigins = %#v, wildcard must not be enabled", origins)
	}
}

func TestLoadValidatesHTTPRuntimeValues(t *testing.T) {
	t.Setenv("SERVER_HOST", "::1")
	t.Setenv("SERVER_PORT", "70000")
	t.Setenv("READ_HEADER_TIMEOUT", "-1s")
	t.Setenv("REQUEST_TIMEOUT", "45s")
	t.Setenv("MAX_BODY_BYTES", "4294967296")
	t.Setenv("MAX_HEADER_BYTES", "2097152")
	t.Setenv("CORS_ALLOWED_ORIGINS", " https://app.example.test,https://app.example.test ")
	t.Setenv("TRUSTED_PROXIES", "10.0.0.0/8, 127.0.0.1")

	cfg := Load()

	if cfg.Address() != "[::1]:8080" {
		t.Fatalf("Address() = %q, want IPv6-safe fallback address", cfg.Address())
	}
	if cfg.ReadHeaderTimeout != 5*time.Second {
		t.Fatalf("ReadHeaderTimeout = %s, want safe default", cfg.ReadHeaderTimeout)
	}
	if cfg.RequestTimeout != 45*time.Second {
		t.Fatalf("RequestTimeout = %s, want 45s", cfg.RequestTimeout)
	}
	if cfg.MaxBodyBytes != defaultMaxBodyBytes {
		t.Fatalf("MaxBodyBytes = %d, want capped fallback %d", cfg.MaxBodyBytes, defaultMaxBodyBytes)
	}
	if cfg.MaxHeaderBytes != defaultMaxHeaderBytes {
		t.Fatalf("MaxHeaderBytes = %d, want capped fallback %d", cfg.MaxHeaderBytes, defaultMaxHeaderBytes)
	}
	if len(cfg.AllowedOrigins) != 1 || cfg.AllowedOrigins[0] != "https://app.example.test" {
		t.Fatalf("AllowedOrigins = %#v, want one deduplicated origin", cfg.AllowedOrigins)
	}
	if len(cfg.TrustedProxies) != 2 {
		t.Fatalf("TrustedProxies = %#v, want two entries", cfg.TrustedProxies)
	}
}

func TestLoadAllowsExplicitlyEmptyCORSAllowlist(t *testing.T) {
	t.Setenv("CORS_ALLOWED_ORIGINS", "")

	if origins := Load().AllowedOrigins; len(origins) != 0 {
		t.Fatalf("AllowedOrigins = %#v, want empty allowlist", origins)
	}
}

func TestDefaultWriteTimeoutAllowsRequestTimeoutResponse(t *testing.T) {
	t.Setenv("REQUEST_TIMEOUT", "")
	t.Setenv("WRITE_TIMEOUT", "")

	cfg := Load()
	if cfg.WriteTimeout <= cfg.RequestTimeout {
		t.Fatalf("WriteTimeout = %s, must exceed RequestTimeout = %s", cfg.WriteTimeout, cfg.RequestTimeout)
	}
}

func TestLoadKeepsWriteTimeoutBeyondConfiguredRequestTimeout(t *testing.T) {
	t.Setenv("REQUEST_TIMEOUT", "2m")
	t.Setenv("WRITE_TIMEOUT", "10s")

	cfg := Load()
	if cfg.WriteTimeout <= cfg.RequestTimeout {
		t.Fatalf("WriteTimeout = %s, must exceed RequestTimeout = %s", cfg.WriteTimeout, cfg.RequestTimeout)
	}
	if cfg.WriteTimeout != 2*time.Minute+5*time.Second {
		t.Fatalf("WriteTimeout = %s, want request timeout plus response margin", cfg.WriteTimeout)
	}
}

func TestLoadAcceptsBodyAndHeaderLimitsAtCaps(t *testing.T) {
	t.Setenv("MAX_BODY_BYTES", "16777216")
	t.Setenv("MAX_HEADER_BYTES", "1048576")

	cfg := Load()
	if cfg.MaxBodyBytes != maximumBodyBytes {
		t.Fatalf("MaxBodyBytes = %d, want %d", cfg.MaxBodyBytes, maximumBodyBytes)
	}
	if cfg.MaxHeaderBytes != maximumHeaderBytes {
		t.Fatalf("MaxHeaderBytes = %d, want %d", cfg.MaxHeaderBytes, maximumHeaderBytes)
	}
}

func TestLoadValidatedRejectsExplicitlyInvalidValues(t *testing.T) {
	t.Setenv("APP_ENV", "development")
	t.Setenv("SERVER_PORT", "70000")
	t.Setenv("MAX_BODY_BYTES", "4294967296")
	t.Setenv("REQUEST_TIMEOUT", "30s")
	t.Setenv("WRITE_TIMEOUT", "10s")
	t.Setenv("TRUSTED_PROXIES", "not-a-network")
	t.Setenv("CORS_ALLOWED_ORIGINS", "https://app.example.test/path")

	if _, err := LoadValidated(); err == nil {
		t.Fatal("LoadValidated accepted invalid explicit configuration")
	}
}

func TestLoadValidatedRejectsOneSidedTimeoutMismatch(t *testing.T) {
	tests := []struct {
		name  string
		key   string
		value string
	}{
		{name: "write below default request", key: "WRITE_TIMEOUT", value: "1s"},
		{name: "request above default write", key: "REQUEST_TIMEOUT", value: "40s"},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			t.Setenv("APP_ENV", "development")
			t.Setenv(test.key, test.value)
			otherKey := "REQUEST_TIMEOUT"
			if test.key == otherKey {
				otherKey = "WRITE_TIMEOUT"
			}
			original, wasSet := os.LookupEnv(otherKey)
			if err := os.Unsetenv(otherKey); err != nil {
				t.Fatalf("unset %s: %v", otherKey, err)
			}
			t.Cleanup(func() {
				if wasSet {
					if err := os.Setenv(otherKey, original); err != nil {
						t.Errorf("restore %s: %v", otherKey, err)
					}
					return
				}
				if err := os.Unsetenv(otherKey); err != nil {
					t.Errorf("clear %s: %v", otherKey, err)
				}
			})

			_, err := LoadValidated()
			if err == nil || !strings.Contains(err.Error(), "WRITE_TIMEOUT must be greater than REQUEST_TIMEOUT") {
				t.Fatalf("LoadValidated() error = %v, want timeout ordering error", err)
			}
		})
	}
}

func TestLoadValidatedAcceptsSafeConfiguration(t *testing.T) {
	t.Setenv("APP_ENV", "development")
	t.Setenv("SERVER_PORT", "8088")
	t.Setenv("MAX_BODY_BYTES", "2097152")
	t.Setenv("REQUEST_TIMEOUT", "20s")
	t.Setenv("WRITE_TIMEOUT", "25s")
	t.Setenv("CORS_ALLOWED_ORIGINS", "https://app.example.test")
	t.Setenv("TRUSTED_PROXIES", "10.0.0.0/8,127.0.0.1")

	cfg, err := LoadValidated()
	if err != nil {
		t.Fatalf("LoadValidated: %v", err)
	}
	if cfg.ServerPort != 8088 || cfg.MaxBodyBytes != 2097152 {
		t.Fatalf("unexpected validated config: %#v", cfg)
	}
}

func TestLoadValidatedRequiresExplicitProductionCORSOrigins(t *testing.T) {
	t.Run("absent", func(t *testing.T) {
		t.Setenv("APP_ENV", "production")
		original, wasSet := os.LookupEnv("CORS_ALLOWED_ORIGINS")
		if err := os.Unsetenv("CORS_ALLOWED_ORIGINS"); err != nil {
			t.Fatalf("unset CORS_ALLOWED_ORIGINS: %v", err)
		}
		t.Cleanup(func() {
			if wasSet {
				if err := os.Setenv("CORS_ALLOWED_ORIGINS", original); err != nil {
					t.Errorf("restore CORS_ALLOWED_ORIGINS: %v", err)
				}
				return
			}
			if err := os.Unsetenv("CORS_ALLOWED_ORIGINS"); err != nil {
				t.Errorf("clear CORS_ALLOWED_ORIGINS: %v", err)
			}
		})

		if origins := Load().AllowedOrigins; len(origins) != 0 {
			t.Fatalf("production AllowedOrigins = %#v, must not inherit development localhost origins", origins)
		}
		if _, err := LoadValidated(); err == nil ||
			!strings.Contains(err.Error(), "CORS_ALLOWED_ORIGINS must contain at least one explicit origin") {
			t.Fatalf("LoadValidated() error = %v, want missing production CORS allowlist error", err)
		}
	})

	t.Run("empty", func(t *testing.T) {
		t.Setenv("APP_ENV", "production")
		t.Setenv("CORS_ALLOWED_ORIGINS", " , ")

		if origins := Load().AllowedOrigins; len(origins) != 0 {
			t.Fatalf("production AllowedOrigins = %#v, want empty explicit allowlist", origins)
		}
		if _, err := LoadValidated(); err == nil ||
			!strings.Contains(err.Error(), "CORS_ALLOWED_ORIGINS must contain at least one explicit origin") {
			t.Fatalf("LoadValidated() error = %v, want empty production CORS allowlist error", err)
		}
	})
}

func TestLoadValidatedPreservesExplicitProductionCORSOrigins(t *testing.T) {
	t.Setenv("APP_ENV", " PRODUCTION ")
	t.Setenv("CORS_ALLOWED_ORIGINS", "https://money.example.test, https://admin.example.test")
	t.Setenv("MONGO_URI", "mongodb://mongo.internal:27017/?replicaSet=rs0")

	cfg, err := LoadValidated()
	if err != nil {
		t.Fatalf("LoadValidated() error = %v", err)
	}
	if cfg.AppEnv != "production" {
		t.Fatalf("AppEnv = %q, want normalized production", cfg.AppEnv)
	}
	want := []string{"https://money.example.test", "https://admin.example.test"}
	if !slices.Equal(cfg.AllowedOrigins, want) {
		t.Fatalf("AllowedOrigins = %#v, want %#v", cfg.AllowedOrigins, want)
	}
}

func TestLoadValidatedRejectsUnknownEnvironment(t *testing.T) {
	t.Setenv("APP_ENV", "prod")
	t.Setenv("CORS_ALLOWED_ORIGINS", "https://money.example.test")

	_, err := LoadValidated()
	if err == nil || !strings.Contains(err.Error(), "APP_ENV must be one of") {
		t.Fatalf("LoadValidated() error = %v, want APP_ENV allowlist error", err)
	}
}

func TestLoadValidatedRequiresExplicitEnvironment(t *testing.T) {
	original, wasSet := os.LookupEnv("APP_ENV")
	if err := os.Unsetenv("APP_ENV"); err != nil {
		t.Fatalf("unset APP_ENV: %v", err)
	}
	t.Cleanup(func() {
		if wasSet {
			if err := os.Setenv("APP_ENV", original); err != nil {
				t.Errorf("restore APP_ENV: %v", err)
			}
			return
		}
		if err := os.Unsetenv("APP_ENV"); err != nil {
			t.Errorf("clear APP_ENV: %v", err)
		}
	})

	_, err := LoadValidated()
	if err == nil || !strings.Contains(err.Error(), "APP_ENV must be explicitly configured") {
		t.Fatalf("LoadValidated() error = %v, want explicit APP_ENV error", err)
	}
}

func TestLoadValidatedTreatsStagingAsDeployed(t *testing.T) {
	t.Setenv("APP_ENV", "staging")
	original, wasSet := os.LookupEnv("CORS_ALLOWED_ORIGINS")
	if err := os.Unsetenv("CORS_ALLOWED_ORIGINS"); err != nil {
		t.Fatalf("unset CORS_ALLOWED_ORIGINS: %v", err)
	}
	t.Cleanup(func() {
		if wasSet {
			if err := os.Setenv("CORS_ALLOWED_ORIGINS", original); err != nil {
				t.Errorf("restore CORS_ALLOWED_ORIGINS: %v", err)
			}
			return
		}
		if err := os.Unsetenv("CORS_ALLOWED_ORIGINS"); err != nil {
			t.Errorf("clear CORS_ALLOWED_ORIGINS: %v", err)
		}
	})

	if origins := Load().AllowedOrigins; len(origins) != 0 {
		t.Fatalf("staging AllowedOrigins = %#v, must not inherit localhost origins", origins)
	}
	_, err := LoadValidated()
	if err == nil || !strings.Contains(err.Error(), "APP_ENV=staging") {
		t.Fatalf("LoadValidated() error = %v, want explicit staging CORS error", err)
	}
}

func TestLoadValidatedRejectsUnsafeOperationalConfiguration(t *testing.T) {
	t.Setenv("APP_ENV", "production")
	t.Setenv("CORS_ALLOWED_ORIGINS", "https://money.example.test")
	t.Setenv("MONGO_URI", "")
	t.Setenv("SESSION_TTL", "8761h")
	t.Setenv("TRUSTED_PROXIES", "0.0.0.0/0,::/0")

	_, err := LoadValidated()
	if err == nil {
		t.Fatal("LoadValidated accepted unsafe production configuration")
	}
	for _, expected := range []string{
		"MONGO_URI must be explicitly configured",
		"SESSION_TTL must be a positive duration no greater than",
		"TRUSTED_PROXIES must not trust every address",
	} {
		if !strings.Contains(err.Error(), expected) {
			t.Errorf("LoadValidated() error = %v, want %q", err, expected)
		}
	}
}
