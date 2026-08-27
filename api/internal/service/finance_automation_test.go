package service

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"reflect"
	"strings"
	"testing"
	"time"

	"github.com/d4rkNinja/moneytracking-ledgerly-api/internal/model"
	"github.com/d4rkNinja/moneytracking-ledgerly-api/internal/repository"
)

// ---------------------------------------------------------------------------
// In-memory Store double with a small MongoDB-filter evaluator. It supports
// exactly the operator vocabulary the service layer emits: equality, $in,
// $exists, $ne, comparison operators, $or, and $and.
// ---------------------------------------------------------------------------

type automationTestStore struct {
	memberships     map[string]model.Membership
	workspaces      map[string]model.Workspace
	vaults          []model.Vault
	accounts        []model.Account
	transactions    []model.Transaction
	importSessions  []model.ImportSession
	rules           []model.AutomationRule
	reconciliations []model.AccountReconciliation
	bills           []model.Bill
	contacts        []model.Contact
	audits          []model.AuditEvent
	dismissals      []recurringDismissalRecord

	createdKeys  []string
	failNextFind error
}

type recurringDismissalRecord = recurringDismissalRow

func (s *automationTestStore) collectionDocuments(collection string) []reflect.Value {
	switch collection {
	case "vaults":
		return valuesOf(s.vaults)
	case "accounts":
		return valuesOf(s.accounts)
	case "transactions":
		return valuesOf(s.transactions)
	case "import_sessions":
		return valuesOf(s.importSessions)
	case "automation_rules":
		return valuesOf(s.rules)
	case "account_reconciliations":
		return valuesOf(s.reconciliations)
	case "recurring_transactions":
		return valuesOf(s.bills)
	case "contacts":
		return valuesOf(s.contacts)
	case "audit_events":
		return valuesOf(s.audits)
	case "recurring_dismissals":
		return valuesOf(s.dismissals)
	}
	return nil
}
func valuesOf[T any](items []T) []reflect.Value {
	out := make([]reflect.Value, 0, len(items))
	for index := range items {
		out = append(out, reflect.ValueOf(&items[index]).Elem())
	}
	return out
}

func (s *automationTestStore) Insert(_ context.Context, collection string, document any) error {
	switch collection {
	case "import_sessions":
		s.importSessions = append(s.importSessions, *(document.(*model.ImportSession)))
	case "automation_rules":
		s.rules = append(s.rules, *(document.(*model.AutomationRule)))
	case "account_reconciliations":
		s.reconciliations = append(s.reconciliations, *(document.(*model.AccountReconciliation)))
	case "audit_events":
		s.audits = append(s.audits, *(document.(*model.AuditEvent)))
	case "recurring_transactions":
		s.bills = append(s.bills, *(document.(*model.Bill)))
	case "recurring_dismissals":
		doc := document.(map[string]any)
		s.dismissals = append(s.dismissals, recurringDismissalRecord{
			ID:          asString(doc["_id"]),
			WorkspaceID: asString(doc["workspace_id"]),
			Signature:   asString(doc["signature"]),
		})
	}
	return nil
}

func (s *automationTestStore) FindOne(_ context.Context, collection string, filter repository.Filter, destination any) error {
	if s.failNextFind != nil {
		err := s.failNextFind
		s.failNextFind = nil
		return err
	}
	if collection == "memberships" {
		key := fmt.Sprintf("%v|%v", filter["workspace_id"], filter["user_id"])
		if membership, ok := s.memberships[key]; ok {
			*destination.(*model.Membership) = membership
			return nil
		}
		return repository.ErrNotFound
	}
	if collection == "workspaces" {
		if workspace, ok := s.workspaces[asString(filter["_id"])]; ok {
			*destination.(*model.Workspace) = workspace
			return nil
		}
		return repository.ErrNotFound
	}
	documents := s.collectionDocuments(collection)
	for index := range documents {
		if matchDocumentFilter(documents[index].Interface(), filter) {
			reflect.ValueOf(destination).Elem().Set(documents[index])
			return nil
		}
	}
	return repository.ErrNotFound
}

func (s *automationTestStore) FindMany(_ context.Context, collection string, filter repository.Filter, destination any, limit int64, _ int64, _ repository.Sort) error {
	if collection == "users" {
		return nil
	}
	documents := s.collectionDocuments(collection)
	matches := reflect.MakeSlice(reflect.ValueOf(destination).Elem().Type(), 0, len(documents))
	count := int64(0)
	for index := range documents {
		if !matchDocumentFilter(documents[index].Interface(), filter) {
			continue
		}
		if limit > 0 && count >= limit {
			break
		}
		matches = reflect.Append(matches, documents[index])
		count++
	}
	reflect.ValueOf(destination).Elem().Set(matches)
	return nil
}

func (s *automationTestStore) UpdateOne(_ context.Context, collection string, filter repository.Filter, update repository.Filter, destination any) error {
	documents := s.collectionDocuments(collection)
	for index := range documents {
		if !matchDocumentFilter(documents[index].Interface(), filter) {
			continue
		}
		applyBsonSet(documents[index], update["$set"])
		if destination != nil {
			reflect.ValueOf(destination).Elem().Set(documents[index])
		}
		return nil
	}
	return repository.ErrNotFound
}

func (s *automationTestStore) UpdateMany(context.Context, string, repository.Filter, repository.Filter) (int64, error) {
	return 0, nil
}

func (s *automationTestStore) DeleteOne(_ context.Context, collection string, filter repository.Filter) error {
	switch collection {
	case "automation_rules":
		remaining := make([]model.AutomationRule, 0, len(s.rules))
		for _, rule := range s.rules {
			value := reflect.New(reflect.TypeOf(rule)).Elem()
			value.Set(reflect.ValueOf(rule))
			if matchDocumentFilter(value.Interface(), filter) {
				continue
			}
			remaining = append(remaining, rule)
		}
		s.rules = remaining
		return nil
	}
	return nil
}

func (s *automationTestStore) Count(_ context.Context, collection string, filter repository.Filter) (int64, error) {
	documents := s.collectionDocuments(collection)
	var count int64
	for index := range documents {
		if matchDocumentFilter(documents[index].Interface(), filter) {
			count++
		}
	}
	return count, nil
}

