package config

import (
	"errors"
	"fmt"
	"net/netip"
	"net/url"
	"os"
	"strconv"
	"strings"
	"time"
)

// LoadValidated loads configuration and rejects explicitly invalid values.
// Load remains available for deterministic unit construction, while binaries
// use this function so configuration mistakes fail fast at startup.
func LoadValidated() (Config, error) {
	cfg := Load()
	var validationErrors []error

	rawAppEnvironment, appEnvironmentConfigured := os.LookupEnv("APP_ENV")
	if !appEnvironmentConfigured || strings.TrimSpace(rawAppEnvironment) == "" {
		validationErrors = append(validationErrors, errors.New("APP_ENV must be explicitly configured"))
	}
	switch cfg.AppEnv {
	case "development", "test", "staging", "production":
	default:
		validationErrors = append(
			validationErrors,
			fmt.Errorf("APP_ENV must be one of development, test, staging, or production; got %q", cfg.AppEnv),
		)
	}

	validateExplicitInt := func(key string, minimum, maximum int64) {
		raw, present := os.LookupEnv(key)
		if !present {
			return
		}
		value, err := strconv.ParseInt(strings.TrimSpace(raw), 10, 64)
		if err != nil || value < minimum || value > maximum {
			validationErrors = append(validationErrors, fmt.Errorf(
				"%s must be an integer between %d and %d", key, minimum, maximum,
			))
		}
	}
	validateExplicitDuration := func(key string, maximum time.Duration) {
		raw, present := os.LookupEnv(key)
		if !present {
			return
		}
		value, err := time.ParseDuration(strings.TrimSpace(raw))
		if err != nil || value <= 0 || value > maximum {
			validationErrors = append(
				validationErrors,
				fmt.Errorf("%s must be a positive duration no greater than %s", key, maximum),
			)
		}
	}

	validateExplicitInt("SERVER_PORT", 1, 65535)
	validateExplicitInt("MAX_BODY_BYTES", 1, maximumBodyBytes)
	validateExplicitInt("MAX_HEADER_BYTES", 1, maximumHeaderBytes)
	for _, duration := range []struct {
		key     string
		maximum time.Duration
	}{
		{key: "READ_HEADER_TIMEOUT", maximum: 30 * time.Second},
		{key: "READ_TIMEOUT", maximum: 5 * time.Minute},
		{key: "WRITE_TIMEOUT", maximum: 10 * time.Minute},
		{key: "IDLE_TIMEOUT", maximum: 10 * time.Minute},
		{key: "REQUEST_TIMEOUT", maximum: 5 * time.Minute},
		{key: "SHUTDOWN_TIMEOUT", maximum: 2 * time.Minute},
		{key: "SESSION_TTL", maximum: 365 * 24 * time.Hour},
	} {
		validateExplicitDuration(duration.key, duration.maximum)
	}

	requestRaw, requestSet := os.LookupEnv("REQUEST_TIMEOUT")
	writeRaw, writeSet := os.LookupEnv("WRITE_TIMEOUT")
	if requestSet || writeSet {
		if !requestSet {
			requestRaw = (30 * time.Second).String()
		}
		if !writeSet {
			writeRaw = (35 * time.Second).String()
		}
		requestTimeout, requestErr := time.ParseDuration(strings.TrimSpace(requestRaw))
		writeTimeout, writeErr := time.ParseDuration(strings.TrimSpace(writeRaw))
		if requestErr == nil && writeErr == nil && writeTimeout <= requestTimeout {
			validationErrors = append(validationErrors, errors.New("WRITE_TIMEOUT must be greater than REQUEST_TIMEOUT"))
		}
	}

	if (cfg.AppEnv == "staging" || cfg.AppEnv == "production") && len(cfg.AllowedOrigins) == 0 {
		validationErrors = append(
			validationErrors,
			fmt.Errorf("CORS_ALLOWED_ORIGINS must contain at least one explicit origin when APP_ENV=%s", cfg.AppEnv),
		)
	}
	if cfg.AppEnv == "staging" || cfg.AppEnv == "production" {
		mongoURI, explicitlyConfigured := os.LookupEnv("MONGO_URI")
		if !explicitlyConfigured || strings.TrimSpace(mongoURI) == "" {
			validationErrors = append(
				validationErrors,
				fmt.Errorf("MONGO_URI must be explicitly configured when APP_ENV=%s", cfg.AppEnv),
			)
		}
	}
	for _, origin := range cfg.AllowedOrigins {
		if origin == "*" {
			continue
		}
		parsed, err := url.Parse(origin)
		if err != nil || (parsed.Scheme != "http" && parsed.Scheme != "https" && parsed.Scheme != "capacitor" && parsed.Scheme != "ionic" && parsed.Scheme != "file") ||
			parsed.Host == "" || parsed.User != nil || parsed.Path != "" ||
			parsed.RawQuery != "" || parsed.Fragment != "" {
			validationErrors = append(validationErrors, fmt.Errorf("CORS_ALLOWED_ORIGINS contains invalid origin %q", origin))
		}
	}
	for _, proxy := range cfg.TrustedProxies {
		if prefix, err := netip.ParsePrefix(proxy); err == nil {
			if prefix.Bits() == 0 {
				validationErrors = append(validationErrors, fmt.Errorf("TRUSTED_PROXIES must not trust every address via %q", proxy))
			}
		} else {
			if _, addressErr := netip.ParseAddr(proxy); addressErr != nil {
				validationErrors = append(validationErrors, fmt.Errorf("TRUSTED_PROXIES contains invalid address or CIDR %q", proxy))
			}
		}
	}

	if len(validationErrors) > 0 {
		return Config{}, errors.Join(validationErrors...)
	}
	return cfg, nil
}
