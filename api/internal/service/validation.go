package service

import (
	"errors"
	"fmt"
	"math"
	"strings"

	"github.com/d4rkNinja/moneytracking-ledgerly-api/internal/model"
)

const maxMoneyMinor = model.MaxMoneyMinor

func validateMoney(field string, amount int64, allowNegative bool) error {
	if allowNegative {
		if amount < -maxMoneyMinor || amount > maxMoneyMinor {
			return &FieldError{Field: field, Message: "exceeds the supported range"}
		}
		return nil
	}
	if amount <= 0 {
		return &FieldError{Field: field, Message: "must be greater than zero"}
	}
	if amount > maxMoneyMinor {
		return &FieldError{Field: field, Message: "exceeds the supported maximum"}
	}
	return nil
}

func validatedText(field, raw string, minimum, maximum int) (string, error) {
	value := strings.TrimSpace(raw)
	length := len([]rune(value))
	if length < minimum || length > maximum {
		return "", &FieldError{
			Field:   field,
			Message: fmt.Sprintf("must contain %d to %d characters", minimum, maximum),
		}
	}
	return value, nil
}

func checkedAddMoney(left, right int64) (int64, error) {
	if (right > 0 && left > math.MaxInt64-right) || (right < 0 && left < math.MinInt64-right) {
		return 0, errors.New("monetary total exceeds int64 range")
	}
	return left + right, nil
}

func validPrivacy(raw, fallback string) (string, error) {
	privacy := valueOrDefault(strings.ToLower(strings.TrimSpace(raw)), fallback)
	switch privacy {
	case "private", "workspace", "selected":
		return privacy, nil
	default:
		return "", &FieldError{Field: "privacy", Message: "must be private, workspace, or selected"}
	}
}

func validAccountStatus(raw, fallback string) (string, error) {
	status := valueOrDefault(strings.ToLower(strings.TrimSpace(raw)), fallback)
	if status == "" {
		status = "active"
	}
	switch status {
	case "active", "inactive":
		return status, nil
	default:
		return "", &FieldError{Field: "status", Message: "must be active or inactive"}
	}
}

func validAccountColor(raw string) (string, error) {
	color := strings.TrimSpace(raw)
	if color == "" {
		return "", nil
	}
	if color[0] != '#' {
		return "", &FieldError{Field: "color", Message: "must be a hexadecimal color"}
	}
	length := len(color) - 1
	if length != 3 && length != 4 && length != 6 && length != 8 {
		return "", &FieldError{Field: "color", Message: "must be a hexadecimal color"}
	}
	for _, character := range color[1:] {
		if !((character >= '0' && character <= '9') || (character >= 'a' && character <= 'f') || (character >= 'A' && character <= 'F')) {
			return "", &FieldError{Field: "color", Message: "must be a hexadecimal color"}
		}
	}
	return strings.ToLower(color), nil
}

func invitationPermissions(inviter model.Membership, role string, requested []string) ([]string, error) {
	roleDefaults, ok := model.PermissionsForRole(role)
	if !ok {
		return nil, &FieldError{Field: "role", Message: "is not supported"}
	}
	// Workspace ownership is a stronger domain role than an equivalent set of
	// granular permissions. Only an existing owner may grant that role.
	if role == "owner" && inviter.Role != "owner" {
		return nil, ErrForbidden
	}
	for _, permission := range roleDefaults {
		if !hasPermission(inviter, permission) {
			return nil, ErrForbidden
		}
	}

	permissions := make([]string, 0, len(requested))
	seen := make(map[string]struct{}, len(requested))
	for _, permission := range requested {
		permission = strings.TrimSpace(permission)
		if !model.IsKnownPermission(permission) {
			return nil, &FieldError{Field: "permissions", Message: "contains an unsupported permission"}
		}
		if !hasPermission(inviter, permission) {
			return nil, ErrForbidden
		}
		if _, exists := seen[permission]; exists {
			continue
		}
		seen[permission] = struct{}{}
		permissions = append(permissions, permission)
	}
	return permissions, nil
}
