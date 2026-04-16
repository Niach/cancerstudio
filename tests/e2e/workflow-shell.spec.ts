import { expect, test, type APIRequestContext } from "@playwright/test";

const apiBase = process.env.REAL_DATA_API_BASE ?? "http://127.0.0.1:8001";

async function createWorkspace(request: APIRequestContext, name: string) {
  const workspaceResponse = await request.post(`${apiBase}/api/workspaces/`, {
    data: { display_name: name, species: "human" },
  });
  expect(workspaceResponse.ok()).toBeTruthy();
  return workspaceResponse.json();
}

test("future-stage URLs redirect back to the current working step", async ({
  page,
  request,
}) => {
  const workspace = await createWorkspace(request, `Redirect check ${Date.now()}`);

  await page.goto(`/workspaces/${workspace.id}/annotation`);

  await expect(page).toHaveURL(new RegExp(`/workspaces/${workspace.id}/ingestion`));
  await expect(
    page.getByText("Annotation is on the roadmap, but it is not usable yet.")
  ).toBeVisible();
  await expect(page.locator("nav").getByText("Annotation", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: /Annotation/i })).toHaveCount(0);
});

test("variant calling stays visible but read only while blocked", async ({
  page,
  request,
}) => {
  const workspace = await createWorkspace(request, `Variant preview ${Date.now()}`);

  await page.goto(`/workspaces/${workspace.id}/variant-calling`);

  await expect(page.getByTestId("variant-calling-stage-panel")).toBeVisible();
  await expect(page.getByTestId("variant-calling-stage-status-strip")).toHaveAttribute(
    "data-state",
    "blocked"
  );
  await expect(
    page.getByText("Finish alignment", { exact: false })
  ).toBeVisible();
  // While blocked, no run controls are shown.
  await expect(page.getByTestId("variant-calling-run-button")).toHaveCount(0);
  await expect(page.getByTestId("variant-calling-rerun-button")).toHaveCount(0);
});

test("header plus returns to the home workspace foyer", async ({ page, request }) => {
  const stamp = Date.now();
  const workspace = await createWorkspace(request, `Plus nav ${stamp}`);

  await page.goto(`/workspaces/${workspace.id}/ingestion`);
  await page.getByLabel("New workspace").click();

  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByText("Workspaces")).toBeVisible();
  await expect(page.getByText(`Plus nav ${stamp}`)).toBeVisible();
});
