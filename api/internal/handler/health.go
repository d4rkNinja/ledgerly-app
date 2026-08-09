package handler

import (
	"log"
	"net/http"

	"github.com/d4rkNinja/moneytracking-ledgerly-api/internal/db"
)

type HealthHandler struct {
	mongo  *db.MongoClient
	logger *log.Logger
}

func NewHealthHandler(mongoClient *db.MongoClient, logger *log.Logger) *HealthHandler {
	return &HealthHandler{
		mongo:  mongoClient,
		logger: logger,
	}
}

func (h *HealthHandler) Liveness(w http.ResponseWriter, r *http.Request) {
	response := map[string]string{
		"status": "ok",
	}
	writeJSON(w, http.StatusOK, response)
}

func (h *HealthHandler) Readiness(w http.ResponseWriter, r *http.Request) {
	if err := h.mongo.Ping(r.Context()); err != nil {
		h.logger.Printf("readiness probe failed: %v", err)
		writeError(w, http.StatusServiceUnavailable, "service_unavailable", "service not ready", nil)
		return
	}

	writeJSON(w, http.StatusOK, map[string]string{
		"status": "ready",
	})
}
