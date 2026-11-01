import { expect, test } from "@playwright/test";

// The server seeds the categories from the fixture config on its first start:
// Dining, Groceries, Rent, with ACME GROCERS mapped to Groceries.

test.afterEach(async ({ request }) => {
  // Put the shared database back for the next test.
  const { categories } = await (await request.get("/api/categories")).json();
  for (const c of categories as { id: number; name: string }[]) {
    if (!["Dining", "Groceries", "Rent"].includes(c.name))
      await request.delete(`/api/categories/${c.id}`);
  }
});

test("a new category is offered on Spending, and stays deletable until used", async ({
  page,
}) => {
  await page.goto("/categories");
  const groceries = page.getByRole("listitem", { name: "Groceries" });
  await expect(groceries).toContainText("Used by 1 merchant");
  await expect(
    page.getByRole("button", { name: "Delete Groceries" }),
  ).toBeDisabled();

  await page.getByRole("textbox", { name: "New category" }).fill("Travel");
  await page.getByRole("button", { name: "Add" }).click();
  await expect(page.getByRole("listitem", { name: "Travel" })).toContainText(
    "Not used yet",
  );

  await page.goto("/spending?yearMonth=2026-02");
  const card = page.locator("div.rounded-2xl", { hasText: "CITY CAFE" });
  await expect(card.getByRole("option", { name: "Travel" })).toBeAttached();

  await page.goto("/categories");
  await page.getByRole("button", { name: "Delete Travel" }).click();
  await expect(page.getByRole("listitem", { name: "Travel" })).toHaveCount(0);
});
