package model

const (
	PermViewWorkspace         = "view_workspace"
	PermEditWorkspace         = "edit_workspace"
	PermInviteMembers         = "invite_members"
	PermRemoveMembers         = "remove_members"
	PermManageRoles           = "manage_roles"
	PermViewVault             = "view_vault"
	PermCreateVault           = "create_vault"
	PermEditVault             = "edit_vault"
	PermArchiveVault          = "archive_vault"
	PermViewBalances          = "view_balances"
	PermViewTransactions      = "view_transactions"
	PermCreateTransactions    = "create_transactions"
	PermEditOwnTransactions   = "edit_own_transactions"
	PermEditAllTransactions   = "edit_all_transactions"
	PermDeleteOwnTransactions = "delete_own_transactions"
	PermDeleteAllTransactions = "delete_all_transactions"
	PermManageBudgets         = "manage_budgets"
	PermManageGoals           = "manage_goals"
	PermSubmitExpenses        = "submit_expenses"
	PermApproveExpenses       = "approve_expenses"
	PermManageReimbursements  = "manage_reimbursements"
	PermExportData            = "export_data"
	PermViewAudit             = "view_audit_history"
)

var RolePermissions = map[string][]string{
	"owner": {
		PermViewWorkspace, PermEditWorkspace, PermInviteMembers, PermRemoveMembers, PermManageRoles,
		PermViewVault, PermCreateVault, PermEditVault, PermArchiveVault, PermViewBalances,
		PermViewTransactions, PermCreateTransactions, PermEditOwnTransactions, PermEditAllTransactions,
		PermDeleteOwnTransactions, PermDeleteAllTransactions, PermManageBudgets, PermManageGoals,
		PermSubmitExpenses, PermApproveExpenses, PermManageReimbursements, PermExportData, PermViewAudit,
	},
	"administrator": {
		PermViewWorkspace, PermEditWorkspace, PermInviteMembers, PermRemoveMembers, PermManageRoles,
		PermViewVault, PermCreateVault, PermEditVault, PermArchiveVault, PermViewBalances,
		PermViewTransactions, PermCreateTransactions, PermEditOwnTransactions, PermEditAllTransactions,
		PermDeleteOwnTransactions, PermDeleteAllTransactions,
		PermManageBudgets, PermManageGoals, PermSubmitExpenses, PermApproveExpenses,
		PermManageReimbursements, PermExportData, PermViewAudit,
	},
	"finance_manager": {
		PermViewWorkspace, PermViewVault, PermCreateVault, PermEditVault, PermViewBalances,
		PermViewTransactions, PermCreateTransactions, PermEditOwnTransactions, PermEditAllTransactions, PermManageBudgets,
		PermManageGoals, PermSubmitExpenses, PermApproveExpenses, PermManageReimbursements,
		PermExportData, PermViewAudit,
	},
	"approver": {PermViewWorkspace, PermViewVault, PermViewBalances, PermViewTransactions, PermSubmitExpenses, PermApproveExpenses},
	"member": {
		PermViewWorkspace, PermViewVault, PermViewBalances, PermViewTransactions, PermCreateTransactions,
		PermEditOwnTransactions, PermDeleteOwnTransactions, PermSubmitExpenses,
	},
	"viewer": {PermViewWorkspace, PermViewVault, PermViewBalances, PermViewTransactions},
}

var knownPermissions = map[string]struct{}{
	PermViewWorkspace: {}, PermEditWorkspace: {}, PermInviteMembers: {}, PermRemoveMembers: {},
	PermManageRoles: {}, PermViewVault: {}, PermCreateVault: {}, PermEditVault: {},
	PermArchiveVault: {}, PermViewBalances: {}, PermViewTransactions: {}, PermCreateTransactions: {},
	PermEditOwnTransactions: {}, PermEditAllTransactions: {}, PermDeleteOwnTransactions: {},
	PermDeleteAllTransactions: {}, PermManageBudgets: {}, PermManageGoals: {}, PermSubmitExpenses: {},
	PermApproveExpenses: {}, PermManageReimbursements: {}, PermExportData: {}, PermViewAudit: {},
}

func IsKnownPermission(permission string) bool {
	_, ok := knownPermissions[permission]
	return ok
}

func PermissionsForRole(role string) ([]string, bool) {
	permissions, ok := RolePermissions[role]
	if !ok {
		return nil, false
	}
	return append([]string(nil), permissions...), true
}