func (s *automationTestStore) Aggregate(_ context.Context, collection string, pipeline repository.Pipeline, destination any) error {
	match := repository.Filter{}
	for _, stage := range pipeline {
		if clause, ok := stage["$match"]; ok {
			match = clause.(repository.Filter)
		}
		if group, ok := stage["$group"]; ok {
			groupSpec := group.(repository.Filter)
			if asString(groupSpec["_id"]) == "$type" {
				totals := map[string]int64{}
				documents := s.collectionDocuments(collection)
				for index := range documents {
					document := documents[index].Interface()
					if !matchDocumentFilter(document, match) {
						continue
					}
					txType := asString(bsonFieldValue(document, "type"))
					amount := bsonInt64(document, "amount_minor")
					totals[txType] += amount
				}
				output := destination.(*[]transactionTypeTotal)
				for txType, total := range totals {
					*output = append(*output, transactionTypeTotal{Type: txType, Total: total})
				}
				return nil
			}
			if _, hasCount := groupSpec["count"]; hasCount {
				documents := s.collectionDocuments(collection)
				var count int64
				for index := range documents {
					if matchDocumentFilter(documents[index].Interface(), match) {
						count++
					}
				}
				output := reflect.ValueOf(destination).Elem()
				result := reflect.MakeSlice(output.Type(), 0, 1)
				row := reflect.New(output.Type().Elem()).Elem()
				row.FieldByName("Count").SetInt(count)
				result = reflect.Append(result, row)
				output.Set(result)
				return nil
			}
		}
	}
	return nil
}

func (s *automationTestStore) WithTransaction(ctx context.Context, fn repository.TransactionFunc) (any, error) {
	return fn(ctx)
}

func (s *automationTestStore) CreateFinancialTransaction(
	_ context.Context,
	tx *model.Transaction,
	idempotencyKey string,
	_ *time.Time,
	_ *model.AuditEvent,
) (*model.Transaction, error) {
	stored := *tx
	s.transactions = append(s.transactions, stored)
	s.createdKeys = append(s.createdKeys, idempotencyKey)
	return &stored, nil
}

// --- tiny filter evaluator -------------------------------------------------

func matchDocumentFilter(document any, filter repository.Filter) bool {
	for key, condition := range filter {
		switch key {
		case "$or":
			clauses, ok := condition.([]repository.Filter)
			if !ok {
				return false
			}
			anyMatch := false
			for _, clause := range clauses {
				if matchDocumentFilter(document, clause) {
					anyMatch = true
					break
				}
			}
			if !anyMatch {
				return false
			}
		case "$and":
			clauses, ok := condition.([]repository.Filter)
			if !ok {
				return false
			}
			for _, clause := range clauses {
				if !matchDocumentFilter(document, clause) {
					return false
				}
			}
		default:
			if !matchCondition(bsonFieldValue(document, key), condition) {
				return false
			}
		}
	}
	return true
}

func matchCondition(value any, condition any) bool {
	if operators, ok := condition.(repository.Filter); ok {
		for operator, operand := range operators {
			switch operator {
			case "$in":
				items := reflect.ValueOf(operand)
				found := false
				for index := 0; index < items.Len(); index++ {
					if scalarEqual(value, items.Index(index).Interface()) {
						found = true
						break
					}
				}
				if !found {
					return false
				}
			case "$exists":
				want, _ := operand.(bool)
				if present(value) != want {
					return false
				}
			case "$ne":
				if scalarEqual(value, operand) {
					return false
				}
			case "$lt", "$lte", "$gt", "$gte":
				ordering, comparableValues := compareScalars(value, operand)
				if !comparableValues {
					return false
				}
				switch operator {
				case "$lt":
					if !(ordering < 0) {
						return false
					}
				case "$lte":
					if !(ordering <= 0) {
						return false
					}
				case "$gt":
					if !(ordering > 0) {
						return false
					}
				case "$gte":
					if !(ordering >= 0) {
						return false
					}
				}
			default:
				return false
			}
		}
		return true
	}
	return scalarEqual(value, condition)
}

func present(value any) bool {
	if value == nil {
		return false
	}
	reflected := reflect.ValueOf(value)
	switch reflected.Kind() {
	case reflect.Ptr:
		return !reflected.IsNil()
	case reflect.Bool:
		return true
	case reflect.String:
		return reflected.String() != ""
	case reflect.Slice, reflect.Map, reflect.Array:
		return reflected.Len() > 0
	case reflect.Struct:
		if timeValue, ok := value.(time.Time); ok {
			return !timeValue.IsZero()
		}
		return true
	}
	return true
}

func scalarEqual(left, right any) bool {
	leftText, leftOk := asComparableString(left)
	rightText, rightOk := asComparableString(right)
	if leftOk && rightOk {
		return leftText == rightText
	}
	return false
}

func asComparableString(value any) (string, bool) {
	switch typed := value.(type) {
	case string:
		return typed, true
	case int64:
		return fmt.Sprintf("%d", typed), true
	case int:
		return fmt.Sprintf("%d", typed), true
	case bool:
		return fmt.Sprintf("%t", typed), true
	case time.Time:
		return typed.UTC().Format(time.RFC3339Nano), true
	}
	return "", false
}

func compareScalars(left, right any) (int, bool) {
	leftTime, leftIsTime := left.(time.Time)
	rightTime, rightIsTime := right.(time.Time)
	if leftIsTime && rightIsTime {
		switch {
		case leftTime.Before(rightTime):
			return -1, true
		case leftTime.After(rightTime):
			return 1, true
		default:
			return 0, true
		}
	}
	leftNumber, leftIsNumber := left.(int64)
	rightNumber, rightIsNumber := right.(int64)
	if leftIsNumber && rightIsNumber {
		switch {
		case leftNumber < rightNumber:
			return -1, true
		case leftNumber > rightNumber:
			return 1, true
		default:
			return 0, true
		}
	}
	return 0, false
}

func asString(value any) string {
	text, _ := value.(string)
	return text
}

func bsonInt64(document any, field string) int64 {
	value := bsonFieldValue(document, field)
	number, _ := value.(int64)
	return number
}

func bsonFieldValue(document any, field string) any {
	reflected := reflect.ValueOf(document)
	if reflected.Kind() == reflect.Ptr {
		reflected = reflected.Elem()
	}
	if reflected.Kind() != reflect.Struct {
		return nil
	}
	structType := reflected.Type()
	for index := 0; index < structType.NumField(); index++ {
		tag := strings.Split(structType.Field(index).Tag.Get("bson"), ",")[0]
		if tag == field || (tag == "" && structType.Field(index).Name == field) {
			value := reflected.Field(index).Interface()
			// Dereference set pointers so equality checks see the pointed-to
			// value, mirroring how BSON stores the inner document.
			if pointer, ok := value.(reflect.Value); ok {
				value = pointer.Interface()
			}
			if fieldValue := reflect.ValueOf(value); fieldValue.Kind() == reflect.Ptr && !fieldValue.IsNil() {
				return fieldValue.Elem().Interface()
			}
			return value
		}
	}
	return nil
}

func applyBsonSet(target reflect.Value, set any) {
	updates, ok := set.(repository.Filter)
	if !ok {
		return
	}
	targetType := target.Type()
	for fieldIndex := 0; fieldIndex < targetType.NumField(); fieldIndex++ {
		structField := targetType.Field(fieldIndex)
		tag := strings.Split(structField.Tag.Get("bson"), ",")[0]
		value, ok := updates[tag]
		if !ok {
			continue
		}
		field := target.Field(fieldIndex)
		assignBsonValue(field, value)
	}
}

