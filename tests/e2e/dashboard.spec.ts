import { expect, test } from "@playwright/test";

test("creates and safely tests a worker", async ({ page }) => {
  await page.goto("/workers/new");
  await expect(page.getByRole("heading", { name: "Start with the outcome" })).toBeVisible();
  await page.getByRole("button", { name: "Create draft" }).click();
  await expect(page.getByRole("heading", { name: "Inbound Sales Guardian" })).toBeVisible();
  await expect(page.getByText("What this worker may do")).toBeVisible();
  await page.getByRole("button", { name: "Test safely" }).click();
  await expect(page).toHaveURL(/\/runs\//);
  await expect(page.getByRole("heading", { name: "What the worker did" })).toBeVisible();
  await expect(page.getByText(/Would request approval to send an email response/)).toBeVisible();
});

test("deploys, pauses, and resumes from real controls", async ({ page }) => {
  await page.goto("/workers/worker_inbound_sales");
  const deploy = page.getByRole("button", { name: "Deploy" });
  if (await deploy.isVisible()) await deploy.click();
  await expect(page.getByRole("button", { name: "Pause" })).toBeVisible();
  await page.getByRole("button", { name: "Pause" }).click();
  await expect(page.getByRole("button", { name: "Resume" })).toBeVisible();
  await page.getByRole("button", { name: "Resume" }).click();
  await expect(page.getByRole("button", { name: "Pause" })).toBeVisible();
});
