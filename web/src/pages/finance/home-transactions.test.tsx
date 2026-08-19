import { readFileSync } from "node:fs";
import path from "node:path";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MotionConfig } from "motion/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, useLocation } from "react-router";
import type { Account, Permission } from "@/domain/types";
import { AppContext, type AppContextValue } from "@/app/app-state";
import {
  HomePage,
  TransactionDialog,
  TransactionsPage,
} from "./home-transactions";
import { matchesTransactionSearch } from "@/lib/search";
import {
  addDateOnlyDays,
  formatDateOnly,
  todayDateOnly,
  toUtcDateOnly,
} from "@/lib/date-only";

const apiMocks = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  patch: vi.fn(),
  delete: vi.fn(),
  download: vi.fn(),
}));

const exportMocks = vi.hoisted(() => ({
  downloadWorkspaceExport: vi.fn(),
}));

vi.mock("@/lib/api-client", () => ({
  ApiError: class ApiError extends Error {},
  api: apiMocks,
}));

vi.mock("@/lib/export", () => exportMocks);

const indexCss = readFileSync(
  path.join(process.cwd(), "src", "index.css"),
  "utf8",
).replace(/\r\n?/g, "\n");

class ResizeObserverStub implements ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

class IntersectionObserverStub implements IntersectionObserver {
  readonly root = null;
  readonly rootMargin = "0px";
  readonly thresholds = [0];

  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() {
    return [];
  }
}

const accounts: Account[] = [
  {
    id: "account-1",
    name: "Everyday account",
    kind: "Cash",
    balance: { amountMinor: 1000, currency: "INR" },
    maskedNumber: "Cash",
    color: "#238f61",
  },
];

const appValue: AppContextValue = {
  demoMode: true,
  isAuthenticated: true,
  userId: "demo-user",
  userName: "Demo User",
  workspace: {
    id: "workspace-1",
    name: "Demo workspace",
    type: "personal",
    role: "owner",
    memberCount: 1,
    permissions: [],
  },
  availableWorkspaces: [],
  defaultWorkspaceId: "",
  preferredCurrency: "INR",
  privacyMode: false,
  theme: "system",
  resolvedTheme: "light",
  enterDemo: vi.fn(),
  completeLogin: vi.fn().mockResolvedValue(undefined),
  refreshWorkspaces: vi.fn().mockResolvedValue([]),
  deleteWorkspace: vi.fn().mockResolvedValue(undefined),
  signOut: vi.fn(),
  setWorkspace: vi.fn(),
  setDefaultWorkspace: vi.fn(),
  setPrivacyMode: vi.fn(),
  setPreferredCurrency: vi.fn(),
  setTheme: vi.fn(),
};

const liveWorkspace = {
  id: "workspace-home",
  name: "Shared finances",
  type: "family" as const,
  role: "owner" as const,
  memberCount: 2,
  permissions: [
    "view_transactions",
    "create_transactions",
    "delete_all_transactions",
    "export_data",
  ] as Permission[],
};

const liveAppValue: AppContextValue = {
  ...appValue,
  demoMode: false,
  workspace: liveWorkspace,
  availableWorkspaces: [liveWorkspace],
  defaultWorkspaceId: liveWorkspace.id,
};

const monthlyDashboard = {
  currency: "INR",
  balanceMinor: 2820000,
  incomeMinor: 5500000,
  spendingMinor: 2100000,
  recentTransactions: [],
  pendingApprovals: 0,
  unreadNotifications: 0,
  byCategory: [],
  cashflow: [
    {
      period: "2026-07-15",
      incomeMinor: 300000,
      spendingMinor: 120000,
      netMinor: 180000,
      currency: "INR",
    },
  ],
  monthlyTrend: [],
  topCategories: [
    {
      name: "Utilities",
      category: "Utilities",
      type: "expense",
      amountMinor: 210000,
      count: 1,
      currency: "INR",
    },
  ],
};

const yearlyDashboard = {
  ...monthlyDashboard,
  incomeMinor: 18_000_000,
  spendingMinor: 7_500_000,
  monthlyTrend: [
    {
      period: "2026-01",
      incomeMinor: 10_000_000,
      spendingMinor: 4_000_000,
      netMinor: 6_000_000,
      currency: "INR",
    },
    {
      period: "2026-07",
      incomeMinor: 8_000_000,
      spendingMinor: 3_500_000,
      netMinor: 4_500_000,
      currency: "INR",
    },
  ],
};

const dashboardWithSections = {
  ...monthlyDashboard,
  bySource: [
    {
      name: "Salary",
      merchant: "Salary",
      type: "income",
      amountMinor: 500000,
      count: 1,
      currency: "INR",
    },
  ],
  byAccount: [
    {
      id: "account-home",
      name: "Everyday account",
      incomeMinor: 500000,
      paidMinor: 120000,
      netMinor: 380000,
      count: 2,
      currency: "INR",
    },
  ],
  byType: [
    {
      name: "Expense",
      type: "expense",
      amountMinor: 120000,
      count: 1,
      currency: "INR",
    },
  ],
  goalSummary: {
    activeCount: 2,
    expectedIncomeMinor: 300000,
    expectedPaymentsMinor: 120000,
    savingsTargetMinor: 200000,
    dueSoonCount: 1,
    dueTodayCount: 0,
    overdueCount: 1,
    achievedCount: 1,
    partialCount: 1,
    completionPercent: 50,
    pendingMinor: 320000,
    achievedMinor: 180000,
    nearestDue: {
      id: "goal-nearest",
      name: "Rent reserve",
      status: "due_soon",
      targetMinor: 500000,
      currentMinor: 180000,
      remainingMinor: 320000,
      currency: "INR",
      dueDate: "2026-07-25T00:00:00.000Z",
    },
  },
  allActiveGoals: {
    activeCount: 3,
    expectedIncomeMinor: 300000,
    expectedPaymentsMinor: 120000,
    savingsTargetMinor: 200000,
    dueSoonCount: 1,
    dueTodayCount: 0,
    overdueCount: 1,
    achievedCount: 1,
    partialCount: 1,
    pendingMinor: 320000,
    achievedMinor: 180000,
  },
  goalHighlights: [
    {
      id: "goal-nearest",
      name: "Rent reserve",
      direction: "save",
      status: "due_soon",
      targetMinor: 500000,
      currentMinor: 180000,
      remainingMinor: 320000,
      currency: "INR",
      dueDate: "2026-07-25T00:00:00.000Z",
    },
  ],
  insights: [
    {
      kind: "spending_change",
      title: "Spending changed",
      detail: "Spending changed versus the equivalent previous period.",
      percent: 12,
      currency: "INR",
    },
  ],
};