func assignBsonValue(field reflect.Value, value any) {
	if !field.CanSet() {
		return
	}
	valueReflected := reflect.ValueOf(value)
	if !valueReflected.IsValid() {
		return
	}
	if field.Kind() == reflect.Ptr {
		if valueReflected.Type().AssignableTo(field.Type()) {
			field.Set(valueReflected)
			return
		}
		element := reflect.New(field.Type().Elem())
		if valueReflected.Type().AssignableTo(element.Elem().Type()) {
			element.Elem().Set(valueReflected)
			field.Set(element)
		}
		return
	}
	if valueReflected.Type().AssignableTo(field.Type()) {
		field.Set(valueReflected)
	}
}

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

func newAutomationTestWorkspace(t *testing.T) (*automationTestStore, *FinanceService) {
	t.Helper()
	store := &automationTestStore{
		memberships: map[string]model.Membership{
			"workspace-a|user-a": {WorkspaceID: "workspace-a", UserID: "user-a", Role: "owner"},
			"workspace-a|user-v": {WorkspaceID: "workspace-a", UserID: "user-v", Role: "viewer"},
		},
		workspaces: map[string]model.Workspace{
			"workspace-a": {ID: "workspace-a", Currency: "INR"},
		},
		vaults: []model.Vault{
			{ID: "vault-a", WorkspaceID: "workspace-a", Currency: "INR", Privacy: "workspace"},
		},
		accounts: []model.Account{
			{
				ID: "account-a", WorkspaceID: "workspace-a", VaultID: "vault-a",
				Name: "Everyday", Type: "checking", Currency: "INR",
				BalanceMinor: 10000, Privacy: "workspace",
			},
		},
	}
	finance := NewFinanceService(store, NewAccessService(store))
	return store, finance
}

func statementMapping() model.ImportColumnMapping {
	return model.ImportColumnMapping{
		HasHeader:         true,
		DateColumn:        0,
		DescriptionColumn: 1,
		AmountColumn:      2,
		DateFormat:        "iso",
		AmountMode:        "signed",
	}
}

// ---------------------------------------------------------------------------
// CSV parsing
// ---------------------------------------------------------------------------

func TestParseStatementCSVSignedAmountsWithHeaderAndAutoDates(t *testing.T) {
	csv := "Date,Details,Amount\n2026-07-01,Coffee shop,-120.50\n2026-07-02,Salary,+250000\n"
	parsed := parseStatementCSV(csv, model.ImportColumnMapping{
		HasHeader: true, DateColumn: 0, DescriptionColumn: 1, AmountColumn: 2,
		DateFormat: "auto", AmountMode: "signed",
	})
	if parsed.parseError != nil {
		t.Fatalf("unexpected parse error: %v", parsed.parseError)
	}
	if len(parsed.rows) != 2 {
		t.Fatalf("row count = %d, want 2", len(parsed.rows))
	}
	first := parsed.rows[0]
	if first.AmountMinor != 12050 || first.Direction != "debit" {
		t.Fatalf("first row = %d/%s, want debit 12050", first.AmountMinor, first.Direction)
	}
	if first.State != model.ImportRowNew || first.Action != model.ImportRowActionCreate {
		t.Fatalf("first row state/action = %s/%s, want new/create", first.State, first.Action)
	}
	second := parsed.rows[1]
	if second.AmountMinor != 25000000 || second.Direction != "credit" {
		t.Fatalf("second row = %d/%s, want credit 25000000", second.AmountMinor, second.Direction)
	}
	if !second.OccurredAt.Equal(time.Date(2026, time.July, 2, 0, 0, 0, 0, time.UTC)) {
		t.Fatalf("second row date = %v", second.OccurredAt)
	}
}

func TestParseStatementCSVTwoColumnDebitCreditMarksBadRowsInvalid(t *testing.T) {
	csv := "01/07/2026,Groceries,1500,\n02/07/2026,Refund,,820\n03/07/2026,Broken,both-set,also\n04/07/2026,No amount,,\n"
	parsed := parseStatementCSV(csv, model.ImportColumnMapping{
		DateColumn: 0, DescriptionColumn: 1, DebitColumn: 2, CreditColumn: 3,
		DateFormat: "dmy", AmountMode: "two_column",
	})
	if parsed.parseError != nil {
		t.Fatalf("unexpected parse error: %v", parsed.parseError)
	}
	if parsed.rows[0].Direction != "debit" || parsed.rows[0].AmountMinor != 150000 {
		t.Fatalf("debit row = %d/%s", parsed.rows[0].AmountMinor, parsed.rows[0].Direction)
	}
	if parsed.rows[1].Direction != "credit" || parsed.rows[1].AmountMinor != 82000 {
		t.Fatalf("credit row = %d/%s", parsed.rows[1].AmountMinor, parsed.rows[1].Direction)
	}
	if parsed.rows[2].State != model.ImportRowInvalid || !strings.Contains(parsed.rows[2].Error, "debit") {
		t.Fatalf("both-set row = %s/%q", parsed.rows[2].State, parsed.rows[2].Error)
	}
	if parsed.rows[3].State != model.ImportRowInvalid {
		t.Fatalf("missing-amount row = %s, want invalid", parsed.rows[3].State)
	}
}

func TestParseStatementMoneyHandlesLocaleFormats(t *testing.T) {
	tests := []struct {
		raw  string
		want int64
	}{
		{"1,234.56", 123456},
		{"1.234,56", 123456},
		{"₹ 12,000", 1200000},
		{"(500.00)", -50000},
		{"-75", -7500},
		{"2 000,50", 200050},
		{"0.99", 99},
		{"1,234,567.89", 123456789},
	}
	for _, test := range tests {
		got, err := parseStatementMoney(test.raw)
		if err != nil {
			t.Fatalf("parseStatementMoney(%q) error: %v", test.raw, err)
		}
		if got != test.want {
			t.Fatalf("parseStatementMoney(%q) = %d, want %d", test.raw, got, test.want)
		}
	}
	if _, err := parseStatementMoney(""); err == nil {
		t.Fatal("empty input should fail")
	}
	if _, err := parseStatementMoney("abc"); err == nil {
		t.Fatal("non-numeric input should fail")
	}
}

func TestParseStatementCSVRjectsTooManyRowsAndEmptyInput(t *testing.T) {
	if result := parseStatementCSV("", statementMapping()); result.parseError == nil {
		t.Fatal("empty csv should fail")
	}
	rows := []string{"Date,Details,Amount"}
	for index := 0; index <= importMaxRows+1; index++ {
		rows = append(rows, fmt.Sprintf("2026-01-01,Item,%d.00", index+1))
	}
	if result := parseStatementCSV(strings.Join(rows, "\n"), statementMapping()); result.parseError == nil {
		t.Fatal("oversized csv should fail")
	}
}

// ---------------------------------------------------------------------------
// Import sessions
// ---------------------------------------------------------------------------

