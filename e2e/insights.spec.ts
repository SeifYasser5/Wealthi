import { expect, test } from "@playwright/test";

// Runs against the synthetic ledger in backend/test/fixtures/messages.ts: the
// clock is real, so the six months end on February 2026, the newest month with
// data. 390 spent (Groceries 350, Uncategorized 40) and 6,200 received.

test("opens on where the money went, and drills into a category", async ({
  page,
}) => {
  await page.goto("/insights");
  await expect(
    page.getByRole("heading", { name: "Spending by category" }),
  ).toBeVisible();
  const summary = page.getByRole("region", { name: "Summary" });
  await expect(summary).toContainText("390");
  await expect(summary).toContainText("6,200");
  await expect(summary).toContainText("+5,810");
  await expect(page.getByLabel("Breakdown")).toContainText("Groceries");

  await page.getByRole("button", { name: "Explore Groceries" }).first().click();
  await expect(page).toHaveURL(/category=Groceries/);
  await expect(
    page.getByRole("button", { name: "Clear category filter" }),
  ).toBeVisible();
});

test("a shortcut and the chart type live in the URL", async ({ page }) => {
  await page.goto("/insights");
  await page.getByRole("button", { name: "Cash flow" }).click();
  await expect(page).toHaveURL(/measure=flow/);
  await page
    .getByRole("radiogroup", { name: "Chart type" })
    .getByText("Table")
    .click();
  await expect(page.getByRole("row", { name: /February 2026/ })).toContainText(
    "1,200",
  );

  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Cash flow by month" }),
  ).toBeVisible();
  await expect(page.getByRole("radio", { name: "Table" })).toBeChecked();
});