const dayTransactions = [
  {
    id: "transaction-day-1",
    merchant: "Electricity bill",
    category: "Utilities",
    type: "expense",
    amountMinor: 120000,
    currency: "INR",
    accountId: "account-home",
    occurredAt: "2026-07-15T08:30:00.000Z",
    createdAt: "2026-07-15T08:31:00.000Z",
    creator: {
      name: "Asha Rao",
      initials: "AR",
      status: "active",
      isCurrentUser: true,
    },
  },
  {
    id: "transaction-day-transfer",
    merchant: "Move to savings",
    category: "Transfer",
    type: "transfer",
    amountMinor: 50000,
    currency: "INR",
    accountId: "account-home",
    destinationAccountId: "account-savings",
    occurredAt: "2026-07-15T09:00:00.000Z",
    createdAt: "2026-07-15T09:01:00.000Z",
    creator: {
      name: "Asha Rao",
      initials: "AR",
      status: "active",
      isCurrentUser: true,
    },
  },
];

function LocationProbe() {
  const location = useLocation();
  return <output data-testid="location-search">{location.search}</output>;
}

function renderTransactionDialog() {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <AppContext.Provider value={appValue}>
        <MotionConfig reducedMotion="always">
          <TransactionDialog
            open
            initialMode="expense"
            accounts={accounts}
            onClose={vi.fn()}
            onDemoAdded={vi.fn()}
          />
        </MotionConfig>
      </AppContext.Provider>
    </QueryClientProvider>,
  );
}

function renderLiveTransactionDialog(
  dialogAccounts = accounts,
  initialMode: "expense" | "income" | "transfer" | "split" = "expense",
) {
  const client = new QueryClient();
  return {
    client,
    ...render(
      <QueryClientProvider client={client}>
        <AppContext.Provider value={liveAppValue}>
          <MotionConfig reducedMotion="always">
            <TransactionDialog
              open
              initialMode={initialMode}
              accounts={dialogAccounts}
              onClose={vi.fn()}
              onDemoAdded={vi.fn()}
            />
          </MotionConfig>
        </AppContext.Provider>
      </QueryClientProvider>,
    ),
  };
}

function renderHome(
  initialEntry = "/app/home?month=2026-07",
  contextValue: AppContextValue = liveAppValue,
) {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <AppContext.Provider value={contextValue}>
          <MotionConfig reducedMotion="always">
            <HomePage />
            <LocationProbe />
          </MotionConfig>
        </AppContext.Provider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function renderTransactions(initialEntry = "/app/transactions") {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  return {
    client,
    ...render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={[initialEntry]}>
          <AppContext.Provider value={liveAppValue}>
            <MotionConfig reducedMotion="always">
              <TransactionsPage />
              <LocationProbe />
            </MotionConfig>
          </AppContext.Provider>
        </MemoryRouter>
      </QueryClientProvider>,
    ),
  };
}

