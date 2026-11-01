import { expect, test, type Page } from "@playwright/test";

// Runs against the synthetic ledger in backend/test/fixtures/messages.ts.

/** The ledger's body rows (after the header and the total row). */
const ledgerRows = (page: Page) =>
  page.locator("table tbody").nth(1).locator("tr");
const count = (page: Page) =>
  page.locator("span", { hasText: /^\d+ transactions?$/ });

test.describe("transactions", () => {
  test("lists January and totals it", async ({ page }) => {
    await page.goto("/transactions?yearMonth=2026-01");
    await expect(
      page.getByRole("heading", { name: "January 2026" }),
    ).toBeVisible();
    await expect(count(page)).toHaveText("4 transactions");
    await expect(ledgerRows(page)).toHaveCount(4);
    await expect(ledgerRows(page).first()).toContainText("CARD PAYMENT");
    // Both legs of the card payment carry a transfer badge naming the other account.
    await expect(ledgerRows(page).getByText("↔ Credit Card")).toBeVisible();
    await expect(ledgerRows(page).getByText("↔ Checking")).toBeVisible();
  });

  test("filters narrow the list and live in the URL", async ({ page }) => {
    await page.goto("/transactions?yearMonth=2026-01");
    await expect(count(page)).toHaveText("4 transactions");

    await page
      .getByRole("combobox", { name: "Account", exact: true })
      .selectOption("checking");
    await expect(count(page)).toHaveText("2 transactions");
    await expect(page).toHaveURL(/account=checking/);

    await page
      .getByRole("radiogroup", { name: "Transfers" })
      .getByText("No transfers")
      .click();
    await expect(count(page)).toHaveText("1 transaction");
    await expect(ledgerRows(page)).toContainText(["EMPLOYER LTD"]);

    await page.reload();
    await expect(count(page)).toHaveText("1 transaction");
  });

  test("a refetch leaves the table where it is", async ({ page }) => {
    await page.goto("/transactions?yearMonth=2026-01&account=checking");
    await expect(page.getByLabel("2 transactions")).toBeVisible();
    const top = async () => (await page.getByRole("table").boundingBox())!.y;
    const before = await top();

    // Hold the next response so the page stays mid-fetch while it is measured.
    let release!: () => void;
    const held = new Promise<void>((resolve) => (release = resolve));
    await page.route("**/api/transactions?**", async (route) => {
      await held;
      await route.continue();
    });
    await page
      .getByRole("radiogroup", { name: "Direction" })
      .getByText("Money out")
      .click();
    await expect(page.getByRole("status", { name: "Updating" })).toBeVisible();
    expect(await top()).toBe(before);

    release();
    await expect(page.getByRole("status", { name: "Updating" })).toBeHidden();
    expect(await top()).toBe(before);
  });

  test("merchant search", async ({ page }) => {
    await page.goto("/transactions?yearMonth=2026-02");
    await page.getByPlaceholder("Search merchant…").fill("cafe");
    await expect(count(page)).toHaveText("1 transaction");
    await expect(ledgerRows(page)).toContainText(["CITY CAFE"]);
  });

  test("a row opens its detail modal with the bank message", async ({
    page,
  }) => {
    await page.goto("/transactions?yearMonth=2026-02");
    await page.getByPlaceholder("Search merchant…").fill("cafe");
    await expect(count(page)).toHaveText("1 transaction");

    await ledgerRows(page).first().click();
    const dialog = page.getByRole("dialog");
    await expect(
      dialog.getByRole("heading", { name: "CITY CAFE" }),
    ).toBeVisible();
    await expect(dialog).toContainText(
      "Your card ending *2222 was charged EGP 40.00 at CITY CAFE. Available balance EGP 4,860.00",
    );

    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
  });

  test("month navigation", async ({ page }) => {
    await page.goto("/transactions?yearMonth=2026-01");
    await page.getByRole("button", { name: "Next month" }).click();
    await expect(
      page.getByRole("heading", { name: "February 2026" }),
    ).toBeVisible();
    await expect(count(page)).toHaveText("3 transactions");
    await page.getByRole("button", { name: "Next month" }).click();
    await expect(
      page.getByText("No transactions match these filters."),
    ).toBeVisible();
  });
});

test.describe("balances", () => {
  test("February carries January forward", async ({ page }) => {
    await page.goto("/balances?yearMonth=2026-02");
    const checking = page.getByRole("row", { name: /^Checking/ });
    await expect(checking.getByRole("cell").nth(1)).toHaveText("5,750"); // opening
    await expect(checking.getByRole("cell").nth(6)).toHaveText("6,950"); // closing
    await expect(
      page
        .getByRole("row", { name: /^Credit Card/ })
        .getByRole("cell")
        .nth(6),
    ).toHaveText("-140");
    await expect(
      page.getByRole("row", { name: /^Total \(EGP\)/ }),
    ).toBeVisible();
  });
});

test.describe("navigation", () => {
  test("tabs keep the month", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveURL(/\/transactions$/);
    await page.goto("/transactions?yearMonth=2026-02");
    await page.getByRole("link", { name: "Balances" }).click();
    await expect(page).toHaveURL(/\/balances\?yearMonth=2026-02$/);
    await page.getByRole("link", { name: "Spending" }).click();
    await expect(
      page.getByRole("heading", { name: "February 2026" }),
    ).toBeVisible();
  });
});
