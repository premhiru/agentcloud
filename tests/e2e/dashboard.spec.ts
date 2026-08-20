import { expect, test } from "@playwright/test";

test("designs, saves, and safely tests a worker", async ({ page }) => {
  await page.goto("/workers/new");
  await expect(page.getByRole("heading", { name: "Start with the outcome" })).toBeVisible();
  await page.getByRole("button", { name: "Design worker" }).click();
  await expect(page).toHaveURL(/\/workers\/build\//, { timeout: 30_000 });
  await expect(page.getByRole("heading", { name: "Inbound Sales Guardian" }).first()).toBeVisible();
  await expect(page.getByRole("heading", { name: "Explicit permission, default deny" })).toBeVisible();
  await page.getByRole("button", { name: "Save version and review" }).click();
  await expect(page).toHaveURL(/\/workers\/(?!build\/)[^/]+$/, { timeout: 30_000 });
  await expect(page.getByText("Worker Studio")).toBeVisible();
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: "Test safely" }).click();
  await expect(page).toHaveURL(/\/runs\//, { timeout: 30_000 });
  await expect(page.getByRole("heading", { name: "What the worker did" })).toBeVisible();
  await expect(page.getByText("Would send the prepared email response")).toBeVisible();
});

test("deploys, pauses, and resumes from real controls", async ({ page }) => {
  await page.goto("/workers/worker_inbound_sales");
  const deploy = page.getByRole("button", { name: "Deploy" });
  const pause = page.getByRole("button", { name: "Pause" });
  await expect(deploy.or(pause)).toBeVisible();
  if (await deploy.isVisible()) await deploy.click();
  await expect(pause).toBeVisible();
  await pause.click();
  await expect(page.getByRole("button", { name: "Resume" })).toBeVisible();
  await page.getByRole("button", { name: "Resume" }).click();
  await expect(page.getByRole("button", { name: "Pause" })).toBeVisible();
});

test("runs the canonical worker through approval and resume", async ({ page }) => {
  await page.goto("/workers/worker_inbound_sales");
  const deploy = page.getByRole("button", { name: "Deploy" });
  const runNow = page.getByRole("button", { name: "Run now" });
  await expect(deploy.or(runNow)).toBeVisible();
  if (await deploy.isVisible()) await deploy.click();
  await runNow.click();
  await expect(page).toHaveURL(/\/runs\//);
  const runUrl = page.url();
  const runId = new URL(runUrl).pathname.split("/").at(-1)!;
  await expect(page.getByText("Send the prepared email response")).toBeVisible();
  await expect(page.getByText("WAITING FOR APPROVAL")).toBeVisible();

  await page.goto("/approvals");
  const approvalCard = page.locator(`[data-run-id="${runId}"]`);
  await approvalCard.getByRole("button", { name: "Approve and view run" }).click();
  await expect(page).toHaveURL(runUrl);
  await expect(page.getByText("Sent one approved Gmail response")).toBeVisible();
  await expect(page.getByText("Post the qualified lead summary to Slack")).toBeVisible();
  await expect(page.getByText("SUCCEEDED").first()).toBeVisible();
});

test("creates an immutable worker version and rolls back", async ({ page }) => {
  await page.goto("/workers/worker_inbound_sales");
  const initialDeploy = page.getByRole("button", { name: "Deploy", exact: true });
  if (await initialDeploy.isVisible()) await initialDeploy.click();
  await expect(page.getByRole("button", { name: "Pause" })).toBeVisible();
  await expect(page.getByText("Active", { exact: true }).first()).toBeVisible();
  await page.getByRole("button", { name: "Improve worker" }).click();
  await expect(page).toHaveURL(/\/workers\/build\//, { timeout: 30_000 });
  await expect(page.getByRole("button", { name: "No changes to save" }).first()).toBeDisabled();
  await page.getByLabel("What should change?").fill("Require human approval before every external follow-up and explain that guardrail clearly.");
  await page.getByRole("button", { name: "Revise proposal" }).click();
  await expect(page.getByText("AgentCloud · proposal 2")).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: "Save version and review" }).click();
  await expect(page).toHaveURL(/\/workers\/worker_inbound_sales$/, { timeout: 30_000 });
  await expect(page.locator("#versions").getByText("Version 2", { exact: true })).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: "Deploy latest" }).click();
  await page.getByRole("button", { name: "Roll back to version 1" }).click();
  await expect(page.getByRole("button", { name: "Roll back to version 2" })).toBeVisible();
});