func TestCreateImportSessionDetectsExactDuplicatesAndLikelyMatches(t *testing.T) {
	store, finance := newAutomationTestWorkspace(t)
	exactDay := time.Date(2026, 7, 10, 0, 0, 0, 0, time.UTC)
	store.transactions = []model.Transaction{
		{
			ID: "tx-exact", WorkspaceID: "workspace-a", VaultID: "vault-a", AccountID: "account-a",
			Type: "expense", AmountMinor: 45000, Currency: "INR", Merchant: "Uber ride",
			Privacy: "workspace", OccurredAt: exactDay,
		},
		{
			ID: "tx-drift", WorkspaceID: "workspace-a", VaultID: "vault-a", AccountID: "account-a",
			Type: "expense", AmountMinor: 99000, Currency: "INR", Merchant: "Amazon order",
			Privacy: "workspace", OccurredAt: exactDay.AddDate(0, 0, -2),
		},
	}
	csv := "Date,Details,Amount\n" +
		"2026-07-10,Uber ride,-450.00\n" +
		"2026-07-09,AMAZON ORDER PAYMENT,-990.00\n" +
		"2026-07-11,Fresh vegetables,-320.50\n"
	session, err := finance.CreateImportSession(context.Background(), "workspace-a", "user-a", ImportSessionInput{
		AccountID: "account-a", SourceName: "july.csv", Csv: csv, Mapping: statementMapping(),
	})
	if err != nil {
		t.Fatalf("CreateImportSession: %v", err)
	}
	if session.Status != model.ImportSessionDraft {
		t.Fatalf("status = %s, want draft", session.Status)
	}
	first := session.Rows[0]
	if first.State != model.ImportRowDuplicate || first.Action != model.ImportRowActionIgnore {
		t.Fatalf("exact duplicate state/action = %s/%s", first.State, first.Action)
	}
	second := session.Rows[1]
	if second.State != model.ImportRowPossibleMatch || second.Action != model.ImportRowActionLink {
		t.Fatalf("likely match state/action = %s/%s", second.State, second.Action)
	}
	if second.Match == nil || second.Match.TransactionID != "tx-drift" {
		t.Fatalf("likely match target = %+v", second.Match)
	}
	third := session.Rows[2]
	if third.State != model.ImportRowNew || third.Action != model.ImportRowActionCreate {
		t.Fatalf("new row state/action = %s/%s", third.State, third.Action)
	}
}

func TestCommitImportSessionCreatesLinksAndIgnoresWithProvenance(t *testing.T) {
	store, finance := newAutomationTestWorkspace(t)
	linkTarget := model.Transaction{
		ID: "tx-ledger", WorkspaceID: "workspace-a", VaultID: "vault-a", AccountID: "account-a",
		CreatedBy: "user-a", Type: "expense", AmountMinor: 70000, Currency: "INR",
		Merchant: "Electricity board", Privacy: "workspace",
		OccurredAt: time.Date(2026, 7, 5, 0, 0, 0, 0, time.UTC),
	}
	store.transactions = []model.Transaction{linkTarget}
	csv := "Date,Details,Amount\n" +
		"2026-07-05,Electricity board,-700.00\n" +
		"2026-07-06,Grocery store,-512.30\n" +
		"2026-07-07,Random noise,-1.00\n"
	session, err := finance.CreateImportSession(context.Background(), "workspace-a", "user-a", ImportSessionInput{
		AccountID: "account-a", SourceName: "july.csv", Csv: csv, Mapping: statementMapping(),
	})
	if err != nil {
		t.Fatalf("CreateImportSession: %v", err)
	}
	resolutions := []ImportRowResolution{
		{Index: 0, Action: model.ImportRowActionLink, TransactionID: "tx-ledger"},
		{Index: 2, Action: model.ImportRowActionIgnore},
	}
	session, err = finance.ResolveImportRows(context.Background(), "workspace-a", "user-a", session.ID, resolutions)
	if err != nil {
		t.Fatalf("ResolveImportRows: %v", err)
	}
	committed, err := finance.CommitImportSession(context.Background(), "workspace-a", "user-a", session.ID)
	if err != nil {
		t.Fatalf("CommitImportSession: %v", err)
	}
	if committed.Result.CreatedCount != 1 || committed.Result.LinkedCount != 1 || committed.Result.IgnoredCount != 1 {
		t.Fatalf("result = %+v, want 1/1/1", committed.Result)
	}
	if committed.Status != model.ImportSessionCompleted {
		t.Fatalf("status = %s, want completed", committed.Status)
	}
	if len(store.createdKeys) != 1 {
		t.Fatalf("created keys = %#v", store.createdKeys)
	}
	wantKey := fmt.Sprintf("import:%s:1", session.ID)
	if store.createdKeys[0] != wantKey {
		t.Fatalf("idempotency key = %q, want %q", store.createdKeys[0], wantKey)
	}
	var created model.Transaction
	for _, tx := range store.transactions {
		if tx.Merchant == "Grocery store" {
			created = tx
		}
	}
	if created.Source != model.TransactionSourceImport || created.ImportSessionID != session.ID {
		t.Fatalf("provenance missing: source=%q session=%q", created.Source, created.ImportSessionID)
	}
	if created.ClearedAt == nil {
		t.Fatal("imported transaction should be cleared")
	}
	public, marshalErr := json.Marshal(created)
	if marshalErr != nil {
		t.Fatalf("marshal: %v", marshalErr)
	}
	if !strings.Contains(string(public), `"imported":true`) || !strings.Contains(string(public), `"cleared":true`) {
		t.Fatalf("public payload lacks provenance signals: %s", public)
	}
	if strings.Contains(string(public), "import_session") || strings.Contains(string(public), session.ID) {
		t.Fatalf("internal provenance leaked: %s", public)
	}
	var cleared model.Transaction
	for _, tx := range store.transactions {
		if tx.ID == "tx-ledger" {
			cleared = tx
		}
	}
	if cleared.ClearedAt == nil {
		t.Fatal("linked transaction should be cleared")
	}
	// Committing again conflicts because the session already completed.
	if _, err := finance.CommitImportSession(context.Background(), "workspace-a", "user-a", session.ID); !errors.Is(err, ErrConflict) {
		t.Fatalf("second commit error = %v, want conflict", err)
	}
}