describe("TransactionDialog categories", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiMocks.get.mockImplementation((path: string) => {
      if (path.endsWith("/accounts")) {
        return Promise.resolve([
          {
            id: "account-home",
            name: "Everyday account",
            type: "Cash",
            balanceMinor: 2820000,
            currency: "INR",
          },
        ]);
      }
      if (path.endsWith("/budgets") || path.endsWith("/transactions")) {
        return Promise.resolve([]);
      }
      if (path.includes("/dashboard")) {
        return Promise.resolve(monthlyDashboard);
      }
      return Promise.resolve([]);
    });
    vi.stubGlobal("ResizeObserver", ResizeObserverStub);
    vi.stubGlobal("IntersectionObserver", IntersectionObserverStub);
    vi.stubGlobal(
      "matchMedia",
      vi.fn(() => ({
        matches: false,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })),
    );
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("switches from expense categories to income categories and resets selection", async () => {
    const user = userEvent.setup();
    renderTransactionDialog();

    await user.click(screen.getByRole("button", { name: "General" }));
    expect(
      screen.getByRole("option", { name: "Groceries" }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "income" }));
    await user.click(screen.getByRole("button", { name: "Salary" }));

    expect(screen.getByRole("option", { name: "Salary" })).toBeInTheDocument();
    expect(
      screen.getByRole("option", { name: "Freelance" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("option", { name: "Groceries" }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Salary" })).toHaveTextContent(
      "Salary",
    );
  });

  it("keeps the currency control anchored to the amount field and leaves the account control visible", () => {
    renderTransactionDialog();

    const amountInput = screen.getByRole("textbox", { name: "Amount" });
    const amountField = amountInput.closest(".currency-input");

    expect(amountField).toHaveClass("currency-input-icon-only");
    expect(
      amountField?.querySelector(".currency-select-root"),
    ).toBeInTheDocument();
    expect(screen.getByText("Account")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Everyday account" }),
    ).toBeInTheDocument();
    expect(indexCss).toContain(".currency-input > .currency-select-root {");
    expect(indexCss).toContain("pointer-events: none;");
    expect(indexCss).toContain(
      ".currency-input > .currency-select-root .currency-select-trigger,",
    );
  });
});

describe("TransactionDialog dates and accounts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiMocks.post.mockResolvedValue({ id: "transaction-new" });
    apiMocks.get.mockImplementation((path: string) => {
      if (path.includes("/transaction-categories")) {
        return Promise.resolve([
          {
            id: "category-general",
            transactionType: "expense",
            name: "General",
            sortOrder: 0,
            isActive: true,
            usageCount: 0,
          },
        ]);
      }
      if (path.endsWith("/transaction-sequences")) {
        return Promise.resolve([
          {
            transactionType: "expense",
            autoGenerate: true,
            nextNumber: 1,
            minimumDigits: 4,
            preview: "0001",
            minimumAvailableNextNumber: 1,
          },
        ]);
      }
      return Promise.resolve([]);
    });
    vi.stubGlobal("ResizeObserver", ResizeObserverStub);
    vi.stubGlobal("IntersectionObserver", IntersectionObserverStub);
    vi.stubGlobal(
      "matchMedia",
      vi.fn(() => ({
        matches: false,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })),
    );
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("defaults to today and saves the chosen past date at UTC midnight", async () => {
    const user = userEvent.setup();
    renderLiveTransactionDialog();

    const today = todayDateOnly();
    const pastDate = addDateOnlyDays(today, -1);
    const transactionDate = screen.getByRole("button", {
      name: /transaction date/i,
    });
    const transactionId = screen.getByRole("textbox", {
      name: "Transaction ID",
    });

    expect(transactionDate).toHaveTextContent(formatDateOnly(today));
    expect(transactionId).toBeEnabled();
    expect(transactionId).toHaveAttribute("placeholder", "Auto Generated");
    expect(
      document.querySelector('input[type="date"]'),
    ).not.toBeInTheDocument();
    await user.click(transactionDate);
    const selectedDay = (
      await screen.findAllByRole("gridcell", {
        name: `Choose ${formatDateOnly(
          today,
          {
            weekday: undefined,
            day: "numeric",
            month: "long",
            year: "numeric",
          },
          "en-US",
        )}`,
        hidden: true,
      })
    )[0];
    selectedDay.focus();
    await user.keyboard("{ArrowLeft}");
    await user.keyboard("{Enter}");
    await user.type(
      screen.getByRole("combobox", { name: "Name or description" }),
      "Coffee",
    );
    await user.type(screen.getByRole("textbox", { name: "Amount" }), "125");
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(apiMocks.post).toHaveBeenCalledWith(
        "/workspaces/workspace-home/transactions",
        expect.objectContaining({
          occurredAt: toUtcDateOnly(pastDate),
          autoGenerateTransactionId: true,
          transactionId: undefined,
        }),
        expect.objectContaining({ "Idempotency-Key": expect.any(String) }),
      );
    });
  });

  it("accepts a future transaction date without replacing it with the current time", async () => {
    const user = userEvent.setup();
    renderLiveTransactionDialog();

    const today = todayDateOnly();
    const futureDate = addDateOnlyDays(today, 1);
    await user.click(screen.getByRole("button", { name: /transaction date/i }));
    const selectedDay = (
      await screen.findAllByRole("gridcell", {
        name: `Choose ${formatDateOnly(
          today,
          {
            weekday: undefined,
            day: "numeric",
            month: "long",
            year: "numeric",
          },
          "en-US",
        )}`,
        hidden: true,
      })
    )[0];
    selectedDay.focus();
    await user.keyboard("{ArrowRight}");
    await user.keyboard("{Enter}");
    await user.type(
      screen.getByRole("combobox", { name: "Name or description" }),
      "Future deposit",
    );
    await user.type(screen.getByRole("textbox", { name: "Amount" }), "20");
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(apiMocks.post).toHaveBeenCalledWith(
        "/workspaces/workspace-home/transactions",
        expect.objectContaining({
          occurredAt: toUtcDateOnly(futureDate),
        }),
        expect.any(Object),
      );
    });
  });

  it("does not offer inactive accounts as a source or transfer destination", async () => {
    const user = userEvent.setup();
    renderLiveTransactionDialog([
      ...accounts,
      {
        id: "account-inactive",
        name: "Closed account",
        kind: "Savings",
        balance: { amountMinor: 5000, currency: "INR" },
        maskedNumber: "•••• 4444",
        color: "#536d52",
        status: "inactive",
      },
    ]);

    await user.click(screen.getByRole("button", { name: "Everyday account" }));

    expect(
      screen.queryByRole("option", { name: "Closed account" }),
    ).not.toBeInTheDocument();
  });

  it("loads active members and sends exact member-email shares for a live split", async () => {
    const user = userEvent.setup();
    apiMocks.get.mockImplementation((path: string) => {
      if (path.endsWith("/members")) {
        return Promise.resolve([
          {
            name: "Asha Rao",
            email: "asha@example.test",
            role: "owner",
            permissions: [],
            status: "active",
            joinedAt: "2026-01-01T00:00:00.000Z",
          },
          {
            name: "Bina Shah",
            email: "bina@example.test",
            role: "member",
            permissions: [],
            status: "active",
            joinedAt: "2026-02-01T00:00:00.000Z",
          },
          {
            name: "Pending Member",
            email: "pending@example.test",
            role: "member",
            permissions: [],
            status: "pending",
            joinedAt: "",
          },
        ]);
      }
      if (path.includes("/transaction-categories")) {
        return Promise.resolve([
          {
            id: "category-split-expense",
            transactionType: "split",
            name: "Split expense",
            sortOrder: 0,
            isActive: true,
          },
        ]);
      }
      if (path.endsWith("/transaction-sequences")) {
        return Promise.resolve([
          {
            transactionType: "split",
            autoGenerate: true,
            nextNumber: 8,
            minimumDigits: 4,
            preview: "0008",
            minimumAvailableNextNumber: 8,
          },
        ]);
      }
      return Promise.resolve([]);
    });
    apiMocks.post.mockResolvedValueOnce({
      id: "transaction-split",
      transactionId: "0008",
    });

    renderLiveTransactionDialog(accounts, "split");

    const ashaShare = await screen.findByRole("textbox", {
      name: "Share for Asha Rao",
    });
    const binaShare = screen.getByRole("textbox", {
      name: "Share for Bina Shah",
    });
    expect(
      screen.queryByRole("textbox", { name: "Share for Pending Member" }),
    ).not.toBeInTheDocument();
    expect(apiMocks.get).toHaveBeenCalledWith(
      "/workspaces/workspace-home/members",
    );

    await user.type(
      screen.getByRole("combobox", { name: "Name or description" }),
      "Weekend groceries",
    );
    await user.type(screen.getByRole("textbox", { name: "Amount" }), "100");
    await user.type(ashaShare, "40");
    await user.type(binaShare, "50");
    const save = screen.getByRole("button", { name: "Save" });
    await waitFor(() => expect(save).toBeEnabled());
    await user.click(save);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      /Shares total.*90.*must equal.*100/,
    );
    expect(apiMocks.post).not.toHaveBeenCalled();

    await user.clear(binaShare);
    await user.type(binaShare, "60");
    await user.click(save);

    await waitFor(() => {
      expect(apiMocks.post).toHaveBeenCalledWith(
        "/workspaces/workspace-home/transactions",
        expect.objectContaining({
          type: "split",
          category: "Split expense",
          autoGenerateTransactionId: true,
          splits: [
            { memberEmail: "asha@example.test", amountMinor: 4000 },
            { memberEmail: "bina@example.test", amountMinor: 6000 },
          ],
        }),
        expect.objectContaining({ "Idempotency-Key": expect.any(String) }),
      );
    });
  });
});

