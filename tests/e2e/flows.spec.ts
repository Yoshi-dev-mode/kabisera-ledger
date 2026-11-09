import { expect, test, type Page } from "@playwright/test";

/**
 * Signed-in flows. They need a real owner account on a LOCAL or throwaway database:
 *   $env:E2E_OWNER_EMAIL="you@example.com"; $env:E2E_OWNER_PASSWORD="your password"; npm run test:e2e
 * They never submit a transaction, so they leave no data behind.
 */
const email = process.env.E2E_OWNER_EMAIL;
const password = process.env.E2E_OWNER_PASSWORD;

async function signIn(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email ?? "");
  await page.getByLabel("Password").fill(password ?? "");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
}

test.describe("owner flows", () => {
  test.skip(!email || !password, "set E2E_OWNER_EMAIL and E2E_OWNER_PASSWORD to run");

  test("the cash-in form shows what will happen before anything is saved", async ({ page }) => {
    await signIn(page);
    await page.goto("/transactions/new?type=cash_in");
    await expect(page.getByRole("heading", { level: 1, name: "New transaction" })).toBeVisible();
    await page.getByLabel("Cash-in amount (₱)").fill("1000");
    await page.getByLabel("Service fee (₱)").fill("20");
    const preview = page.getByRole("region", { name: "What will happen" });
    await expect(preview).toContainText("Cash drawer");
    await expect(preview).toContainText("+₱1,020.00");
    await expect(preview).toContainText("GCash wallet");
    await expect(preview).toContainText("\u2212₱1,000.00");
    await expect(preview).toContainText("+₱20.00");
  });

  test("a fee typed with the wrong format is explained instead of guessed", async ({ page }) => {
    await signIn(page);
    await page.goto("/transactions/new?type=cash_in");
    await page.getByLabel("Cash-in amount (₱)").fill("1000");
    await page.getByLabel("Service fee (₱)").fill("2o");
    await expect(page.getByRole("region", { name: "What will happen" })).toContainText("not valid");
  });

  test("an unpaid amount without a customer is explained", async ({ page }) => {
    await signIn(page);
    await page.goto("/transactions/new?type=cash_in");
    await page.getByLabel("Cash-in amount (₱)").fill("1000");
    await page.getByLabel("Left unpaid (₱, optional)").fill("500");
    await expect(page.getByRole("region", { name: "What will happen" })).toContainText("Choose a customer");
  });

  test("mobile load adds the service fee to the full amount owed", async ({ page }) => {
    await signIn(page);
    await page.goto("/transactions/new?type=mobile_load");
    await page.getByLabel("Load amount (₱)").fill("100");
    await page.getByLabel("Service fee (₱)").fill("3");
    await expect(page.getByText("Customer total: ₱103.00")).toBeVisible();
    await expect(page.getByText("Business cost: ₱100.00")).toBeVisible();
    await page.getByLabel("Pay later in full").check();
    await expect(page.getByLabel("Amount owed (₱)")).toHaveValue("103.00");
    await page.getByLabel("Service fee (₱)").fill("-1");
    await expect(page.getByRole("button", { name: "Record mobile load" })).toBeDisabled();
    await expect(page.getByText("Enter a valid service fee of zero or more.")).toBeVisible();
  });

  test("repayment previews tips separately and only shows a GCash reference for GCash", async ({ page }) => {
    await signIn(page);
    await page.goto("/debts/repayment");
    const customer = page.getByLabel("Customer", { exact: true });
    test.skip(!(await customer.count()), "requires an outstanding debt in the test database");
    await customer.selectOption({ index: 1 });
    await page.getByLabel("Debt payment (₱)").fill("0.01");
    await page.getByLabel("Tip (₱, optional)").fill("20");
    await expect(page.getByText("₱20.01", { exact: true })).toBeVisible();
    await expect(page.getByLabel("GCash reference (optional)")).toHaveCount(0);
    await page.getByRole("radio", { name: "GCash" }).check();
    await expect(page.getByLabel("GCash reference (optional)")).toBeVisible();
    await page.getByLabel("Tip (₱, optional)").fill("-1");
    await expect(page.getByRole("button", { name: "Record repayment" })).toBeDisabled();
  });

  test("the first thing a keyboard user reaches is the skip link", async ({ page }) => {
    await signIn(page);
    await page.keyboard.press("Tab");
    await expect(page.getByRole("link", { name: "Skip to content" })).toBeFocused();
  });

  test("every main screen opens for the owner with a single heading", async ({ page }) => {
    await signIn(page);
    const screens: [string, string][] = [
      ["/dashboard", "Dashboard"], ["/transactions", "Transactions"], ["/customers", "Customers"], ["/debts", "Debts"],
      ["/accounts", "Cash and GCash balances"], ["/closing", "Daily closing"], ["/reports", "Reports"],
      ["/staff", "Staff Management"], ["/settings", "Settings"], ["/transactions/new", "New transaction"],
    ];
    for (const [path, title] of screens) {
      await page.goto(path);
      await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
      await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();
    }
  });

  test("on a phone the More sheet opens and closes with the keyboard", async ({ page }) => {
    await signIn(page);
    test.skip((page.viewportSize()?.width ?? 1280) >= 1024, "phone layout only");
    await page.getByRole("button", { name: "More" }).click();
    const sheet = page.getByRole("dialog", { name: "More" });
    await expect(sheet).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(sheet).toBeHidden();
  });

  test("no page needs sideways scrolling", async ({ page }) => {
    await signIn(page);
    for (const path of ["/dashboard", "/transactions", "/customers", "/debts", "/reports", "/closing", "/settings"]) {
      await page.goto(path);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow, `${path} scrolls sideways by ${overflow}px`).toBeLessThanOrEqual(1);
    }
  });
});

test("protected pages send a signed-out visitor to sign in", async ({ page }) => {
  for (const path of ["/closing", "/reports", "/settings", "/accounts", "/debts"]) {
    await page.goto(path);
    await expect(page).toHaveURL(new RegExp(`/login\\?next=${encodeURIComponent(path).replace("%2F", "%2F")}$`));
  }
});