func TestCommitImportSessionBlocksOnUnresolvedInvalidRows(t *testing.T) {
	store, finance := newAutomationTestWorkspace(t)
	csv := "Date,Details,Amount\nnot-a-date,Mystery row,-100.00\n2026-07-08,Valid purchase,-42.00\n"
	session, err := finance.CreateImportSession(context.Background(), "workspace-a", "user-a", ImportSessionInput{
		AccountID: "account-a", SourceName: "broken.csv", Csv: csv, Mapping: statementMapping(),
	})
	if err != nil {
		t.Fatalf("CreateImportSession: %v", err)
	}
	if session.Rows[0].State != model.ImportRowInvalid {
		t.Fatalf("first row state = %s, want invalid", session.Rows[0].State)
	}
	_, err = finance.CommitImportSession(context.Background(), "workspace-a", "user-a", session.ID)
	if err == nil || !strings.Contains(err.Error(), "row 0") {
		t.Fatalf("commit error = %v, want unresolved-row guidance", err)
	}
	if len(store.transactions) != 0 {
		t.Fatal("no transactions should be created while errors remain")
	}
	session, err = finance.ResolveImportRows(context.Background(), "workspace-a", "user-a", session.ID, []ImportRowResolution{
		{Index: 0, Action: model.ImportRowActionIgnore},
	})
	if err != nil {
		t.Fatalf("ResolveImportRows ignore: %v", err)
	}
	if _, err := finance.CommitImportSession(context.Background(), "workspace-a", "user-a", session.ID); err != nil {
		t.Fatalf("commit after ignoring invalid row: %v", err)
	}
}

func TestResolveImportRowsValidatesLinkTargets(t *testing.T) {
	store, finance := newAutomationTestWorkspace(t)
	clearedAt := time.Date(2026, 7, 1, 0, 0, 0, 0, time.UTC)
	store.transactions = []model.Transaction{
		{
			ID: "tx-cleared", WorkspaceID: "workspace-a", VaultID: "vault-a", AccountID: "account-a",
			Type: "expense", AmountMinor: 1000, Currency: "INR", Merchant: "Already reconciled",
			Privacy: "workspace", OccurredAt: clearedAt, ClearedAt: &clearedAt,
		},
	}
	csv := "Date,Details,Amount\n2026-07-02,Target row,-10.00\n"
	session, err := finance.CreateImportSession(context.Background(), "workspace-a", "user-a", ImportSessionInput{
		AccountID: "account-a", SourceName: "x.csv", Csv: csv, Mapping: statementMapping(),
	})
	if err != nil {
		t.Fatalf("CreateImportSession: %v", err)
	}
	if _, err := finance.ResolveImportRows(context.Background(), "workspace-a", "user-a", session.ID, []ImportRowResolution{
		{Index: 0, Action: model.ImportRowActionLink, TransactionID: "tx-missing"},
	}); err == nil {
		t.Fatal("link to a missing transaction should fail")
	}
	if _, err := finance.ResolveImportRows(context.Background(), "workspace-a", "user-a", session.ID, []ImportRowResolution{
		{Index: 0, Action: model.ImportRowActionLink, TransactionID: "tx-cleared"},
	}); err == nil {
		t.Fatal("link to an already reconciled transaction should fail")
	}
}

func TestCancelImportSessionOnlyAffectsDrafts(t *testing.T) {
	store, finance := newAutomationTestWorkspace(t)
	csv := "Date,Details,Amount\n2026-07-02,Solo row,-10.00\n"
	session, err := finance.CreateImportSession(context.Background(), "workspace-a", "user-a", ImportSessionInput{
		AccountID: "account-a", SourceName: "x.csv", Csv: csv, Mapping: statementMapping(),
	})
	if err != nil {
		t.Fatalf("CreateImportSession: %v", err)
	}
	if err := finance.CancelImportSession(context.Background(), "workspace-a", "user-a", session.ID); err != nil {
		t.Fatalf("cancel draft: %v", err)
	}
	if store.importSessions[0].Status != model.ImportSessionCancelled {
		t.Fatalf("status = %s, want cancelled", store.importSessions[0].Status)
	}
	if err := finance.CancelImportSession(context.Background(), "workspace-a", "user-a", session.ID); !errors.Is(err, ErrConflict) {
		t.Fatalf("second cancel = %v, want conflict", err)
	}
}

func TestDetectImportConflictsNeverSuggestLinkingClearedEntries(t *testing.T) {
	store, finance := newAutomationTestWorkspace(t)
	day := time.Date(2026, 7, 10, 0, 0, 0, 0, time.UTC)
	clearedAt := day.AddDate(0, 0, 1)
	// An entry created by an earlier statement import is already cleared.
	store.transactions = []model.Transaction{
		{
			ID: "tx-imported", WorkspaceID: "workspace-a", VaultID: "vault-a", AccountID: "account-a",
			Type: "expense", AmountMinor: 50000, Currency: "INR", Merchant: "Cinema tickets",
			Privacy: "workspace", OccurredAt: day, ClearedAt: &clearedAt,
			Source: model.TransactionSourceImport,
		},
	}
	csv := "Date,Details,Amount\n" +
		"2026-07-12,Cinema tickets,-500.00\n" + // same amount, 2 days apart: would be a likely match
		"2026-07-10,Cinema tickets,-500.00\n" // exact same day+amount+description: exact duplicate
	session, err := finance.CreateImportSession(context.Background(), "workspace-a", "user-a", ImportSessionInput{
		AccountID: "account-a", SourceName: "again.csv", Csv: csv, Mapping: statementMapping(),
	})
	if err != nil {
		t.Fatalf("CreateImportSession: %v", err)
	}
	fuzzy := session.Rows[0]
	if fuzzy.State != model.ImportRowNew || fuzzy.Action != model.ImportRowActionCreate {
		t.Fatalf("fuzzy row against a cleared entry = %s/%s, want new/create (never link)", fuzzy.State, fuzzy.Action)
	}
	if fuzzy.Match != nil {
		t.Fatalf("cleared entry must not be suggested as a link target: %+v", fuzzy.Match)
	}
	exact := session.Rows[1]
	if exact.State != model.ImportRowDuplicate || exact.Action != model.ImportRowActionIgnore {
		t.Fatalf("exact duplicate of a cleared entry = %s/%s, want duplicate/ignore", exact.State, exact.Action)
	}
}

func TestViewerCannotCreateOrCommitImports(t *testing.T) {
	_, finance := newAutomationTestWorkspace(t)
	_, err := finance.CreateImportSession(context.Background(), "workspace-a", "user-v", ImportSessionInput{
		AccountID: "account-a", Csv: "2026-07-02,Row,-1.00\n", Mapping: statementMapping(),
	})
	if !errors.Is(err, ErrForbidden) {
		t.Fatalf("viewer create error = %v, want forbidden", err)
	}
}

// ---------------------------------------------------------------------------
// Automation rules
// ---------------------------------------------------------------------------

func uberRule(priority int) model.AutomationRule {
	return model.AutomationRule{
		Name: "Uber rides", Priority: priority, Enabled: true,
		Conditions: []model.RuleCondition{
			{Field: model.RuleConditionDescription, Operator: model.RuleOperatorContains, Value: "uber"},
		},
		Actions: []model.RuleAction{
			{Type: model.RuleActionSetCategory, Value: "Transportation"},
			{Type: model.RuleActionRename, Value: "Uber"},
		},
	}
}

