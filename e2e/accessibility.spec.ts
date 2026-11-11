import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, test } from '@playwright/test';

// The demo server (see playwright.config.ts): every screen has content to check.
test.use({ baseURL: 'http://localhost:4174', reducedMotion: 'reduce' });

/** WCAG 2.1 A and AA rules, as the cadrage asks (contrasts AA, names, roles, keyboard). */
async function audit(page: Page, label: string) {
  const { violations } = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  const report = violations.map(
    (v) =>
      `${v.id} (${v.impact}): ${v.help}\n${v.nodes.map((n) => `    ${n.target.join(' ')}\n      ${n.html.slice(0, 160)}`).join('\n')}`,
  );
  expect(report, `${label}\n${report.join('\n')}`).toEqual([]);
}

async function signIn(page: Page) {
  await page.goto('/');
  await page.getByLabel('Email').fill('elouan@example.com');
  await page.getByLabel('Password').fill('cairn-demo');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('navigation', { name: 'Main navigation' })).toBeVisible();
}

for (const scheme of ['light', 'dark'] as const) {
  test.describe(`${scheme} theme`, () => {
    test.use({ colorScheme: scheme });

    test('sign-in page', async ({ page }) => {
      await page.goto('/');
      await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
      await audit(page, 'sign-in');
    });

    test('every main screen', async ({ page }) => {
      await signIn(page);
      const screens: Array<[string, string, string]> = [
        ['overview', '/', 'Recent activity'],
        ['project list', '/p/POR', 'Formulaires avancés'],
        ['project kanban', '/p/POR?view=kanban', 'In progress'],
        ['subprojects tab', '/p/POR?tab=subprojects', 'Gestion des erreurs'],
        ['activity tab', '/p/POR?tab=activity', 'created'],
        ['my topics', '/mes-sujets', 'In progress'],
        ['topic page', '/p/POR/sujets/POR-24', 'Checklist'],
        ['settings', '/parametres', 'API tokens'],
      ];
      for (const [label, path, text] of screens) {
        await page.goto(path);
        await expect(page.getByText(text).first()).toBeVisible();
        await audit(page, label);
      }
    });

    test('palette and dialogs', async ({ page }) => {
      await signIn(page);
      await page.keyboard.press('ControlOrMeta+k');
      await page.keyboard.type('formulaire');
      await expect(page.getByRole('option').first()).toBeVisible();
      await audit(page, 'palette');
      await page.keyboard.press('Escape');
      await page.keyboard.press('c');
      await expect(page.getByRole('dialog', { name: 'New topic' })).toBeVisible();
      await audit(page, 'new topic dialog');
    });
  });
}
