package config

import (
	"net"
	"os"
	"strconv"
	"strings"
	"time"
)

const (
	defaultMaxBodyBytes   = int64(1 << 20)
	maximumBodyBytes      = int64(16 << 20)
	defaultMaxHeaderBytes = 1 << 20
	maximumHeaderBytes    = 1 << 20
	defaultAllowedOrigins = "http://localhost:3000,http://localhost:8081,http://localhost:5173,http://127.0.0.1:5173"
)

type Config struct {
	AppEnv            string
	ServerHost        string
	ServerPort        int
	ReadHeaderTimeout time.Duration
	ReadTimeout       time.Duration
	WriteTimeout      time.Duration
	IdleTimeout       time.Duration
	RequestTimeout    time.Duration
	ShutdownTimeout   time.Duration
	SessionTTL        time.Duration
	MaxBodyBytes      int64
	MaxHeaderBytes    int
	AllowedOrigins    []string
	TrustedProxies    []string

	MongoURI      string
	MongoDatabase string
}

func Load() Config {
	appEnv := strings.ToLower(strings.TrimSpace(getString("APP_ENV", "development")))
	if appEnv == "" {
		appEnv = "development"
	}
	allowedOriginsFallback := defaultAllowedOrigins
	if appEnv == "staging" || appEnv == "production" {
		// Deployed origins must be an explicit deployment decision. The
		// development localhost allowlist must never leak into a deployed
		// environment merely because CORS_ALLOWED_ORIGINS was omitted.
		allowedOriginsFallback = ""
	}
	cfg := Config{
		AppEnv:            appEnv,
		ServerHost:        getString("SERVER_HOST", "0.0.0.0"),
		ServerPort:        getIntRange("SERVER_PORT", 8080, 1, 65535),
		ReadHeaderTimeout: getDuration("READ_HEADER_TIMEOUT", 5*time.Second),
		ReadTimeout:       getDuration("READ_TIMEOUT", 10*time.Second),
		WriteTimeout:      getDuration("WRITE_TIMEOUT", 35*time.Second),
		IdleTimeout:       getDuration("IDLE_TIMEOUT", 60*time.Second),
		RequestTimeout:    getDuration("REQUEST_TIMEOUT", 30*time.Second),
		ShutdownTimeout:   getDuration("SHUTDOWN_TIMEOUT", 10*time.Second),
		SessionTTL:        getDuration("SESSION_TTL", 30*24*time.Hour),
		MaxBodyBytes:      getInt64Range("MAX_BODY_BYTES", defaultMaxBodyBytes, 1, maximumBodyBytes),
		MaxHeaderBytes:    getIntRange("MAX_HEADER_BYTES", defaultMaxHeaderBytes, 1, maximumHeaderBytes),
		AllowedOrigins:    getCSV("CORS_ALLOWED_ORIGINS", allowedOriginsFallback),
		TrustedProxies:    getCSV("TRUSTED_PROXIES", ""),

		MongoURI:      getString("MONGO_URI", "mongodb://localhost:27017/?replicaSet=rs0"),
		MongoDatabase: getString("MONGO_DB", "moneytracking"),
	}
	if cfg.WriteTimeout <= cfg.RequestTimeout {
		const responseMargin = 5 * time.Second
		if cfg.RequestTimeout > time.Duration(1<<63-1)-responseMargin {
			cfg.RequestTimeout = 30 * time.Second
			cfg.WriteTimeout = 35 * time.Second
		} else {
			cfg.WriteTimeout = cfg.RequestTimeout + responseMargin
		}
	}
	return cfg
}

func getCSV(key, fallback string) []string {
	raw, ok := os.LookupEnv(key)
	if !ok {
		raw = fallback
	}
	values := make([]string, 0, strings.Count(raw, ",")+1)
	seen := make(map[string]struct{})
	for _, item := range strings.Split(raw, ",") {
		if value := strings.TrimSpace(item); value != "" {
			if _, exists := seen[value]; exists {
				continue
			}
			seen[value] = struct{}{}
			values = append(values, value)
		}
	}
	return values
}

func (c Config) Address() string {
	return net.JoinHostPort(c.ServerHost, strconv.Itoa(c.ServerPort))
}

func getString(key, defaultValue string) string {
	if value, ok := os.LookupEnv(key); ok && value != "" {
		return value
	}

	return defaultValue
}

func getInt(key string, defaultValue int) int {
	raw, ok := os.LookupEnv(key)
	if !ok || raw == "" {
		return defaultValue
	}

	parsed, err := strconv.Atoi(raw)
	if err != nil || parsed <= 0 {
		return defaultValue
	}

	return parsed
}

func getIntRange(key string, defaultValue, minimum, maximum int) int {
	value := getInt(key, defaultValue)
	if value < minimum || value > maximum {
		return defaultValue
	}
	return value
}

func getInt64Range(key string, defaultValue, minimum, maximum int64) int64 {
	raw, ok := os.LookupEnv(key)
	if !ok || raw == "" {
		return defaultValue
	}

	parsed, err := strconv.ParseInt(raw, 10, 64)
	if err != nil || parsed < minimum || parsed > maximum {
		return defaultValue
	}

	return parsed
}

func getDuration(key string, defaultValue time.Duration) time.Duration {
	raw, ok := os.LookupEnv(key)
	if !ok || raw == "" {
		return defaultValue
	}

	parsed, err := time.ParseDuration(raw)
	if err != nil || parsed <= 0 {
		return defaultValue
	}

	return parsed
}