func TestApplyAutomationRulesRunsInPriorityOrderOnceWithProvenance(t *testing.T) {
	_, finance := newAutomationTestWorkspace(t)
	high := uberRule(1)
	high.Actions = []model.RuleAction{{Type: model.RuleActionSetCategory, Value: "Commute"}}
	low := uberRule(5)
	low.Name = "Fallback"
	rules := []model.AutomationRule{low, high}
	tx := &model.Transaction{
		Type: "expense", AmountMinor: 30000, Currency: "INR",
		Merchant: "UBER *TRIP HELP", Privacy: "workspace",
	}
	if err := finance.applyAutomationRulesToTransaction(context.Background(), "workspace-a", rules, tx); err != nil {
		t.Fatalf("applyAutomationRulesToTransaction: %v", err)
	}
	if tx.Category != "Commute" {
		t.Fatalf("category = %q, want highest-priority rule to win", tx.Category)
	}
	if tx.Merchant != "Uber" {
		t.Fatalf("merchant = %q, want renamed by fallback rule", tx.Merchant)
	}
	if len(tx.Automation) != 2 {
		t.Fatalf("automation records = %d, want 2", len(tx.Automation))
	}
	if tx.Automation[0].RuleName != "Fallback" || tx.Automation[1].RuleName != "Uber rides" {
		t.Fatalf("automation order = [%s, %s]", tx.Automation[0].RuleName, tx.Automation[1].RuleName)
	}
}

func TestEvaluateRuleConditionsUseANDSemantics(t *testing.T) {
	tx := &model.Transaction{Type: "expense", AmountMinor: 50000, Merchant: "UBER trip", Source: ""}
	combined := model.AutomationRule{
		Conditions: []model.RuleCondition{
			{Field: model.RuleConditionDescription, Operator: model.RuleOperatorContains, Value: "uber"},
			{Field: model.RuleConditionType, Operator: model.RuleOperatorEquals, Value: "expense"},
			{Field: model.RuleConditionAmount, Operator: model.RuleOperatorBetween, MinMinor: int64ptr(10000), MaxMinor: int64ptr(60000)},
		},
	}
	if !evaluateRuleConditions(combined, tx) {
		t.Fatal("all matching conditions should pass")
	}
	combined.Conditions = append(combined.Conditions, model.RuleCondition{
		Field: model.RuleConditionImported, Operator: model.RuleOperatorTrue,
	})
	if evaluateRuleConditions(combined, tx) {
		t.Fatal("one failing condition must reject the rule")
	}
}

func int64ptr(value int64) *int64 { return &value }

func TestCreateTransactionAppliesEnabledRules(t *testing.T) {
	store, finance := newAutomationTestWorkspace(t)
	now := time.Now().UTC()
	rule := uberRule(10)
	rule.ID = newID()
	rule.WorkspaceID = "workspace-a"
	rule.CreatedBy = "user-a"
	rule.CreatedAt = now
	rule.UpdatedAt = now
	store.rules = []model.AutomationRule{rule}
	created, err := finance.CreateTransaction(context.Background(), "workspace-a", "user-a", "idempotency-key-1", TransactionInput{
		AccountID:   "account-a",
		Type:        "expense",
		AmountMinor: 25000,
		Currency:    "INR",
		Merchant:    "uber ride to airport",
		OccurredAt:  now,
	})
	if err != nil {
		t.Fatalf("CreateTransaction: %v", err)
	}
	if created.Category != "Transportation" {
		t.Fatalf("category = %q, want Transportation", created.Category)
	}
	if created.Merchant != "Uber" {
		t.Fatalf("merchant = %q, want Uber", created.Merchant)
	}
}

func TestRuleCRUDValidatesConditionsAndActions(t *testing.T) {
	_, finance := newAutomationTestWorkspace(t)
	ctx := context.Background()
	if _, err := finance.CreateAutomationRule(ctx, "workspace-a", "user-a", AutomationRuleInput{
		Name:       "Broken operator",
		Conditions: []model.RuleCondition{{Field: model.RuleConditionDescription, Operator: model.RuleOperatorGreaterThan}},
		Actions:    []model.RuleAction{{Type: model.RuleActionRename, Value: "X"}},
	}); err == nil {
		t.Fatal("unsupported operator should fail")
	}
	if _, err := finance.CreateAutomationRule(ctx, "workspace-a", "user-a", AutomationRuleInput{
		Name:       "Missing actions",
		Conditions: []model.RuleCondition{{Field: model.RuleConditionDescription, Operator: model.RuleOperatorContains, Value: "uber"}},
		Actions:    nil,
	}); err == nil {
		t.Fatal("missing actions should fail")
	}
	if _, err := finance.CreateAutomationRule(ctx, "workspace-a", "user-a", AutomationRuleInput{
		Name:       "Unknown account",
		Conditions: []model.RuleCondition{{Field: model.RuleConditionDescription, Operator: model.RuleOperatorContains, Value: "uber"}},
		Actions:    []model.RuleAction{{Type: model.RuleActionSetAccount, Value: "ghost"}},
	}); err == nil {
		t.Fatal("set_account to unknown account should fail")
	}
	rule, err := finance.CreateAutomationRule(ctx, "workspace-a", "user-a", AutomationRuleInput{
		Name:       "Uber rides",
		Priority:   intPtr(3),
		Conditions: []model.RuleCondition{{Field: model.RuleConditionDescription, Operator: model.RuleOperatorContains, Value: "uber"}},
		Actions:    []model.RuleAction{{Type: model.RuleActionSetCategory, Value: "Transportation"}},
	})
	if err != nil {
		t.Fatalf("valid create failed: %v", err)
	}
	disabled := false
	if _, err := finance.UpdateAutomationRule(ctx, "workspace-a", "user-a", rule.ID, AutomationRuleInput{
		Name:       "Uber rides",
		Enabled:    &disabled,
		Actions:    rule.Actions,
		Conditions: rule.Conditions,
	}); err != nil {
		t.Fatalf("update failed: %v", err)
	}
	if store_rules(finance).rules[0].Enabled {
		t.Fatal("rule should be disabled after update")
	}
	if err := finance.DeleteAutomationRule(ctx, "workspace-a", "user-a", rule.ID); err != nil {
		t.Fatalf("delete failed: %v", err)
	}
	if len(store_rules(finance).rules) != 0 {
		t.Fatal("rule should be deleted")
	}
	if _, err := finance.CreateAutomationRule(ctx, "workspace-a", "user-v", AutomationRuleInput{
		Name:       "Nope",
		Conditions: []model.RuleCondition{{Field: model.RuleConditionDescription, Operator: model.RuleOperatorContains, Value: "uber"}},
		Actions:    []model.RuleAction{{Type: model.RuleActionRename, Value: "X"}},
	}); !errors.Is(err, ErrForbidden) {
		t.Fatalf("viewer create rule = %v, want forbidden", err)
	}
}

func store_rules(finance *FinanceService) *automationTestStore {
	return finance.store.(*automationTestStore)
}

func intPtr(value int) *int { return &value }

