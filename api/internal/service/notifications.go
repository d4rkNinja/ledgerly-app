package service

import (
	"context"
	"errors"
	"strings"
	"time"

	"github.com/d4rkNinja/moneytracking-ledgerly-api/internal/model"
	"github.com/d4rkNinja/moneytracking-ledgerly-api/internal/repository"
)

type NotificationReadAllResult struct {
	UpdatedCount int64     `json:"updatedCount"`
	ReadAt       time.Time `json:"readAt"`
}

type NotificationUnreadCountResult struct {
	UnreadCount int64 `json:"unreadCount"`
}

// UnreadNotificationCount returns only the authenticated actor's unread total.
// The user_id/read_at filter is covered by the user_read_status index.
func (s *FinanceService) UnreadNotificationCount(
	ctx context.Context,
	actorID string,
) (*NotificationUnreadCountResult, error) {
	if strings.TrimSpace(actorID) == "" {
		return nil, ErrForbidden
	}
	unreadCount, err := s.store.Count(
		ctx,
		"notifications",
		repository.Filter{"user_id": actorID, "read_at": nil},
	)
	if err != nil {
		return nil, err
	}
	return &NotificationUnreadCountResult{UnreadCount: unreadCount}, nil
}

// MarkNotificationRead changes only a notification owned by the authenticated
// actor. Notification read state is user-local and does not require a workspace
// transaction or audit event.
func (s *FinanceService) MarkNotificationRead(
	ctx context.Context,
	actorID string,
	notificationID string,
) (*model.Notification, error) {
	if strings.TrimSpace(actorID) == "" {
		return nil, ErrForbidden
	}
	notificationID, err := validatedText("notificationId", notificationID, 1, 200)
	if err != nil {
		return nil, err
	}
	now := time.Now().UTC()
	var notification model.Notification
	if err := s.store.UpdateOne(
		ctx,
		"notifications",
		repository.Filter{"_id": notificationID, "user_id": actorID},
		repository.Filter{"$set": repository.Filter{"read_at": now}},
		&notification,
	); err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			return nil, ErrNotFound
		}
		return nil, err
	}
	return &notification, nil
}

// MarkAllNotificationsRead updates the actor's currently unread notifications.
// Notifications created concurrently after this update remain unread.
func (s *FinanceService) MarkAllNotificationsRead(
	ctx context.Context,
	actorID string,
) (*NotificationReadAllResult, error) {
	if strings.TrimSpace(actorID) == "" {
		return nil, ErrForbidden
	}
	now := time.Now().UTC()
	updatedCount, err := s.store.UpdateMany(
		ctx,
		"notifications",
		repository.Filter{"user_id": actorID, "read_at": nil},
		repository.Filter{"$set": repository.Filter{"read_at": now}},
	)
	if err != nil {
		return nil, err
	}
	return &NotificationReadAllResult{UpdatedCount: updatedCount, ReadAt: now}, nil
}
