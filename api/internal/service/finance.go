package service

import "github.com/d4rkNinja/moneytracking-ledgerly-api/internal/repository"

type FinanceService struct {
	store  repository.Store
	access *AccessService
}

func NewFinanceService(store repository.Store, access *AccessService) *FinanceService {
	return &FinanceService{store: store, access: access}
}