func TestPreviewAutomationRuleCountsMatchesWithoutMutating(t *testing.T) {
	store, finance := newAutomationTestWorkspace(t)
	day := time.Date(2026, 7, 4, 0, 0, 0, 0, time.UTC)
	store.transactions = []model.Transaction{
		{ID: "t1", WorkspaceID: "workspace-a", VaultID: "vault-a", AccountID: "account-a", Type: "expense", AmountMinor: 100, Currency: "INR", Merchant: "UBER trip 1", Privacy: "workspace", OccurredAt: day},
		{ID: "t2", WorkspaceID: "workspace-a", VaultID: "vault-a", AccountID: "account-a", Type: "expense", AmountMinor: 200, Currency: "INR", Merchant: "uber eats", Privacy: "workspace", OccurredAt: day.AddDate(0, 0, 1)},
		{ID: "t3", WorkspaceID: "workspace-a", VaultID: "vault-a", AccountID: "account-a", Type: "expense", AmountMinor: 300, Currency: "INR", Merchant: "Coffee", Privacy: "workspace", OccurredAt: day},
	}
	before := len(store.transactions)
	result, err := finance.PreviewAutomationRule(context.Background(), "workspace-a", "user-a", AutomationRuleInput{
		Name:       "Uber rides",
		Conditions: []model.RuleCondition{{Field: model.RuleConditionDescription, Operator: model.RuleOperatorContains, Value: "uber"}},
		Actions:    []model.RuleAction{{Type: model.RuleActionSetCategory, Value: "Transportation"}},
	}, nil, nil)
	if err != nil {
		t.Fatalf("PreviewAutomationRule: %v", err)
	}
	if result.MatchCount != 2 {
		t.Fatalf("matchCount = %d, want 2", result.MatchCount)
	}
	if len(result.Samples) != 2 || len(result.Samples[0].Changes) == 0 {
		t.Fatalf("samples = %+v", result.Samples)
	}
	if len(store.transactions) != before {
		t.Fatal("preview must not mutate transactions")
	}
}

func TestRunAutomationRulesSkipsBalanceChangingActions(t *testing.T) {
	store, finance := newAutomationTestWorkspace(t)
	day := time.Date(2026, 7, 4, 0, 0, 0, 0, time.UTC)
	store.accounts = append(store.accounts, model.Account{
		ID: "account-b", WorkspaceID: "workspace-a", VaultID: "vault-a",
		Currency: "INR", Privacy: "workspace", BalanceMinor: 1,
	})
	store.transactions = []model.Transaction{
		{ID: "run-1", WorkspaceID: "workspace-a", VaultID: "vault-a", AccountID: "account-a", CreatedBy: "user-a", Type: "expense", AmountMinor: 100, Currency: "INR", Merchant: "UBER trip", Privacy: "workspace", OccurredAt: day},
	}
	now := time.Now().UTC()
	store.rules = []model.AutomationRule{{
		ID: newID(), WorkspaceID: "workspace-a", Name: "Uber", Priority: 1, Enabled: true,
		CreatedAt: now, UpdatedAt: now,
		Conditions: []model.RuleCondition{{Field: model.RuleConditionDescription, Operator: model.RuleOperatorContains, Value: "uber"}},
		Actions: []model.RuleAction{
			{Type: model.RuleActionSetCategory, Value: "Transportation"},
			{Type: model.RuleActionSetAccount, Value: "account-b"},
		},
	}}
	summary, err := finance.RunAutomationRules(context.Background(), "workspace-a", "user-a", []string{"run-1"})
	if err != nil {
		t.Fatalf("RunAutomationRules: %v", err)
	}
	if summary.Changed != 1 || summary.Examined != 1 {
		t.Fatalf("summary = %+v", summary)
	}
	tx := store.transactions[0]
	if tx.Category != "Transportation" {
		t.Fatalf("category = %q", tx.Category)
	}
	if tx.AccountID != "account-a" {
		t.Fatalf("accountId changed to %q; manual runs must never move balances", tx.AccountID)
	}
}

// ---------------------------------------------------------------------------
// Forecast
// ---------------------------------------------------------------------------

func forecastRequest(days int, includeBills, includeBaseline bool, oneOffs ...ForecastOneOff) ForecastInput {
	input := ForecastInput{Days: days, OneOff: oneOffs}
	input.IncludeBills = &includeBills
	input.IncludeBaseline = &includeBaseline
	includeIncome := true
	input.IncludeIncome = &includeIncome
	return input
}

func utcDayFromNow(offsetDays int) time.Time {
	now := time.Now().UTC()
	return time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, time.UTC).AddDate(0, 0, offsetDays)
}

func TestForecastExpandsMonthlyBillAcrossHorizon(t *testing.T) {
	store, finance := newAutomationTestWorkspace(t)
	store.bills = []model.Bill{{
		ID: "bill-rent", WorkspaceID: "workspace-a", Name: "Apartment rent",
		AmountMinor: 800000, Currency: "INR", Frequency: "monthly",
		DueDate: utcDayFromNow(2), Privacy: "workspace", OwnerID: "user-a",
	}}
	result, err := finance.Forecast(context.Background(), "workspace-a", "user-a", forecastRequest(35, true, false))
	if err != nil {
		t.Fatalf("Forecast: %v", err)
	}
	billDays := 0
	for _, point := range result.Points {
		if len(point.Events) > 0 {
			billDays++
			if point.Events[0].Kind != "bill" || point.Events[0].Label != "Apartment rent" {
				t.Fatalf("event = %+v", point.Events[0])
			}
		}
	}
	if billDays != 2 {
		t.Fatalf("bill occurrences = %d, want 2 (monthly expansion)", billDays)
	}
	if result.StartingBalanceMinor != 10000 {
		t.Fatalf("starting balance = %d", result.StartingBalanceMinor)
	}
	if result.LowestProjectedBalanceMinor >= 0 {
		t.Fatalf("lowest balance %d should be negative after two rent payments", result.LowestProjectedBalanceMinor)
	}
	wantNegative := utcDayFromNow(2).Format("2006-01-02")
	if result.FirstNegativeDate != wantNegative || result.NegativeDays == 0 {
		t.Fatalf("expected negatives from %q, got %q/%d", wantNegative, result.FirstNegativeDate, result.NegativeDays)
	}
	if result.Totals.ExpectedExpenseMinor != 1600000 {
		t.Fatalf("expense total = %d, want 1600000", result.Totals.ExpectedExpenseMinor)
	}
}

