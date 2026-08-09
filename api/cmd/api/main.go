package main

import (
	"context"
	"errors"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"

	"github.com/d4rkNinja/moneytracking-ledgerly-api/internal/config"
	"github.com/d4rkNinja/moneytracking-ledgerly-api/internal/db"
	apiHandler "github.com/d4rkNinja/moneytracking-ledgerly-api/internal/handler"
	"github.com/d4rkNinja/moneytracking-ledgerly-api/internal/repository"
	"github.com/d4rkNinja/moneytracking-ledgerly-api/internal/router"
	"github.com/d4rkNinja/moneytracking-ledgerly-api/internal/service"
)

func main() {
	logger := log.New(os.Stdout, "[moneytracking] ", log.LstdFlags|log.Lshortfile)
	cfg, err := config.LoadValidated()
	if err != nil {
		logger.Printf("invalid configuration: %v", err)
		os.Exit(1)
	}
	logger.Printf("environment: %s", cfg.AppEnv)

	if err := run(cfg, logger); err != nil {
		logger.Printf("API server stopped with error: %v", err)
		os.Exit(1)
	}
}

func run(cfg config.Config, logger *log.Logger) error {
	signalCtx, stopSignals := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stopSignals()

	mongoClient, err := db.NewClient(signalCtx, cfg)
	if err != nil {
		return fmt.Errorf("failed to connect to MongoDB: %w", err)
	}

	store := repository.NewMongoStore(mongoClient.Client, mongoClient.Database)
	authService := service.NewAuthService(store, cfg.SessionTTL)
	accessService := service.NewAccessService(store)
	financeService := service.NewFinanceService(store, accessService)
	api := apiHandler.NewAPI(authService, financeService, logger, cfg.MaxBodyBytes)
	healthHandler := apiHandler.NewHealthHandler(mongoClient, logger)

	r := router.NewWithOptions(api, healthHandler, router.Options{
		AllowedOrigins: cfg.AllowedOrigins,
		TrustedProxies: cfg.TrustedProxies,
		RequestTimeout: cfg.RequestTimeout,
		Logger:         logger,
	})

	server := &http.Server{
		Addr:              cfg.Address(),
		Handler:           r,
		ReadHeaderTimeout: cfg.ReadHeaderTimeout,
		ReadTimeout:       cfg.ReadTimeout,
		WriteTimeout:      cfg.WriteTimeout,
		IdleTimeout:       cfg.IdleTimeout,
		MaxHeaderBytes:    cfg.MaxHeaderBytes,
	}

	serverErr := make(chan error, 1)
	go func() {
		logger.Printf("API server listening on %s", cfg.Address())
		serverErr <- server.ListenAndServe()
	}()

	var runErr error
	shutdownRequired := false
	select {
	case err := <-serverErr:
		if err != nil && !errors.Is(err, http.ErrServerClosed) {
			runErr = fmt.Errorf("server crashed: %w", err)
		}
	case <-signalCtx.Done():
		shutdownRequired = true
		logger.Println("shutdown signal received")
	}

	if shutdownRequired {
		shutdownCtx, cancelShutdown := context.WithTimeout(context.Background(), cfg.ShutdownTimeout)
		if err := server.Shutdown(shutdownCtx); err != nil {
			runErr = errors.Join(runErr, fmt.Errorf("server shutdown failed: %w", err))
			if closeErr := server.Close(); closeErr != nil {
				runErr = errors.Join(runErr, fmt.Errorf("force server close failed: %w", closeErr))
			}
		}
		cancelShutdown()
	}

	disconnectCtx, cancelDisconnect := context.WithTimeout(context.Background(), cfg.ShutdownTimeout)
	if err := mongoClient.Disconnect(disconnectCtx); err != nil {
		runErr = errors.Join(runErr, fmt.Errorf("mongo disconnect failed: %w", err))
	}
	cancelDisconnect()

	if runErr == nil {
		logger.Println("graceful shutdown complete")
	}
	return runErr
}
