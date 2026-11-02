import { expect, test } from "@playwright/test";

// The seed stores the fixture patterns (3 enabled, test-bank:disabled
// disabled). The stack's chat.db points nowhere, so a learn run is skipped.

test.afterEach(async ({ request }) => {
  // Put the shared database back for the next test.
  await request.patch("/api/patterns", {
    data: {
      enable: ["test-bank:card-charge"],
      disable: ["test-bank:disabled"],
    },
  });
});

test("lists the stored patterns in Enabled and Disabled tabs", async ({
  page,
}) => {
  await page.goto("/settings");
  await page.getByRole("radio", { name: "Learn" }).click();
  await expect(page.getByRole("tab", { name: "Enabled (3)" })).toBeVisible();
  await page.getByRole("tab", { name: "Disabled (1)" }).click();
  await expect(
    page.getByRole("checkbox", { name: "Enable test-bank:disabled" }),
  ).toBeVisible();
});

test("a toggled pattern moves tab and stays moved", async ({ page }) => {
  await page.goto("/settings");
  await page.getByRole("radio", { name: "Learn" }).click();
  await page
    .getByRole("checkbox", { name: "Enable test-bank:card-charge" })
    .click();
  await expect(page.getByRole("tab", { name: "Enabled (2)" })).toBeVisible();

  // The change is stored, not just shown.
  await page.reload();
  await page.getByRole("tab", { name: "Disabled (2)" }).click();
  await expect(
    page.getByRole("checkbox", { name: "Enable test-bank:card-charge" }),
  ).toBeVisible();
});

test("learning without a chat.db says where it looked", async ({ page }) => {
  await page.goto("/settings");
  await page.getByRole("radio", { name: "Learn" }).click();
  await page.getByRole("button", { name: "Learn patterns" }).click();
  await expect(
    page.getByRole("heading", { name: "Learn skipped" }),
  ).toBeVisible();
  await expect(
    page.getByText(/No chat\.db found at .*no-chat\.db/),
  ).toBeVisible();
});