func TestForecastScenarioControlsExcludeBillsAndBaseline(t *testing.T) {
	store, finance := newAutomationTestWorkspace(t)
	store.bills = []model.Bill{{
		ID: "bill-net", WorkspaceID: "workspace-a", Name: "Internet",
		AmountMinor: 50000, Currency: "INR", Frequency: "weekly",
		DueDate: utcDayFromNow(1), Privacy: "workspace", OwnerID: "user-a",
	}}
	allOff := forecastRequest(14, false, false)
	result, err := finance.Forecast(context.Background(), "workspace-a", "user-a", allOff)
	if err != nil {
		t.Fatalf("Forecast: %v", err)
	}
	for _, point := range result.Points {
		if point.ExpenseMinor != 0 || len(point.Events) != 0 {
			t.Fatalf("scenario excluded bills but point %+v has activity", point)
		}
	}
	if result.LowestProjectedBalanceMinor != 10000 {
		t.Fatalf("balance should stay flat at 10000, got %d", result.LowestProjectedBalanceMinor)
	}
	if len(result.Assumptions) == 0 {
		t.Fatal("excluded scenarios must be documented in assumptions")
	}
	withBills, err := finance.Forecast(context.Background(), "workspace-a", "user-a", forecastRequest(14, true, false))
	if err != nil {
		t.Fatalf("Forecast with bills: %v", err)
	}
	if withBills.Totals.ExpectedExpenseMinor != 100000 {
		t.Fatalf("weekly bill total = %d, want 100000 across two weeks", withBills.Totals.ExpectedExpenseMinor)
	}
}

func TestForecastIncludesOneOffItemsAndExplainsAssumptions(t *testing.T) {
	_, finance := newAutomationTestWorkspace(t)
	expenseDay := utcDayFromNow(3)
	incomeDay := utcDayFromNow(9)
	result, err := finance.Forecast(context.Background(), "workspace-a", "user-a", forecastRequest(10, false, false,
		ForecastOneOff{Date: expenseDay.Format("2006-01-02"), Direction: "expense", Label: "Flight tickets", AmountMinor: 400000},
		ForecastOneOff{Date: incomeDay.Format("2006-01-02"), Direction: "income", Label: "Deposit refund", AmountMinor: 150000},
	))
	if err != nil {
		t.Fatalf("Forecast: %v", err)
	}
	var flightPoint *ForecastPoint
	for index := range result.Points {
		if result.Points[index].OneOffExpenseMinor > 0 {
			flightPoint = &result.Points[index]
		}
	}
	if flightPoint == nil || flightPoint.OneOffExpenseMinor != 400000 || len(flightPoint.Events) != 1 || flightPoint.Events[0].Kind != "one_off" {
		t.Fatalf("flight point missing: %+v", flightPoint)
	}
	wantNegativeDate := expenseDay.Format("2006-01-02")
	if result.FirstNegativeDate != wantNegativeDate {
		t.Fatalf("first negative date = %q, want %q", result.FirstNegativeDate, wantNegativeDate)
	}
	if len(result.Assumptions) == 0 {
		t.Fatal("forecast should always explain its assumptions")
	}
	if _, err := finance.Forecast(context.Background(), "workspace-a", "user-a", forecastRequest(10, false, false,
		ForecastOneOff{Date: "tomorrow", Direction: "expense", Label: "Bad", AmountMinor: 1},
	)); err == nil {
		t.Fatal("invalid one-off date should fail")
	}
	if _, err := finance.Forecast(context.Background(), "workspace-a", "user-a", forecastRequest(maximumForecastDays+1, false, false)); err == nil {
		t.Fatal("over-long horizons should fail")
	}
}

func TestForecastUsesHistoricalBaselineWhenEnabled(t *testing.T) {
	store, finance := newAutomationTestWorkspace(t)
	store.transactions = []model.Transaction{
		{
			ID: "e1", WorkspaceID: "workspace-a", VaultID: "vault-a", AccountID: "account-a",
			Type: "expense", AmountMinor: 90000, Currency: "INR",
			Privacy: "workspace", OccurredAt: utcDayFromNow(-10),
		},
	}
	result, err := finance.Forecast(context.Background(), "workspace-a", "user-a", forecastRequest(7, false, true))
	if err != nil {
		t.Fatalf("Forecast: %v", err)
	}
	if result.BaselineDailyExpenseMinor != 1000 {
		t.Fatalf("baseline daily expense = %d, want 1000", result.BaselineDailyExpenseMinor)
	}
	if result.Points[0].ExpenseMinor != 1000 {
		t.Fatalf("daily expense = %d, want baseline applied", result.Points[0].ExpenseMinor)
	}
}

// ---------------------------------------------------------------------------
// Reconciliation
// ---------------------------------------------------------------------------

func TestReconciliationPreviewReportsLedgerDifference(t *testing.T) {
	store, finance := newAutomationTestWorkspace(t)
	store.accounts[0].BalanceMinor = 1234567
	statementBalance := int64(1234560)
	preview, err := finance.ReconciliationPreview(context.Background(), "workspace-a", "user-a", "account-a", ReconciliationPreviewInput{
		StatementDate: "2026-07-31", StatementBalanceMinor: &statementBalance,
	})
	if err != nil {
		t.Fatalf("ReconciliationPreview: %v", err)
	}
	if preview.LedgerBalanceMinor != 1234567 || preview.DifferenceMinor != 7 {
		t.Fatalf("preview = %+v", preview)
	}
	if _, err := finance.ReconciliationPreview(context.Background(), "workspace-a", "user-a", "account-a", ReconciliationPreviewInput{
		StatementDate: "31/07/2026",
	}); err == nil {
		t.Fatal("bad statement dates should fail")
	}
}

func TestCompleteReconciliationRequiresAcknowledgementAndStaysImmutable(t *testing.T) {
	store, finance := newAutomationTestWorkspace(t)
	ctx := context.Background()
	statementBalance := int64(9000)
	_, err := finance.CompleteReconciliation(ctx, "workspace-a", "user-a", "account-a", ReconciliationCompleteInput{
		StatementDate: "2026-07-31", StatementBalanceMinor: statementBalance,
	})
	if err == nil || !strings.Contains(err.Error(), "acknowledgeDifference") {
		t.Fatalf("unacknowledged difference error = %v", err)
	}
	completed, err := finance.CompleteReconciliation(ctx, "workspace-a", "user-a", "account-a", ReconciliationCompleteInput{
		StatementDate: "2026-07-31", StatementBalanceMinor: statementBalance,
		AcknowledgeDifference: true, Note: "ATM withdrawal pending at bank",
	})
	if err != nil {
		t.Fatalf("acknowledged completion: %v", err)
	}
	if completed.DifferenceMinor != 1000 || !completed.DifferenceAcknowledged {
		t.Fatalf("completed = %+v", completed)
	}
	history, err := finance.ListReconciliations(ctx, "workspace-a", "user-a", "account-a", 10, 0)
	if err != nil || len(history) != 1 {
		t.Fatalf("history = %v (%v)", history, err)
	}
	if _, err := finance.CompleteReconciliation(ctx, "workspace-a", "user-v", "account-a", ReconciliationCompleteInput{
		StatementDate: "2026-07-31", StatementBalanceMinor: statementBalance, AcknowledgeDifference: true,
	}); !errors.Is(err, ErrForbidden) {
		t.Fatalf("viewer reconciliation = %v, want forbidden", err)
	}
	if len(store.reconciliations) != 1 {
		t.Fatalf("reconciliations stored = %d", len(store.reconciliations))
	}
}
