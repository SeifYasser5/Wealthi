import { expect, test } from "@playwright/test";

// CITY CAFE (40 of February's 140) has no merchant category, and at 28.6% it
// is promoted to its own "large" card with a category picker.

async function cityCafeId(
  request: import("@playwright/test").APIRequestContext,
) {
  const res = await request.get(
    "/api/transactions?yearMonth=2026-02&merchant=CITY%20CAFE",
  );
  const { transactions } = await res.json();
  return transactions[0].id as string;
}

test.afterEach(async ({ request }) => {
  // Put the shared database back for the next test.
  await request.patch(
    `/api/transactions/${await cityCafeId(request)}/category`,
    { data: { category: null } },
  );
});

test("breaks February down and categorizes the large uncategorized charge", async ({
  page,
}) => {
  await page.goto("/spending?yearMonth=2026-02");
  await expect(page.getByText("1 category")).toBeVisible();
  await expect(page.getByText("· 1 large")).toBeVisible();
  await expect(page.getByText("Total 140")).toBeVisible();

  const card = page.locator("div.rounded-2xl", { hasText: "CITY CAFE" });
  await card.getByRole("combobox").selectOption("Dining");

  await expect(page.getByText("CITY CAFE")).toHaveCount(0);
  await expect(page.getByText("2 categories")).toBeVisible();
  await expect(page.getByRole("button", { name: /Dining/ })).toBeVisible();

  // The change is stored, not just shown.
  await page.reload();
  await expect(page.getByRole("button", { name: /Dining/ })).toBeVisible();
});

test("expands a category into its merchants", async ({ page }) => {
  await page.goto("/spending?yearMonth=2026-01");
  await page.getByRole("button", { name: /Groceries/ }).click();
  await expect(page.getByRole("cell", { name: "ACME GROCERS" })).toBeVisible();
});
