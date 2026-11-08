import { expect, type Locator, type Page, test } from '@playwright/test';

// One workspace for the whole file, starting empty: each journey builds on the previous one.
test.describe.configure({ mode: 'serial' });

const mainNav = (page: Page) => page.getByRole('navigation', { name: 'Main navigation' });
const panel = (page: Page, ref: string) => page.getByRole('complementary', { name: `${ref} details` });

/** Pointer drag from the middle of one element to the middle of another, in small steps (dnd-kit needs moves). */
async function drag(page: Page, from: Locator, to: Locator) {
  const a = await from.boundingBox();
  const b = await to.boundingBox();
  if (!a || !b) throw new Error('Nothing to drag');
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
  await page.mouse.down();
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2 + 8, { steps: 4 });
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 12 });
  await page.mouse.up();
}

async function createTopic(page: Page, title: string) {
  await page.keyboard.press('c');
  const dialog = page.getByRole('dialog', { name: 'New topic' });
  await dialog.getByLabel('Title').fill(title);
  await dialog.getByRole('button', { name: 'Create topic' }).click();
  await expect(dialog).toBeHidden();
}

test('first run: account, project, subproject and topics, all without reloading', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Welcome to Cairn' })).toBeVisible();
  await page.getByLabel('Your name').fill('Ada Lovelace');
  await page.getByLabel('Email').fill('ada@example.com');
  await page.getByRole('button', { name: 'Get started' }).click();
  await expect(page.getByRole('heading', { name: 'Start with a project' })).toBeVisible();

  // From here on, everything happens in place: a full page load would fail the journey.
  let loads = 0;
  page.on('load', () => loads++);

  await page.keyboard.press('Shift+P');
  const projectDialog = page.getByRole('dialog', { name: 'New project' });
  await projectDialog.getByLabel('Name').fill('Website redesign');
  await expect(projectDialog.getByLabel('Key')).toHaveValue('WR');
  await projectDialog.getByRole('button', { name: 'Create project' }).click();
  await expect(page).toHaveURL(/\/p\/WR$/);
  await expect(mainNav(page).getByRole('link', { name: /Website redesign/ })).toBeVisible();

  await page.getByRole('link', { name: /^Subprojects/ }).click();
  await page.getByRole('button', { name: 'New subproject', exact: true }).click();
  const subDialog = page.getByRole('dialog', { name: 'New subproject' });
  await subDialog.getByLabel('Name').fill('Forms');
  await subDialog.getByRole('button', { name: 'Create subproject' }).click();
  await expect(page).toHaveURL(/\/p\/WR\/s\/\w+$/);
  await expect(page.getByRole('textbox', { name: 'Subproject name' })).toHaveValue('Forms');

  // New topics open in the side panel; Escape brings the board back.
  await createTopic(page, 'Validate the form');
  await expect(panel(page, 'WR-1')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(panel(page, 'WR-1')).toBeHidden();
  await createTopic(page, 'Write the error messages');
  await page.keyboard.press('Escape');

  // Kanban cards are draggable, so they expose the button role.
  const todo = page.getByRole('region', { name: 'To do' });
  const inProgress = page.getByRole('region', { name: 'In progress' });
  await expect(todo.getByRole('button', { name: /WR-1/ })).toBeVisible();
  await expect(todo.getByRole('button', { name: /WR-2/ })).toBeVisible();

  // Status from the panel with the keyboard: the card changes column at once.
  await todo.getByRole('button', { name: /WR-1/ }).click();
  await expect(panel(page, 'WR-1')).toBeVisible();
  await page.keyboard.press('s');
  await page.getByRole('menuitem', { name: 'In progress' }).click();
  await expect(inProgress.getByRole('button', { name: /WR-1/ })).toBeVisible();
  await page.keyboard.press('Escape');

  await mainNav(page).getByRole('link', { name: 'Overview' }).click();
  await expect(page.getByRole('link', { name: /WR-1.*Validate the form/ }).first()).toBeVisible();
  expect(loads).toBe(0);
});

test('topic panel: opens over the list, follows J/K, closes with Escape', async ({ page }) => {
  await page.goto('/p/WR');
  await page.getByRole('link', { name: /WR-1.*Validate the form/ }).click();
  await expect(panel(page, 'WR-1')).toBeVisible();
  // The address bar shows the topic's own URL, and the list stays behind the panel.
  await expect(page).toHaveURL(/\/p\/WR\/sujets\/WR-1$/);
  await expect(page.getByRole('link', { name: /WR-2.*Write the error messages/ })).toBeVisible();

  await page.keyboard.press('j');
  await expect(panel(page, 'WR-2')).toBeVisible();
  await expect(page).toHaveURL(/\/p\/WR\/sujets\/WR-2$/);

  await page.keyboard.press('Escape');
  await expect(panel(page, 'WR-2')).toBeHidden();
  await expect(page).toHaveURL(/\/p\/WR$/);

  // The same URL opened directly shows the full-screen page.
  await page.goto('/p/WR/sujets/WR-2');
  await expect(page.getByRole('textbox', { name: 'Topic title' })).toHaveValue('Write the error messages');
  await expect(page.getByRole('complementary', { name: /details$/ })).toHaveCount(0);
});