describe("TransactionsPage date filters", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
      configurable: true,
      value: vi.fn(),
    });
    apiMocks.get.mockImplementation((path: string) => {
      if (path.endsWith("/accounts")) {
        return Promise.resolve([
          {
            id: "account-home",
            name: "Everyday account",
            type: "Cash",
            balanceMinor: 0,
            currency: "INR",
          },
        ]);
      }
      return Promise.resolve([]);
    });
    vi.stubGlobal("ResizeObserver", ResizeObserverStub);
    vi.stubGlobal("IntersectionObserver", IntersectionObserverStub);
    vi.stubGlobal(
      "matchMedia",
      vi.fn(() => ({
        matches: false,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })),
    );
  });

  afterEach(() => {
    cleanup();
    delete (HTMLElement.prototype as { scrollIntoView?: () => void })
      .scrollIntoView;
    vi.unstubAllGlobals();
  });

  it("offers contact and saved-name options in entry search", async () => {
    const user = userEvent.setup();
    apiMocks.get.mockImplementation((path: string) => {
      if (path.endsWith("/accounts")) {
        return Promise.resolve([
          {
            id: "account-home",
            name: "Everyday account",
            type: "Cash",
            balanceMinor: 0,
            currency: "INR",
          },
        ]);
      }
      if (path.endsWith("/contacts")) {
        return Promise.resolve([
          {
            id: "contact-priya",
            name: "Priya Shah",
            phone: "+91 98765 43210",
            email: "priya@example.com",
          },
        ]);
      }
      if (path.endsWith("/saved-transaction-names")) {
        return Promise.resolve([
          {
            id: "saved-rent",
            name: "Monthly rent",
            createdBy: "member-1",
            createdAt: "2026-07-12T09:00:00.000Z",
            updatedAt: "2026-07-12T09:00:00.000Z",
          },
        ]);
      }
      return Promise.resolve([]);
    });

    renderTransactions();

    const search = await screen.findByRole("combobox", {
      name: "Search entries by transaction ID, name, description, or contact",
    });
    await user.click(search);

    expect(
      await screen.findByRole("option", { name: /Priya Shah/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("option", { name: /Monthly rent/ }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("option", { name: /Priya Shah/ }));
    expect(search).toHaveValue("Priya Shah");
  });

  it("applies an inclusive From and To date range to the entries API query", async () => {
    const user = userEvent.setup();
    const today = todayDateOnly();
    const from = addDateOnlyDays(today, -1);
    renderTransactions();

    await screen.findByRole("heading", { name: "Transactions" });
    await user.click(screen.getByRole("button", { name: "Filters" }));
    await user.click(screen.getByRole("button", { name: /From date/i }));
    const selectedDay = (
      await screen.findAllByRole("gridcell", {
        name: `Choose ${formatDateOnly(
          today,
          {
            weekday: undefined,
            day: "numeric",
            month: "long",
            year: "numeric",
          },
          "en-US",
        )}`,
      })
    )[0];
    selectedDay.focus();
    await user.keyboard("{ArrowLeft}{Enter}");
    await user.click(screen.getByRole("button", { name: /To date/i }));
    await user.click(
      (
        await screen.findAllByRole("gridcell", {
          name: `Choose ${formatDateOnly(
            today,
            {
              weekday: undefined,
              day: "numeric",
              month: "long",
              year: "numeric",
            },
            "en-US",
          )}`,
        })
      ).at(-1)!,
    );
    await user.click(screen.getByRole("button", { name: "Apply filters" }));

    expect(screen.getByTestId("location-search")).toHaveTextContent(
      `?from=${from}&to=${today}`,
    );
    await waitFor(() => {
      expect(apiMocks.get).toHaveBeenCalledWith(
        `/workspaces/workspace-home/transactions?from=${encodeURIComponent(`${from}T00:00:00.000Z`)}&to=${encodeURIComponent(`${addDateOnlyDays(today, 1)}T00:00:00.000Z`)}`,
      );
    });
  });

  it("loads live categories and sends a manual transaction ID", async () => {
    const user = userEvent.setup();
    apiMocks.get.mockImplementation((path: string) => {
      if (path.includes("/transaction-categories")) {
        return Promise.resolve([
          {
            id: "category-client-meals",
            transactionType: "expense",
            name: "Client meals",
            sortOrder: 0,
            isActive: true,
            usageCount: 3,
          },
        ]);
      }
      if (path.endsWith("/transaction-sequences")) {
        return Promise.resolve([
          {
            transactionType: "expense",
            autoGenerate: false,
            nextNumber: 43,
            minimumDigits: 6,
            preview: "000043",
            minimumAvailableNextNumber: 43,
          },
        ]);
      }
      return Promise.resolve([]);
    });
    apiMocks.post.mockResolvedValue({ id: "transaction-manual" });
    const { client } = renderLiveTransactionDialog();
    const invalidate = vi.spyOn(client, "invalidateQueries");

    expect(
      await screen.findByRole("button", { name: "Client meals" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "General" })).not.toBeInTheDocument();
    const transactionId = screen.getByRole("textbox", {
      name: "Transaction ID",
    });
    await waitFor(() => expect(transactionId).toBeEnabled());
    await user.type(transactionId, "000099");
    await user.type(
      screen.getByRole("combobox", { name: "Name or description" }),
      "Team lunch",
    );
    await user.type(screen.getByRole("textbox", { name: "Amount" }), "48");
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(apiMocks.post).toHaveBeenCalledWith(
        "/workspaces/workspace-home/transactions",
        expect.objectContaining({
          category: "Client meals",
          autoGenerateTransactionId: false,
          transactionId: "000099",
        }),
        expect.any(Object),
      );
    });
    await waitFor(() => {
      expect(invalidate).toHaveBeenCalledWith({
        queryKey: ["period-reviews", "workspace-home"],
      });
    });
  });

  it("returns to auto generation when a custom transaction ID is cleared", async () => {
    const user = userEvent.setup();
    apiMocks.get.mockImplementation((path: string) => {
      if (path.includes("/transaction-categories")) {
        return Promise.resolve([
          {
            id: "category-general",
            transactionType: "expense",
            name: "General",
            sortOrder: 0,
            isActive: true,
          },
        ]);
      }
      if (path.endsWith("/transaction-sequences")) {
        return Promise.resolve([
          {
            transactionType: "expense",
            autoGenerate: true,
            nextNumber: 1,
            minimumDigits: 4,
            preview: "0001",
            minimumAvailableNextNumber: 1,
          },
        ]);
      }
      return Promise.resolve([]);
    });
    apiMocks.post.mockResolvedValue({ id: "transaction-auto" });
    renderLiveTransactionDialog();

    const transactionId = screen.getByRole("textbox", {
      name: "Transaction ID",
    });
    await user.type(transactionId, "000099");
    await user.clear(transactionId);
    await user.tab();

    expect(transactionId).toHaveValue("");
    expect(transactionId).toHaveAttribute("placeholder", "Auto Generated");

    await user.type(
      screen.getByRole("combobox", { name: "Name or description" }),
      "Coffee beans",
    );
    await user.type(screen.getByRole("textbox", { name: "Amount" }), "12.50");
    const save = screen.getByRole("button", { name: "Save" });
    await waitFor(() => expect(save).toBeEnabled());
    await user.click(save);

    await waitFor(() => {
      expect(apiMocks.post).toHaveBeenCalledWith(
        "/workspaces/workspace-home/transactions",
        expect.objectContaining({
          autoGenerateTransactionId: true,
          transactionId: undefined,
        }),
        expect.objectContaining({ "Idempotency-Key": expect.any(String) }),
      );
    });
  });

  it("requires a custom ID when automatic sequence generation is disabled", async () => {
    const user = userEvent.setup();
    apiMocks.get.mockImplementation((path: string) => {
      if (path.includes("/transaction-categories")) {
        return Promise.resolve([
          {
            id: "category-general",
            transactionType: "expense",
            name: "General",
            sortOrder: 0,
            isActive: true,
          },
        ]);
      }
      if (path.endsWith("/transaction-sequences")) {
        return Promise.resolve([
          {
            transactionType: "expense",
            autoGenerate: false,
            nextNumber: 1,
            minimumDigits: 4,
            preview: "0001",
            minimumAvailableNextNumber: 1,
          },
        ]);
      }
      return Promise.resolve([]);
    });
    renderLiveTransactionDialog();

    const transactionId = screen.getByRole("textbox", {
      name: "Transaction ID",
    });
    await waitFor(() =>
      expect(transactionId).toHaveAttribute("placeholder", "Enter custom ID"),
    );
    await user.type(
      screen.getByRole("combobox", { name: "Name or description" }),
      "Coffee beans",
    );
    await user.type(screen.getByRole("textbox", { name: "Amount" }), "12.50");
    const save = screen.getByRole("button", { name: "Save" });
    await waitFor(() => expect(save).toBeEnabled());
    await user.click(save);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Enter a custom transaction ID or enable automatic IDs in Settings.",
    );
    expect(apiMocks.post).not.toHaveBeenCalled();
  });

  it("combines exact ID, type, and amount filters and forwards them to export", async () => {
    const user = userEvent.setup();
    exportMocks.downloadWorkspaceExport.mockResolvedValue("filtered.csv");
    renderTransactions();

    await screen.findByRole("heading", { name: "Transactions" });
    await user.click(screen.getByRole("button", { name: "Filters" }));
    await user.type(
      screen.getByRole("textbox", { name: "Transaction ID" }),
      "0042",
    );
    await user.click(screen.getByRole("button", { name: "All types" }));
    await user.click(screen.getByRole("option", { name: "Expense" }));
    await user.type(screen.getByRole("textbox", { name: "Min amount" }), "12.50");
    await user.type(screen.getByRole("textbox", { name: "Max amount" }), "99.99");
    await user.click(screen.getByRole("button", { name: "Apply filters" }));

    const expectedQuery =
      "transactionId=0042&type=expense&minAmountMinor=1250&maxAmountMinor=9999";
    expect(screen.getByTestId("location-search")).toHaveTextContent(
      `?${expectedQuery}`,
    );
    await waitFor(() => {
      expect(apiMocks.get).toHaveBeenCalledWith(
        `/workspaces/workspace-home/transactions?${expectedQuery}&limit=100`,
      );
    });

    await user.click(screen.getByRole("button", { name: "Export CSV" }));
    await waitFor(() =>
      expect(exportMocks.downloadWorkspaceExport).toHaveBeenCalled(),
    );
    const [workspaceId, forwarded] =
      exportMocks.downloadWorkspaceExport.mock.calls.at(-1)!;
    expect(workspaceId).toBe("workspace-home");
    expect((forwarded as URLSearchParams).toString()).toBe(expectedQuery);
  });

  it("opens a URL-selected authorized transaction and clears missing IDs safely", async () => {
    const user = userEvent.setup();
    apiMocks.get.mockImplementation((path: string) => {
      if (path.endsWith("/accounts")) {
        return Promise.resolve([
          {
            id: "account-home",
            name: "Everyday account",
            type: "Cash",
            balanceMinor: 0,
            currency: "INR",
          },
        ]);
      }
      if (path.endsWith("/transactions/transaction-linked")) {
        return Promise.resolve({
          id: "transaction-linked",
          merchant: "Linked purchase",
          category: "Supplies",
          type: "expense",
          amountMinor: 1250,
          currency: "INR",
          occurredAt: "2026-08-06T00:00:00.000Z",
          accountId: "account-home",
        });
      }
      return Promise.resolve([]);
    });

    renderTransactions("/app/transactions?transaction=transaction-linked");
    expect(await screen.findByRole("dialog")).toHaveTextContent("Linked purchase");
    expect(apiMocks.get).toHaveBeenCalledWith(
      "/workspaces/workspace-home/transactions/transaction-linked",
    );
    await user.click(screen.getByRole("button", { name: "Close dialog" }));
    expect(screen.getByTestId("location-search")).toBeEmptyDOMElement();

    cleanup();
    vi.clearAllMocks();
    apiMocks.get.mockImplementation((path: string) => {
      if (path.endsWith("/accounts")) return Promise.resolve([]);
      if (path.endsWith("/transactions/missing")) return Promise.reject(new Error("not found"));
      return Promise.resolve([]);
    });
    renderTransactions("/app/transactions?transaction=missing");
    await waitFor(() => expect(screen.getByTestId("location-search")).toBeEmptyDOMElement());
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("shows and copies the public transaction ID", async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(window.navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    apiMocks.get.mockImplementation((path: string) => {
      if (path.endsWith("/accounts")) {
        return Promise.resolve([
          {
            id: "account-home",
            name: "Everyday account",
            type: "Cash",
            balanceMinor: 0,
            currency: "INR",
          },
        ]);
      }
      if (path.endsWith("/transactions")) {
        return Promise.resolve([
          {
            id: "transaction-public-id",
            transactionId: "000042",
            transactionIdScope: "income",
            merchant: "Invoice payment",
            category: "Freelance",
            type: "income",
            amountMinor: 240000,
            currency: "INR",
            accountId: "account-home",
            occurredAt: "2026-08-08T00:00:00.000Z",
          },
        ]);
      }
      return Promise.resolve([]);
    });

    renderTransactions();
    const row = await screen.findByRole("button", { name: /Invoice payment/ });
    expect(row).toHaveTextContent("ID 000042");
    await user.click(row);
    expect(await screen.findByRole("dialog")).toHaveTextContent("000042");
    await user.click(
      screen.getByRole("button", { name: "Copy transaction id" }),
    );
    await waitFor(() => expect(writeText).toHaveBeenCalledWith("000042"));

    Object.defineProperty(window.navigator, "clipboard", {
      configurable: true,
      value: undefined,
    });
  });

  it("invalidates period reviews after deleting a live transaction", async () => {
    const user = userEvent.setup();
    apiMocks.delete.mockResolvedValue(undefined);
    apiMocks.get.mockImplementation((path: string) => {
      if (path.endsWith("/accounts")) return Promise.resolve([]);
      if (path.endsWith("/transactions")) {
        return Promise.resolve([
          {
            id: "transaction-delete",
            merchant: "Duplicate lunch",
            category: "Client meals",
            type: "expense",
            amountMinor: 4800,
            currency: "INR",
            accountId: "account-home",
            occurredAt: "2026-08-08T00:00:00.000Z",
          },
        ]);
      }
      return Promise.resolve([]);
    });

    const { client } = renderTransactions();
    const invalidate = vi.spyOn(client, "invalidateQueries");

    await user.click(
      await screen.findByRole("button", { name: /Duplicate lunch/ }),
    );
    await user.click(screen.getByRole("button", { name: "Delete transaction" }));
    await user.click(
      within(screen.getByRole("alert")).getByRole("button", {
        name: "Delete transaction",
      }),
    );

    await waitFor(() => {
      expect(apiMocks.delete).toHaveBeenCalledWith(
        "/workspaces/workspace-home/transactions/transaction-delete",
      );
    });
    await waitFor(() => {
      expect(invalidate).toHaveBeenCalledWith({
        queryKey: ["period-reviews", "workspace-home"],
      });
    });
  });
});

