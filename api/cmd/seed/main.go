package main

import (
	"context"
	"log"
	"os"
	"strings"
	"time"

	"github.com/d4rkNinja/moneytracking-ledgerly-api/internal/config"
	"github.com/d4rkNinja/moneytracking-ledgerly-api/internal/db"
	"github.com/d4rkNinja/moneytracking-ledgerly-api/internal/repository"
	"github.com/d4rkNinja/moneytracking-ledgerly-api/internal/service"
)

func main() {
	rawEnvironment, explicitlyConfigured := os.LookupEnv("APP_ENV")
	if !explicitlyConfigured || strings.ToLower(strings.TrimSpace(rawEnvironment)) != "development" {
		log.Fatal("development seed requires an explicit APP_ENV=development")
	}
	cfg, err := config.LoadValidated()
	if err != nil {
		log.Fatalf("invalid configuration: %v", err)
	}
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	client, err := db.NewClient(ctx, cfg)
	if err != nil {
		log.Fatalf("connect MongoDB: %v", err)
	}
	defer func() {
		cleanupCtx, cancelCleanup := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancelCleanup()
		if err := client.Disconnect(cleanupCtx); err != nil {
			log.Printf("disconnect MongoDB: %v", err)
		}
	}()
	store := repository.NewMongoStore(client.Client, client.Database)
	if err := service.SeedDevelopment(ctx, store); err != nil {
		log.Fatalf("seed development data: %v", err)
	}
	log.New(os.Stdout, "[seed] ", 0).Println("development data is ready; login as ananya@example.test with MoneyTracking!2026")
}
