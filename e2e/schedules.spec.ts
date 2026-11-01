import { expect, test } from "@playwright/test";

// The e2e stack has no chat.db to import from, so this covers the schedules
// themselves; what the import makes of them is backend/test/integration/schedules.test.ts.

test.afterEach(async ({ request }) => {
  // Put the shared database back for the next test.
  const { schedules } = await (await request.get("/api/schedules")).json();
  for (const { id } of schedules as { id: number }[]) {
    await request.delete(`/api/schedules/${id}`);
  }
});

test.describe("schedules", () => {
  test("adds, edits and deletes a schedule, and each change is stored", async ({
    page,
  }) => {
    await page.goto("/schedules");
    await expect(
      page.getByText("No schedules yet. Add one for anything that repeats"),
    ).toBeVisible();

    await page.getByRole("button", { name: "New schedule" }).click();
    await page.getByRole("textbox", { name: "Merchant" }).fill("RENT");
    await page.getByRole("spinbutton", { name: "Amount" }).fill("1500");
    await page.getByRole("combobox", { name: "Category" }).selectOption("Rent");
    await page.getByLabel("Start date").fill("2026-01-31");
    await page.getByRole("button", { name: "Add schedule" }).click();

    const rent = page.getByRole("listitem", { name: "RENT" });
    await expect(rent).toContainText("Every month on the 31st · Checking · Rent");
    await expect(rent).toContainText("−1,500 EGP");

    await page.reload();
    await rent.getByRole("button", { name: "Edit RENT" }).click();
    await page.getByRole("spinbutton", { name: "Interval" }).fill("2");
    await page.getByRole("combobox", { name: "Frequency" }).selectOption("weeks");
    await page.getByRole("button", { name: "Save" }).click();
    await expect(rent).toContainText("Every 2 weeks on Saturday");

    await rent.getByRole("button", { name: "Delete RENT" }).click();
    await rent.getByRole("button", { name: "Delete", exact: true }).click();
    await expect(rent).toHaveCount(0);
    await page.reload();
    await expect(
      page.getByText("No schedules yet. Add one for anything that repeats"),
    ).toBeVisible();
  });

  test("shows the backend's refusal", async ({ page, request }) => {
    await page.goto("/schedules");
    await page.getByRole("button", { name: "New schedule" }).click();
    await page.getByRole("textbox", { name: "Merchant" }).fill("GYM");
    await page.getByRole("spinbutton", { name: "Amount" }).fill("99999999999");
    await page.getByRole("button", { name: "Add schedule" }).click();
    await expect(page.getByRole("alert")).toHaveText(
      "amount must have at most 2 decimal places and be less than 10,000,000,000",
    );
    const { schedules } = await (await request.get("/api/schedules")).json();
    expect(schedules).toEqual([]);
  });
});
