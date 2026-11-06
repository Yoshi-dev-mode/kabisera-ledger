import { expect, test } from "@playwright/test";

// These need the app running with NEXT_PUBLIC_SUPABASE_URL / _ANON_KEY set in .env.local
// (the database does not have to contain any users).

test("signed-out visitors are sent to the sign-in page, which shows no financial data", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole("heading", { level: 1, name: "Sign in" })).toBeVisible();
  await expect(page.getByText("Not an official GCash product")).toBeVisible();
  await expect(page.getByText("₱")).toHaveCount(0);
});

test("a protected page remembers where the visitor was going", async ({ page }) => {
  await page.goto("/staff");
  await expect(page).toHaveURL(/\/login\?next=%2Fstaff$/);
});

test("an open-redirect attempt in next is ignored after sign-in page loads", async ({ page }) => {
  await page.goto("/login?next=//evil.example");
  await expect(page.locator('input[name="next"]')).toHaveValue("/dashboard");
});

test("health endpoint reports presence of configuration without values", async ({ request }) => {
  const response = await request.get("/api/health");
  expect(response.ok()).toBe(true);
  const body = await response.json();
  expect(body.status).toBe("ok");
  expect(typeof body.configured.supabaseUrl).toBe("boolean");
  expect(JSON.stringify(body)).not.toContain("http");
});

test("security headers are set, and the CSP is report-only", async ({ request }) => {
  const response = await request.get("/login");
  const headers = response.headers();
  expect(headers["x-content-type-options"]).toBe("nosniff");
  expect(headers["x-frame-options"]).toBe("DENY");
  expect(headers["content-security-policy-report-only"]).toContain("default-src 'self'");
  expect(headers["content-security-policy"]).toBeUndefined();
});
