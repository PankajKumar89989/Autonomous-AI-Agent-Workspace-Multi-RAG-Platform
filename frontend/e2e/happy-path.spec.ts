import { expect, test } from "@playwright/test";

const DOCUMENT = "Lithium battery storage systems hold renewable energy from solar and wind farms. Grid scale batteries improve energy storage capacity. ".repeat(6);

test("register, upload a document, ask a cited question, run research, export, log out", async ({ page }) => {
  const email = `e2e-${Date.now()}@example.com`;

  await page.goto("/register");
  await page.getByLabel("Full name").fill("E2E Tester");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("Secret123");
  await page.getByRole("button", { name: "Sign up" }).click();
  await expect(page).toHaveURL(/\/dashboard/);

  await page.getByRole("link", { name: "Workspaces" }).click();
  await page.getByRole("button", { name: "New workspace" }).click();
  await page.getByLabel("Name").fill("E2E workspace");
  await page.getByRole("button", { name: "Create workspace" }).click();
  await expect(page.getByRole("heading", { name: "E2E workspace" })).toBeVisible();

  await page.getByRole("button", { name: "New knowledge base" }).click();
  await page.getByLabel("Name").fill("Energy reports");
  await page.getByRole("button", { name: "Create knowledge base" }).click();
  await expect(page.getByRole("heading", { name: "Energy reports" })).toBeVisible();

  await page.locator('input[type="file"]').setInputFiles({ name: "batteries.txt", mimeType: "text/plain", buffer: Buffer.from(DOCUMENT) });
  await expect(page.getByText("Indexed", { exact: true })).toBeVisible({ timeout: 90_000 }); // needs the worker

  await page.getByRole("link", { name: "Chat", exact: true }).first().click();
  await page.getByLabel("Your question").fill("How do lithium batteries store solar energy?");
  await page.getByRole("button", { name: "Send message" }).click();
  await expect(page.getByRole("button", { name: /batteries\.txt/ }).first()).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText("Sources", { exact: true })).toBeVisible();

  await page.getByRole("link", { name: "Research", exact: true }).first().click();
  await page.getByLabel("Objective").fill("Summarise lithium battery storage for solar energy");
  await page.getByRole("button", { name: "Start research" }).click();
  await expect(page).toHaveURL(/\/research\/[0-9a-f-]{36}/);
  await expect(page.getByText("Executive Summary").first()).toBeVisible({ timeout: 90_000 });
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export Markdown" }).click();
  expect((await download).suggestedFilename()).toMatch(/\.md$/);

  await page.getByRole("button", { name: "Log out" }).click();
  await expect(page).toHaveURL(/\/login/);
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/login/); // protected routes bounce anonymous visitors
});

test("wrong password shows an error and keeps the user on the login page", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill("nobody@example.com");
  await page.getByLabel("Password").fill("Wrong12345");
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page.getByRole("alert")).toContainText("Incorrect email or password");
  await expect(page).toHaveURL(/\/login/);
});
