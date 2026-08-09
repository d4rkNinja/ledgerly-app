package db

import (
	"testing"

	"go.mongodb.org/mongo-driver/bson"
)

func TestValidateTransactionTopology(t *testing.T) {
	sessionTimeout := int32(30)
	tests := []struct {
		name    string
		hello   helloResponse
		wantErr bool
	}{
		{
			name: "replica set",
			hello: helloResponse{
				SetName:                      "rs0",
				MaxWireVersion:               replicaSetTransactionWireVersion,
				LogicalSessionTimeoutMinutes: &sessionTimeout,
			},
		},
		{
			name: "sharded cluster",
			hello: helloResponse{
				Message:                      "isdbgrid",
				MaxWireVersion:               shardedTransactionWireVersion,
				LogicalSessionTimeoutMinutes: &sessionTimeout,
			},
		},
		{
			name: "standalone server",
			hello: helloResponse{
				LogicalSessionTimeoutMinutes: &sessionTimeout,
			},
			wantErr: true,
		},
		{
			name: "MongoDB 3.6 replica set",
			hello: helloResponse{
				SetName:                      "rs0",
				MaxWireVersion:               replicaSetTransactionWireVersion - 1,
				LogicalSessionTimeoutMinutes: &sessionTimeout,
			},
			wantErr: true,
		},
		{
			name: "MongoDB 4.0 sharded cluster",
			hello: helloResponse{
				Message:                      "isdbgrid",
				MaxWireVersion:               shardedTransactionWireVersion - 1,
				LogicalSessionTimeoutMinutes: &sessionTimeout,
			},
			wantErr: true,
		},
		{
			name:    "sessions unavailable",
			hello:   helloResponse{SetName: "rs0"},
			wantErr: true,
		},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			err := validateTransactionTopology(test.hello)
			if (err != nil) != test.wantErr {
				t.Fatalf("validateTransactionTopology() error = %v, wantErr %v", err, test.wantErr)
			}
		})
	}
}

func TestPendingInvitationDeduplicatorKeepsFirstExactIndexKey(t *testing.T) {
	deduplicator := newPendingInvitationDeduplicator()
	rows := []pendingInvitationIdentity{
		{ID: "newest", WorkspaceID: "workspace-a", Email: "person@example.test"},
		{ID: "older", WorkspaceID: "workspace-a", Email: "person@example.test"},
		{ID: "other-workspace", WorkspaceID: "workspace-b", Email: "person@example.test"},
		{ID: "legacy-case", WorkspaceID: "workspace-a", Email: "Person@example.test"},
	}
	want := []bool{false, true, false, true}
	for i, row := range rows {
		if got := deduplicator.isDuplicate(row); got != want[i] {
			t.Fatalf("row %q duplicate = %v, want %v", row.ID, got, want[i])
		}
	}
}

func TestPendingInvitationEmailIndexFilterExcludesManualInvites(t *testing.T) {
	filter := pendingInvitationEmailIndexFilter()
	if len(filter) != 3 {
		t.Fatalf("filter = %#v, want status, workspace_id, and email constraints", filter)
	}
	if filter[0].Key != "status" || filter[0].Value != "pending" {
		t.Fatalf("filter status = %#v", filter[0])
	}
	for _, field := range []string{"workspace_id", "email"} {
		var value bson.D
		for _, part := range filter {
			if part.Key == field {
				var ok bool
				value, ok = part.Value.(bson.D)
				if !ok {
					t.Fatalf("%s filter = %#v, want bson.D", field, part.Value)
				}
				break
			}
		}
		if len(value) != 2 || value[0].Key != "$type" || value[0].Value != "string" || value[1].Key != "$gt" || value[1].Value != "" {
			t.Fatalf("%s filter = %#v, want string greater than empty", field, value)
		}
	}
}
