package service

import (
	"context"
	"testing"
	"time"

	"github.com/d4rkNinja/moneytracking-ledgerly-api/internal/model"
	"github.com/d4rkNinja/moneytracking-ledgerly-api/internal/repository"
)

type profileAuthStore struct {
	*authStore
}

func (s *profileAuthStore) FindOne(
	ctx context.Context,
	collection string,
	filter repository.Filter,
	destination any,
) error {
	if collection != "users" {
		return s.authStore.FindOne(ctx, collection, filter, destination)
	}
	for _, user := range s.users {
		if id, ok := filter["_id"].(string); ok && user.ID == id {
			*destination.(*model.User) = user
			return nil
		}
		if email, ok := filter["email"].(string); ok && user.Email == email {
			*destination.(*model.User) = user
			return nil
		}
	}
	return repository.ErrNotFound
}

func (s *profileAuthStore) UpdateOne(
	ctx context.Context,
	collection string,
	filter repository.Filter,
	update repository.Filter,
	destination any,
) error {
	if collection != "users" {
		return s.authStore.UpdateOne(ctx, collection, filter, update, destination)
	}
	userID, _ := filter["_id"].(string)
	set, _ := update["$set"].(repository.Filter)
	for index := range s.users {
		if s.users[index].ID != userID {
			continue
		}
		if value, ok := set["name"].(string); ok {
			s.users[index].Name = value
		}
		if value, ok := set["email"].(string); ok {
			s.users[index].Email = value
		}
		if value, ok := set["phone_number"].(string); ok {
			s.users[index].PhoneNumber = value
		}
		if value, ok := set["profile_image_url"].(string); ok {
			s.users[index].ProfileImageURL = value
		}
		if value, ok := set["preferred_currency"].(string); ok {
			s.users[index].PreferredCurrency = value
		}
		if value, ok := set["email_verified"].(bool); ok {
			s.users[index].EmailVerified = value
		}
		if value, ok := set["updated_at"].(time.Time); ok {
			s.users[index].UpdatedAt = value
		}
		*destination.(*model.User) = s.users[index]
		return nil
	}
	return repository.ErrNotFound
}

func stringPointer(value string) *string {
	return &value
}

func TestUpdateProfilePersistsEditableFieldsAndResetsEmailVerification(t *testing.T) {
	store := &profileAuthStore{authStore: &authStore{users: []model.User{{
		ID: "user-a", Email: "old@example.com", Name: "Old Name",
		PreferredCurrency: "INR", EmailVerified: true,
	}}}}
	auth := NewAuthService(store, time.Hour)

	user, err := auth.UpdateProfile(context.Background(), "user-a", UpdateProfileInput{
		Name:              stringPointer("New Name"),
		Email:             stringPointer("new@example.com"),
		PhoneNumber:       stringPointer("+91 9876543210"),
		ProfileImageURL:   stringPointer("https://images.example.test/avatar.png"),
		PreferredCurrency: stringPointer(" usd "),
	})
	if err != nil {
		t.Fatalf("UpdateProfile: %v", err)
	}
	if user.Name != "New Name" || user.Email != "new@example.com" ||
		user.PhoneNumber != "+91 9876543210" ||
		user.ProfileImageURL != "https://images.example.test/avatar.png" ||
		user.PreferredCurrency != "USD" || user.EmailVerified {
		t.Fatalf("updated user = %#v", user)
	}
	if store.users[0].UpdatedAt.IsZero() {
		t.Fatal("profile update did not set updated timestamp")
	}
}

func TestUpdateProfileRejectsDuplicateEmail(t *testing.T) {
	store := &profileAuthStore{authStore: &authStore{users: []model.User{
		{ID: "user-a", Email: "old@example.com", Name: "Old Name"},
		{ID: "user-b", Email: "taken@example.com", Name: "Other User"},
	}}}
	auth := NewAuthService(store, time.Hour)

	_, err := auth.UpdateProfile(context.Background(), "user-a", UpdateProfileInput{
		Email: stringPointer("taken@example.com"),
	})
	if err != ErrConflict {
		t.Fatalf("UpdateProfile error = %v, want conflict", err)
	}
}

func TestUpdateProfileValidatesPhoneAndImageURL(t *testing.T) {
	store := &profileAuthStore{authStore: &authStore{users: []model.User{{
		ID: "user-a", Email: "user@example.com", Name: "User Name",
	}}}}
	auth := NewAuthService(store, time.Hour)

	for _, test := range []struct {
		name  string
		input UpdateProfileInput
	}{
		{name: "phone", input: UpdateProfileInput{PhoneNumber: stringPointer("123")}},
		{name: "image", input: UpdateProfileInput{ProfileImageURL: stringPointer("http://example.test/avatar.png")}},
	} {
		t.Run(test.name, func(t *testing.T) {
			if _, err := auth.UpdateProfile(context.Background(), "user-a", test.input); err == nil {
				t.Fatal("invalid profile field was accepted")
			}
		})
	}
}