test('archiving a project hides it until it is restored', async ({ page }) => {
  await page.goto('/p/WR');
  await page.getByRole('button', { name: 'More actions' }).click();
  await page.getByRole('menuitem', { name: 'Archive project' }).click();
  await expect(page.getByText('This project is archived')).toBeVisible();
  await expect(mainNav(page).getByRole('link', { name: /Website redesign/ })).toBeHidden();

  await mainNav(page)
    .getByRole('button', { name: /Archived/ })
    .click();
  await expect(mainNav(page).getByRole('link', { name: 'Website redesign' })).toBeVisible();

  await page.getByRole('button', { name: 'Restore project' }).click();
  await expect(page.getByText('This project is archived')).toBeHidden();
  await expect(mainNav(page).getByRole('link', { name: /Website redesign/ })).toBeVisible();

  await page.getByRole('link', { name: /^Activity/ }).click();
  await expect(page.getByText('restored the project')).toBeVisible();
  await expect(page.getByText('archived the project')).toBeVisible();
  await expect(page.getByText('created the subproject “Forms”')).toBeVisible();
});

test('keyboard only: create, sort out and move topics forward without the mouse', async ({ page }) => {
  await page.goto('/');
  const selectionBar = page.getByRole('toolbar', { name: 'Selected topics' });
  const row = (ref: string) => page.getByRole('link', { name: new RegExp(`${ref}\\b`) });

  // A project and three topics.
  await page.keyboard.press('Shift+P');
  await page.keyboard.type('Keyboard first');
  await page.keyboard.press('ControlOrMeta+Enter');
  await expect(page).toHaveURL(/\/p\/KF$/);
  for (const [index, title] of ['Alpha', 'Bravo', 'Charlie'].entries()) {
    await page.keyboard.press('c');
    await page.keyboard.type(title);
    await page.keyboard.press('ControlOrMeta+Enter');
    await expect(panel(page, `KF-${index + 1}`)).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(panel(page, `KF-${index + 1}`)).toBeHidden();
  }

  // Newest first: KF-3, KF-2, KF-1. The topic last shown in the panel (KF-3) stays highlighted:
  // X selects it, J then X adds KF-2, and S sets both statuses at once.
  await page.keyboard.press('x');
  await page.keyboard.press('j');
  await page.keyboard.press('x');
  await expect(selectionBar).toContainText('2 selected');
  await page.keyboard.press('s');
  await page.keyboard.type('progress');
  await page.keyboard.press('Enter');
  for (const ref of ['KF-3', 'KF-2']) await expect(row(ref).getByRole('img', { name: 'In progress' })).toBeVisible();
  await expect(row('KF-1').getByRole('img', { name: 'To do' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(selectionBar).toBeHidden();

  // D on the highlighted topic (KF-2, then J to KF-1): due tomorrow.
  await page.keyboard.press('j');
  await page.keyboard.press('d');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await expect(row('KF-1')).toContainText(/[A-Z][a-z]{2} \d{1,2}/);

  // A subproject from the palette, then back to the project and M moves KF-1 into it.
  await page.keyboard.press('ControlOrMeta+k');
  await page.keyboard.type('new subproject');
  await page.keyboard.press('Enter');
  await page.keyboard.type('Sprint');
  await page.keyboard.press('ControlOrMeta+Enter');
  await expect(page).toHaveURL(/\/p\/KF\/s\/\w+$/);
  await page.keyboard.press('ControlOrMeta+k');
  await page.keyboard.type('go to project keyboard');
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/p\/KF$/);
  await page.keyboard.press('j');
  await page.keyboard.press('j');
  await page.keyboard.press('j');
  await page.keyboard.press('m');
  await page.keyboard.type('sprint');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('region', { name: 'Sprint' }).getByRole('link', { name: /KF-1\b/ })).toBeVisible();

  // Search with / and open the result in the panel.
  await page.keyboard.press('/');
  await page.keyboard.type('bravo');
  await expect(page.getByRole('option', { name: /KF-2/ })).toBeVisible();
  await page.keyboard.press('Enter');
  await expect(panel(page, 'KF-2')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(panel(page, 'KF-2')).toBeHidden();
});

test('drag and drop: a row into another group, a project up the sidebar', async ({ page }) => {
  await page.goto('/p/KF');
  const sprint = page.getByRole('region', { name: 'Sprint' });
  await drag(page, page.getByRole('link', { name: /KF-2\b/ }), sprint.getByRole('link', { name: /KF-1\b/ }));
  await expect(sprint.getByRole('link', { name: /KF-2\b/ })).toBeVisible();

  const projects = mainNav(page).getByRole('link', { name: /^(Keyboard first|Website redesign)/ });
  await expect(projects.first()).toHaveText(/^Website redesign/);
  await drag(page, projects.nth(1), projects.first());
  await expect(projects.first()).toHaveText(/^Keyboard first/);

  // Both moves are saved.
  await page.reload();
  await expect(projects.first()).toHaveText(/^Keyboard first/);
  await expect(page.getByRole('region', { name: 'Sprint' }).getByRole('link', { name: /KF-2\b/ })).toBeVisible();
});
