import { expect, test } from '@playwright/test';

// The demo server (see playwright.config.ts): three projects with topics in every state, dated around today.
test.use({ baseURL: 'http://localhost:4174' });
test.describe.configure({ mode: 'serial' });

const panel = (page: import('@playwright/test').Page, name: string) => page.getByRole('region', { name, exact: true });

// The demo administrator (the sign-in page lists the demo accounts).
test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('Demo data:')).toBeVisible();
  await page.getByLabel('Email').fill('elouan@example.com');
  await page.getByLabel('Password').fill('cairn-demo');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('navigation', { name: 'Main navigation' })).toBeVisible();
});

test('the overview answers the four questions: what moves, what is stuck, what is due, what sleeps', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Elouan');

  // What moves: in progress, grouped by project, and the latest changes.
  await expect(panel(page, 'In progress')).toContainText('Portail client');
  await expect(panel(page, 'In progress').getByRole('link', { name: /POR-24/ })).toBeVisible();
  await expect(panel(page, 'Recent activity').getByRole('listitem').first()).toBeVisible();
  // What is stuck: waiting, oldest first, with how long.
  await expect(panel(page, 'Waiting').getByRole('link').first()).toContainText('POR-22');
  // What is due: overdue and the next 7 days.
  await expect(panel(page, 'Deadlines').getByRole('link', { name: /AIDE-7/ })).toBeVisible();
  await expect(panel(page, 'Deadlines').getByRole('link', { name: /POR-24/ })).toBeVisible();
  // What sleeps: open topics without activity for 14 days or more.
  await expect(panel(page, 'Dormant').getByRole('link', { name: /POR-12/ })).toBeVisible();
  // And how far each project is.
  await expect(panel(page, 'Project progress')).toContainText('14/27');
});

test('the dormancy threshold comes from the settings page', async ({ page }) => {
  await page.goto('/parametres');
  const days = page.getByLabel('Dormancy threshold');
  await expect(days).toHaveValue('14');
  await days.fill('365');
  await page.getByRole('region', { name: 'Workspace' }).getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('Dormancy threshold: 365 days')).toBeVisible();

  await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('link', { name: 'Overview' }).click();
  await expect(panel(page, 'Dormant')).toContainText('No dormant topic');

  // Back to the default for the next runs of this server.
  await page.goto('/parametres');
  await page.getByRole('region', { name: 'Workspace' }).getByRole('button', { name: '14 days' }).click();
  await expect(page.getByText('Dormancy threshold: 14 days')).toBeVisible();
});
