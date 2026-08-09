package db

import (
	"testing"

	"go.mongodb.org/mongo-driver/bson"
)

func TestLegacyWorkspaceJoinCodeFilterTargetsHashOnlyDocuments(t *testing.T) {
	filter := legacyWorkspaceJoinCodeFilter()

	hashFilter, ok := filter["join_code_hash"].(bson.M)
	if !ok {
		t.Fatalf("join code hash filter = %#v, want bson.M", filter["join_code_hash"])
	}
	if hashFilter["$exists"] != true || hashFilter["$type"] != "string" || hashFilter["$ne"] != "" {
		t.Fatalf("join code hash filter = %#v", hashFilter)
	}

	expiryFilter, ok := filter["join_code_expires_at"].(bson.M)
	if !ok {
		t.Fatalf("join code expiry filter = %#v, want bson.M", filter["join_code_expires_at"])
	}
	if expiryFilter["$exists"] != false {
		t.Fatalf("join code expiry filter = %#v, want missing expiry", expiryFilter)
	}
}
