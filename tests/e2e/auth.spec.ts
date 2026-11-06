import { expect, test } from "@playwright/test";

/**
 * Signed-in flows. They run only when you provide a real owner account for a LOCAL or throwaway database:
 *   $env:E2E_OWNER_EMAIL="you@example.com"; $env:E2E_OWNER_PASSWORD="your password"; npm run test:e2e
 * Never point these at a database holding real customer data.
 */
const email = process.env.E2E_OWNER_EMAIL;
const password = process.env.E2E_OWNER_PASSWORD;

test("a wrong password shows one generic message", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill("nobody@example.invalid");
  await page.getByLabel("Password").fill("definitely-not-the-password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("alert")).toContainText("do not match an active account");
  await expect(page).toHaveURL(/\/login/);
});

test.describe("owner session", () => {
  test.skip(!email || !password, "set E2E_OWNER_EMAIL and E2E_OWNER_PASSWORD to run");

  test("owner signs in, sees the dashboard and Staff Management, then signs out", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Email").fill(email ?? "");
    await page.getByLabel("Password").fill(password ?? "");
    await page.getByRole("button", { name: "Sign in" }).click();

    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.getByRole("heading", { level: 1, name: "Dashboard" })).toBeVisible();

    await page.goto("/staff");
    await expect(page.getByRole("heading", { level: 1, name: "Staff Management" })).toBeVisible();

    // sign out works from the sidebar (desktop) or the More sheet (phone)
    const signOut = page.getByRole("button", { name: "Sign out" });
    if (!(await signOut.first().isVisible())) {
      await page.getByRole("button", { name: "More" }).click();
    }
    await signOut.first().click();
    await expect(page).toHaveURL(/\/login/);

    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login\?next=%2Fdashboard$/);
  });
});
