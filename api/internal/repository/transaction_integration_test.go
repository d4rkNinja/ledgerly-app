package repository

import (
	"context"
	"errors"
	"os"
	"testing"
	"time"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
	"go.mongodb.org/mongo-driver/mongo/readpref"

	"github.com/d4rkNinja/moneytracking-ledgerly-api/internal/model"
)

func mongoTestStore(t *testing.T) (*MongoStore, *mongo.Database) {
	t.Helper()
	uri := os.Getenv("MONGO_TEST_URI")
	if uri == "" {
		t.Skip("MONGO_TEST_URI is not set; skipping replica-set integration test")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	client, err := mongo.Connect(ctx, options.Client().ApplyURI(uri))
	if err != nil {
		t.Fatalf("connect to MONGO_TEST_URI: %v", err)
	}
	if err := client.Ping(ctx, readpref.Primary()); err != nil {
		_ = client.Disconnect(context.Background())
		t.Fatalf("ping MONGO_TEST_URI primary: %v", err)
	}
	database := client.Database("ledgerly_repository_test_" + primitive.NewObjectID().Hex())
	t.Cleanup(func() {
		cleanupCtx, cleanupCancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cleanupCancel()
		if err := database.Drop(cleanupCtx); err != nil {
			t.Errorf("drop integration database: %v", err)
		}
		if err := client.Disconnect(cleanupCtx); err != nil {
			t.Errorf("disconnect integration client: %v", err)
		}
	})
	return NewMongoStore(client, database), database
}

func TestCreateFinancialTransactionIdempotencyRevisionAndRollbackIntegration(t *testing.T) {
	store, database := mongoTestStore(t)
	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()
	now := time.Date(2026, time.August, 12, 10, 0, 0, 0, time.UTC)
	workspace := model.Workspace{ID: "workspace-a", Currency: "INR", LedgerVersion: 0, CreatedAt: now, UpdatedAt: now}
	vault := model.Vault{ID: "vault-a", WorkspaceID: workspace.ID, OwnerID: "user-a", Currency: "INR", BalanceMinor: 1000, Privacy: "workspace", CreatedAt: now, UpdatedAt: now}
	account := model.Account{ID: "account-a", WorkspaceID: workspace.ID, VaultID: vault.ID, OwnerID: "user-a", Currency: "INR", BalanceMinor: 1000, Privacy: "workspace", CreatedAt: now, UpdatedAt: now}
	if _, err := database.Collection(workspacesCollection).InsertOne(ctx, workspace); err != nil {
		t.Fatal(err)
	}
	if _, err := database.Collection(vaultsCollection).InsertOne(ctx, vault); err != nil {
		t.Fatal(err)
	}
	if _, err := database.Collection(accountsCollection).InsertOne(ctx, account); err != nil {
		t.Fatal(err)
	}

	transaction := &model.Transaction{
		ID: "transaction-a", WorkspaceID: workspace.ID, TransactionID: "0001", SequenceScope: model.TransactionSequenceExpense,
		VaultID: vault.ID, AccountID: account.ID, CreatedBy: "user-a", Type: "expense", AmountMinor: 100,
		Currency: "INR", Privacy: "workspace", OccurredAt: now, CreatedAt: now, UpdatedAt: now,
	}
	audit := &model.AuditEvent{
		ID: "audit-a", WorkspaceID: workspace.ID, ActorID: "user-a", Action: "transaction.created",
		EntityType: "transaction", EntityID: transaction.ID, Metadata: map[string]any{"type": "expense"}, CreatedAt: now,
	}
	created, err := store.CreateFinancialTransaction(ctx, transaction, "idempotency-key-a", &now, audit)
	if err != nil {
		t.Fatalf("CreateFinancialTransaction: %v", err)
	}
	retry := *transaction
	retry.ID = "retry-generated-id"
	replayed, err := store.CreateFinancialTransaction(ctx, &retry, "idempotency-key-a", &now, &model.AuditEvent{ID: "retry-audit"})
	if err != nil {
		t.Fatalf("idempotent retry: %v", err)
	}
	if replayed.ID != created.ID || replayed.ID != "transaction-a" {
		t.Fatalf("replayed transaction ID = %q, want first committed ID", replayed.ID)
	}

	var committedWorkspace model.Workspace
	if err := database.Collection(workspacesCollection).FindOne(ctx, bson.M{"_id": workspace.ID}).Decode(&committedWorkspace); err != nil {
		t.Fatal(err)
	}
	if committedWorkspace.LedgerVersion != 1 {
		t.Fatalf("ledger version = %d, want 1", committedWorkspace.LedgerVersion)
	}
	var committedAudit model.AuditEvent
	if err := database.Collection(auditEventsCollection).FindOne(ctx, bson.M{"_id": audit.ID}).Decode(&committedAudit); err != nil {
		t.Fatal(err)
	}
	if committedAudit.LedgerVersion != 1 || committedAudit.Before != nil || committedAudit.After == nil || committedAudit.After.ID != transaction.ID {
		t.Fatalf("committed revision = %#v", committedAudit)
	}
	assertMongoCount(t, ctx, database, transactionsCollection, bson.M{}, 1)
	assertMongoCount(t, ctx, database, idempotencyCollection, bson.M{}, 1)
	assertMongoCount(t, ctx, database, auditEventsCollection, bson.M{}, 1)
	assertMongoBalance(t, ctx, database, accountsCollection, account.ID, 900)
	assertMongoBalance(t, ctx, database, vaultsCollection, vault.ID, 900)

	const blockingAuditID = "audit-collision"
	if _, err := database.Collection(auditEventsCollection).InsertOne(ctx, bson.M{"_id": blockingAuditID, "workspace_id": workspace.ID}); err != nil {
		t.Fatal(err)
	}
	failingTransaction := &model.Transaction{
		ID: "transaction-b", WorkspaceID: workspace.ID, TransactionID: "0002", SequenceScope: model.TransactionSequenceExpense,
		VaultID: vault.ID, AccountID: account.ID, CreatedBy: "user-a", Type: "expense", AmountMinor: 50,
		Currency: "INR", Privacy: "workspace", OccurredAt: now.Add(time.Hour), CreatedAt: now.Add(time.Hour), UpdatedAt: now.Add(time.Hour),
	}
	failingAudit := &model.AuditEvent{
		ID: blockingAuditID, WorkspaceID: workspace.ID, ActorID: "user-a", Action: "transaction.created",
		EntityType: "transaction", EntityID: failingTransaction.ID, Metadata: map[string]any{"type": "expense"}, CreatedAt: now.Add(time.Hour),
	}
	failedOccurredAt := failingTransaction.OccurredAt
	if _, err := store.CreateFinancialTransaction(ctx, failingTransaction, "idempotency-key-b", &failedOccurredAt, failingAudit); !errors.Is(err, ErrConflict) {
		t.Fatalf("failed atomic create error = %v, want conflict", err)
	}

	if err := database.Collection(workspacesCollection).FindOne(ctx, bson.M{"_id": workspace.ID}).Decode(&committedWorkspace); err != nil {
		t.Fatal(err)
	}
	if committedWorkspace.LedgerVersion != 1 {
		t.Fatalf("ledger version after rollback = %d, want 1", committedWorkspace.LedgerVersion)
	}
	assertMongoCount(t, ctx, database, transactionsCollection, bson.M{}, 1)
	assertMongoCount(t, ctx, database, idempotencyCollection, bson.M{}, 1)
	assertMongoCount(t, ctx, database, auditEventsCollection, bson.M{}, 2)
	assertMongoBalance(t, ctx, database, accountsCollection, account.ID, 900)
	assertMongoBalance(t, ctx, database, vaultsCollection, vault.ID, 900)
	var sequence model.TransactionSequence
	if err := database.Collection(transactionSequencesCollection).FindOne(ctx, bson.M{"_id": transactionSequenceDocumentID(workspace.ID, model.TransactionSequenceExpense)}).Decode(&sequence); err != nil {
		t.Fatal(err)
	}
	if sequence.NextNumber != 2 {
		t.Fatalf("sequence next number after rollback = %d, want 2", sequence.NextNumber)
	}
}

func assertMongoCount(t *testing.T, ctx context.Context, database *mongo.Database, collection string, filter bson.M, want int64) {
	t.Helper()
	got, err := database.Collection(collection).CountDocuments(ctx, filter)
	if err != nil {
		t.Fatal(err)
	}
	if got != want {
		t.Fatalf("%s count = %d, want %d", collection, got, want)
	}
}

func assertMongoBalance(t *testing.T, ctx context.Context, database *mongo.Database, collection, id string, want int64) {
	t.Helper()
	var record struct {
		BalanceMinor int64 `bson:"balance_minor"`
	}
	if err := database.Collection(collection).FindOne(ctx, bson.M{"_id": id}).Decode(&record); err != nil {
		t.Fatal(err)
	}
	if record.BalanceMinor != want {
		t.Fatalf("%s %s balance = %d, want %d", collection, id, record.BalanceMinor, want)
	}
}