describe("HomePage monthly summary", () => {
  beforeEach(() => {
    apiMocks.get.mockImplementation((path: string) => {
      if (path.endsWith("/accounts")) {
        return Promise.resolve([
          {
            id: "account-home",
            name: "Everyday account",
            type: "Cash",
            balanceMinor: 2820000,
            currency: "INR",
          },
        ]);
      }
      if (path.includes("/transactions?from=")) {
        return Promise.resolve(dayTransactions);
      }
      if (path.endsWith("/budgets") || path.endsWith("/transactions")) {
        return Promise.resolve([]);
      }
      if (path.includes("/dashboard")) {
        return Promise.resolve(monthlyDashboard);
      }
      return Promise.resolve([]);
    });
    vi.stubGlobal("ResizeObserver", ResizeObserverStub);
    vi.stubGlobal("IntersectionObserver", IntersectionObserverStub);
    vi.stubGlobal(
      "matchMedia",
      vi.fn(() => ({
        matches: false,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })),
    );
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("puts available balances first and renders summary values as a chart", async () => {
    renderHome();

    const balance = await screen.findByText("Available across accounts");
    const chart = screen.getByRole("heading", {
      name: "Income versus spending",
    });
    expect(
      screen.queryByRole("heading", { name: "Monthly summary" }),
    ).not.toBeInTheDocument();
    expect(
      balance.compareDocumentPosition(chart) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("keeps the period selector and review reachable when no accounts are active", async () => {
    const noAccountAppValue: AppContextValue = {
      ...liveAppValue,
      workspace: {
        ...liveWorkspace,
        permissions: [
          ...(liveWorkspace.permissions ?? []),
          "view_balances",
        ],
      },
    };
    apiMocks.get.mockImplementation((path: string) => {
      if (path.endsWith("/accounts")) return Promise.resolve([]);
      if (path.includes("/period-reviews?")) return Promise.resolve([]);
      if (path.endsWith("/budgets") || path.endsWith("/transactions")) {
        return Promise.resolve([]);
      }
      if (path.includes("/dashboard")) return Promise.resolve(monthlyDashboard);
      return Promise.resolve([]);
    });

    renderHome("/app/home?month=2026-07", noAccountAppValue);

    expect(await screen.findByRole("heading", { name: "No accounts yet" })).toBeInTheDocument();
    expect(screen.getByLabelText("Dashboard period")).toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: "Period review" })).toBeInTheDocument();
  });

  it("shows selected-month cashflow by default and can switch to year totals", async () => {
    const user = userEvent.setup();
    apiMocks.get.mockImplementation((path: string) => {
      if (path.endsWith("/accounts")) {
        return Promise.resolve([
          {
            id: "account-home",
            name: "Everyday account",
            type: "Cash",
            balanceMinor: 2820000,
            currency: "INR",
          },
        ]);
      }
      if (path.endsWith("/budgets") || path.endsWith("/transactions")) {
        return Promise.resolve([]);
      }
      if (path.includes("from=2026-01-01") && path.includes("to=2026-12-31")) {
        return Promise.resolve(yearlyDashboard);
      }
      if (path.includes("/dashboard")) return Promise.resolve(monthlyDashboard);
      return Promise.resolve([]);
    });

    renderHome();

    const balanceCard = await screen.findByRole("region", {
      name: "Account balance overview",
    });
    expect(await screen.findByText("Selected month · July 2026")).toBeInTheDocument();
    expect(within(balanceCard).getByText("₹55,000")).toBeInTheDocument();
    expect(within(balanceCard).getByText("₹21,000")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Balance summary period" }));
    await user.click(screen.getByRole("option", { name: "Year" }));

    expect(await screen.findByText("Current year · 2026")).toBeInTheDocument();
    expect(within(balanceCard).getByText("₹180,000")).toBeInTheDocument();
    expect(within(balanceCard).getByText("₹75,000")).toBeInTheDocument();
    expect(within(balanceCard).getByText("₹105,000")).toBeInTheDocument();
    expect(apiMocks.get).toHaveBeenCalledWith(
      "/workspaces/workspace-home/dashboard?from=2026-01-01&to=2026-12-31",
    );
  });

  it("renders every day of the selected month as one stacked vertical bar", async () => {
    renderHome();

    const chartHeading = await screen.findByRole("heading", {
      name: "Daily money movement",
    });
    const chartCard = chartHeading.closest("section");
    expect(chartCard).not.toBeNull();
    expect(within(chartCard!).getAllByTestId("daily-month-bar")).toHaveLength(31);
    expect(
      within(chartCard!).getByRole("button", { name:
        "15 July: received ₹3,000; expenses ₹1,200",
      }),
    ).toBeInTheDocument();
    expect(within(chartCard!).getByText("Received")).toBeInTheDocument();
    expect(within(chartCard!).getByText("Expenses")).toBeInTheDocument();
  });

  it("opens daily bar details with income, expenses, transfers, and entries", async () => {
    const user = userEvent.setup();
    renderHome();

    await user.click(
      await screen.findByRole("button", {
        name: "15 July: received ₹3,000; expenses ₹1,200",
      }),
    );

    expect(
      await screen.findByRole("dialog", { name: "Daily details for 2026-07-15" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Move to savings")).toBeInTheDocument();
    expect(screen.getByText("Transfer")).toBeInTheDocument();
    expect(screen.getAllByText("₹500")).toHaveLength(2);
    expect(apiMocks.get).toHaveBeenCalledWith(
      "/workspaces/workspace-home/transactions?from=2026-07-15T00%3A00%3A00.000Z&to=2026-07-16T00%3A00%3A00.000Z&limit=12",
    );
  });

  it("removes the dashboard period and export card", async () => {
    renderHome();

    await screen.findByRole("heading", { name: "Income versus spending" });
    expect(
      screen.queryByLabelText("Dashboard period and export"),
    ).not.toBeInTheDocument();
  });

  it("keeps every chart container constrained to the mobile viewport", () => {
    expect(indexCss).toContain(
      ".daily-month-stack {\n  position: relative;\n  height: 100%;",
    );
    expect(indexCss).toContain(
      "grid-template-rows: minmax(0, 1fr) 1.35rem;\n  align-items: stretch;",
    );
    expect(indexCss).toContain(
      ".daily-month-stack span {\n  position: absolute;\n  left: 0;",
    );
    expect(indexCss).toContain(
      ".dashboard-cashflow-chart,\n.insight-hero,\n.insight-bars,\n.analytics-grid {",
    );
    expect(indexCss).toContain("max-width: 100%;\n  min-width: 0;");
    expect(indexCss).toContain(
      ".comparison-insights strong {\n  overflow-wrap: anywhere;",
    );
    expect(indexCss).toContain(
      ".transaction-filter-date-actions {\n    grid-column: 1 / -1;\n    display: grid;\n    grid-template-columns: minmax(0, 1fr);",
    );
    expect(indexCss).toContain(
      ".filter-panel {\n  container-type: inline-size;",
    );
    expect(indexCss).toContain("@container (max-width: 30rem) {");
    expect(indexCss).toContain(
      ".transaction-filter-dates {\n    grid-template-columns: minmax(0, 1fr);",
    );
    expect(indexCss).toContain(
      "grid-template-columns: repeat(auto-fit, minmax(min(100%, 14rem), 1fr));",
    );
    expect(indexCss).toContain(
      "grid-template-columns: repeat(auto-fit, minmax(min(100%, 12rem), 1fr));",
    );
    expect(indexCss).toContain(".filter-panel > .transaction-filter-dates {");
    expect(indexCss).toContain(".filter-panel > .transaction-filter-kind {");
    expect(indexCss).toContain(
      ".filter-panel > .transaction-filter-kind > div {",
    );
    expect(indexCss).toContain(".transaction-filter-kind > span {");
    expect(indexCss).toContain(".filter-panel.transaction-filter-panel {");
    expect(indexCss).toContain(
      ".filter-panel.transaction-filter-panel {\n  width: 100%;\n  display: grid;\n  grid-template-columns: minmax(0, 1fr);\n  align-items: stretch;\n  justify-content: stretch;\n  gap: var(--space-3);",
    );
    expect(indexCss).toContain(
      ".transaction-filter-kind > span {\n  display: block;\n  width: 100%;\n  margin: 0;",
    );
    expect(indexCss).toContain(
      "padding-top: var(--space-3);\n  border-top: 1px solid var(--line);",
    );
    expect(indexCss).toContain(
      ".income-spending-comparison {\n  display: grid;\n  gap: var(--space-3);",
    );
    expect(indexCss).toContain(
      "min-height: 218px;\n    padding: var(--space-2) var(--space-3) 2.75rem;",
    );
    expect(indexCss).toContain(
      ".cashflow-empty-state {\n    height: 156px;\n    gap: var(--space-2);",
    );
    expect(indexCss).toContain(
      ".cashflow-empty-bars,\n.insight-bars {\n  display: grid;",
    );
    expect(indexCss).toContain(
      "column-gap: clamp(var(--space-3), 3vw, var(--space-6));",
    );
    expect(indexCss).toContain(
      ".insight-bars {\n  grid-template-columns: repeat(auto-fit, minmax(24px, 1fr));",
    );
    expect(indexCss).toContain(
      ".home-dashboard-card {\n  box-sizing: border-box;\n  width: 100%;\n  padding: clamp(var(--space-4), 4.5vw, var(--space-6));",
    );
    expect(indexCss).toContain(
      ".comparison-bar > span i {\n  display: block;\n  width: 100%;",
    );
    expect(indexCss).toContain(
      ".balance-total {\n  width: 100%;\n  min-width: 0;",
    );
  });

  it("applies the shared responsive gutter to every dashboard data card", async () => {
    renderHome();

    const cashflowHeading = await screen.findByRole("heading", {
      name: "Income versus spending",
    });
    const categoryHeading = screen.getByRole("heading", {
      name: "Spending by category",
    });
    const trendHeading = screen.getByRole("heading", { name: "Monthly trend" });

    for (const heading of [cashflowHeading, categoryHeading, trendHeading]) {
      expect(heading.closest("section")).toHaveClass("home-dashboard-card");
    }
  });

  it("keeps a visible baseline bar chart when the selected period has no activity", async () => {
    apiMocks.get.mockImplementation((path: string) => {
      if (path.endsWith("/accounts")) {
        return Promise.resolve([
          {
            id: "account-home",
            name: "Everyday account",
            type: "Cash",
            balanceMinor: 0,
            currency: "INR",
          },
        ]);
      }
      if (path.endsWith("/budgets") || path.endsWith("/transactions")) {
        return Promise.resolve([]);
      }
      if (path.includes("/dashboard")) {
        return Promise.resolve({
          ...monthlyDashboard,
          balanceMinor: 0,
          incomeMinor: 0,
          spendingMinor: 0,
          cashflow: [],
          monthlyTrend: [],
          topCategories: [],
        });
      }
      return Promise.resolve([]);
    });

    renderHome();

    await screen.findByRole("heading", { name: "Income versus spending" });
    expect(screen.getAllByTestId("cashflow-empty-bar")).toHaveLength(7);
    expect(screen.getByText("No recorded cashflow yet")).toBeInTheDocument();
  });

  it("requests the URL-selected month", async () => {
    renderHome();

    await screen.findByRole("heading", { name: "Income versus spending" });
    await waitFor(() => {
      expect(apiMocks.get).toHaveBeenCalledWith(
        "/workspaces/workspace-home/dashboard?month=2026-07",
      );
    });

    expect(screen.getAllByText("July 2026")).not.toHaveLength(0);
  });

  it("requests true all-time data and propagates the exact period to dashboard drilldowns", async () => {
    apiMocks.get.mockImplementation((path: string) => {
      if (path.endsWith("/accounts")) {
        return Promise.resolve([
          {
            id: "account-home",
            name: "Everyday account",
            type: "Cash",
            balanceMinor: 2820000,
            currency: "INR",
          },
        ]);
      }
      if (path.endsWith("/budgets") || path.endsWith("/transactions")) {
        return Promise.resolve([]);
      }
      if (path.includes("/dashboard")) return Promise.resolve(dashboardWithSections);
      return Promise.resolve([]);
    });

    renderHome("/app/home?period=all-time&allTime=true");

    expect(await screen.findByRole("heading", { name: "Upcoming and overdue goals" })).toBeInTheDocument();
    await waitFor(() => {
      expect(apiMocks.get).toHaveBeenCalledWith(
        "/workspaces/workspace-home/dashboard?allTime=true",
      );
    });
    expect(screen.getByRole("heading", { name: "Useful insights" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "By account" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "By transaction type" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Everyday account/i })).toHaveAttribute(
      "href",
      "/app/transactions?allTime=true&accountId=account-home",
    );
    expect(screen.getByRole("link", { name: /Rent reserve/i })).toHaveAttribute(
      "href",
      "/app/goals?goal=goal-nearest",
    );
  });

  it("opens a daily cashflow popover with the exact-day transaction list", async () => {
    const user = userEvent.setup();
    renderHome();

    await screen.findByRole("heading", { name: "Income versus spending" });
    await user.click(
      screen.getByRole("button", {
        name: "View cashflow details for 2026-07-15",
      }),
    );

    await waitFor(() => {
      expect(apiMocks.get).toHaveBeenCalledWith(
        "/workspaces/workspace-home/transactions?from=2026-07-15T00%3A00%3A00.000Z&to=2026-07-16T00%3A00%3A00.000Z&limit=12",
      );
    });
    expect(
      await screen.findByRole("dialog", {
        name: "Cashflow for 2026-07-15",
      }),
    ).toBeInTheDocument();
    expect(screen.getByText("Electricity bill")).toBeInTheDocument();
    expect(
      screen.getByRole("link", {
        name: "View all entries for 2026-07-15",
      }),
    ).toHaveAttribute("href", "/app/transactions?date=2026-07-15");
  });

  it("uses the amount treatment instead of a directional tile in recent activity", async () => {
    const dashboardWithRecentActivity = {
      ...monthlyDashboard,
      recentTransactions: [
        {
          id: "transaction-recent-debit",
          merchant: "Market run",
          category: "Groceries",
          type: "expense",
          amountMinor: 45000,
          currency: "INR",
          accountId: "account-home",
          occurredAt: "2026-07-15T12:00:00.000Z",
          createdAt: "2026-07-15T12:05:00.000Z",
          creator: {
            name: "Asha Rao",
            initials: "AR",
            status: "active",
          },
        },
        {
          id: "transaction-recent-credit",
          merchant: "Monthly salary",
          category: "Salary",
          type: "income",
          amountMinor: 120000,
          currency: "INR",
          accountId: "account-home",
          occurredAt: "2026-07-15T09:00:00.000Z",
          createdAt: "2026-07-15T09:05:00.000Z",
          creator: {
            name: "Ravi Shah",
            initials: "RS",
            status: "active",
          },
        },
      ],
    };
    apiMocks.get.mockImplementation((path: string) => {
      if (path.endsWith("/accounts")) {
        return Promise.resolve([
          {
            id: "account-home",
            name: "Everyday account",
            type: "Cash",
            balanceMinor: 2820000,
            currency: "INR",
          },
        ]);
      }
      if (path.endsWith("/budgets") || path.endsWith("/transactions")) {
        return Promise.resolve([]);
      }
      if (path.includes("/dashboard")) {
        return Promise.resolve(dashboardWithRecentActivity);
      }
      return Promise.resolve([]);
    });

    renderHome();

    const debitRow = await screen.findByRole("button", { name: /Market run/i });
    const creditRow = screen.getByRole("button", { name: /Monthly salary/i });

    expect(debitRow.querySelector(".transaction-amount")).toHaveClass(
      "transaction-amount-debit",
    );
    expect(creditRow.querySelector(".transaction-amount")).toHaveClass(
      "transaction-amount-credit",
    );
    expect(debitRow.querySelector(".category-icon")).not.toBeInTheDocument();
    expect(creditRow.querySelector(".category-icon")).not.toBeInTheDocument();
    expect(debitRow.querySelector(".creator-avatar")).toBeInTheDocument();
    expect(creditRow.querySelector(".creator-avatar")).toBeInTheDocument();
  });
});

describe('transaction search fields', () => {
  it('matches transaction IDs, names, descriptions, notes, and contact names without private contact fields', () => {
    const transaction = {
      transactionId: '004218',
      merchant: 'City Supermarket',
      category: 'Groceries',
      note: 'Weekly household run',
      description: 'Bought supplies for the kitchen',
      contact: {
        id: 'contact-1',
        name: 'Asha Sharma',
        phone: '+91 98765 43210',
        email: 'asha@example.com',
      },
    }

    expect(matchesTransactionSearch(transaction, 'supermarket')).toBe(true)
    expect(matchesTransactionSearch(transaction, '421')).toBe(true)
    expect(matchesTransactionSearch(transaction, 'kitchen')).toBe(true)
    expect(matchesTransactionSearch(transaction, 'household')).toBe(true)
    expect(matchesTransactionSearch(transaction, 'asha')).toBe(true)
    expect(matchesTransactionSearch(transaction, 'groceries')).toBe(false)
    expect(matchesTransactionSearch(transaction, '98765')).toBe(false)
    expect(matchesTransactionSearch(transaction, 'asha@example.com')).toBe(false)
  })
})
