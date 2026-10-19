import { expect, test } from '@playwright/test';
import type { Balance, ExpensePage } from '../src/shared/api/types';
import { DEMO_PASSWORD, addApiMember, addUiExpense, apiToken, bearer, createApiGroup, createUiGroup, expectNoPersistentCredentials, registerAccount, signIn, uniqueEmail } from './helpers';

test('registration, HttpOnly-cookie session restoration, logout and sign-in use the real backend', async ({ page, context }) => {
  const email = uniqueEmail('register');
  await page.goto('/register');
  await page.getByLabel('Your name').fill('Avery Demo');
  await page.getByLabel('Email address').fill(email);
  await page.locator('input[name="password"]').fill(DEMO_PASSWORD);
  await page.getByRole('button', { name: 'Create account', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Your groups', exact: true })).toBeVisible();

  const refresh = (await context.cookies()).find((cookie) => cookie.name === 'splitnest_refresh');
  expect(Boolean(refresh), 'A browser refresh cookie exists').toBe(true);
  expect(refresh?.httpOnly).toBe(true);
  expect(refresh?.sameSite).toBe('Strict');
  expect(refresh?.path).toBe('/api/v1/browser-auth');
  expect(refresh?.domain.startsWith('.')).toBe(false);
  expect(refresh?.secure).toBe(new URL(page.url()).protocol === 'https:');
  expect(await page.evaluate(() => document.cookie.includes('splitnest_refresh'))).toBe(false);
  await expectNoPersistentCredentials(page);

  const missingCsrf = await page.request.post('/api/v1/browser-auth/refresh');
  expect(missingCsrf.status(), 'An automatic cookie alone cannot authorize refresh').toBe(403);
  for (const prefix of ['/api/v1/browser%2dauth', '/api/v1/%62rowser-auth']) {
    const encoded = await page.request.post(`${prefix}/refresh`);
    expect(encoded.status(), 'Encoded route segments must retain CSRF protection').toBe(403);
  }
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Your groups', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Welcome back.' })).toBeVisible();
  expect((await context.cookies()).some((cookie) => cookie.name === 'splitnest_refresh')).toBe(false);
  await signIn(page, { id: '', email, displayName: 'Avery Demo', createdAt: '', password: DEMO_PASSWORD });
});

test('three users share exact stored splits and balances, then delete expenses through the interface', async ({ page, request }) => {
  const admin = await registerAccount(request, 'Avery');
  const bob = await registerAccount(request, 'Blair');
  const charlie = await registerAccount(request, 'Casey');
  await signIn(page, admin);
  const groupId = await createUiGroup(page, 'A weekend together');
  await page.getByRole('button', { name: 'Members', exact: true }).click();
  for (const member of [bob, charlie]) {
    await page.getByLabel('Member email').fill(member.email);
    await page.getByRole('button', { name: 'Add member', exact: true }).click();
    await expect(page.getByRole('row').filter({ hasText: member.email })).toBeVisible();
  }
  await page.getByLabel('Member email').fill(bob.email);
  await page.getByRole('button', { name: 'Add member', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('already a member');
  await addUiExpense(page, 'Shared dinner', '100.00');
  await page.getByText('Stored shares for Shared dinner', { exact: true }).click();
  const shares = page.locator('details').filter({ hasText: 'Stored shares for Shared dinner' });
  await expect(shares.getByRole('listitem')).toHaveCount(3);
  await expect(shares).toContainText('33.34');
  await expect(shares).toContainText('33.33');

  const token = await apiToken(request, admin);
  const expenseResponse = await request.get(`/api/v1/groups/${groupId}/expenses`, { headers: bearer(token) });
  expect(expenseResponse.status()).toBe(200);
  const ledger = await expenseResponse.json() as ExpensePage;
  const ordered = [admin, bob, charlie].sort((left, right) => left.id.localeCompare(right.id));
  for (const [index, member] of ordered.entries()) {
    expect(ledger.content[0].splits.find((split) => split.userId === member.id)?.shareAmount).toBe(index === 0 ? 33.34 : 33.33);
  }
  const balanceResponse = await request.get(`/api/v1/groups/${groupId}/balances`, { headers: bearer(token) });
  expect(balanceResponse.status()).toBe(200);
  const balances = await balanceResponse.json() as Balance[];
  for (const [index, member] of ordered.entries()) {
    const balance = balances.find((item) => item.userId === member.id);
    expect(balance?.totalPaid).toBe(member.id === admin.id ? 100 : 0);
    expect(balance?.totalShare).toBe(index === 0 ? 33.34 : 33.33);
    expect(Math.round(balance!.netBalance * 100)).toBe((member.id === admin.id ? 10_000 : 0) - (index === 0 ? 3_334 : 3_333));
  }
  expect(balances.map((balance) => Math.round(balance.netBalance * 100)).reduce((sum, cents) => sum + cents, 0)).toBe(0);
  await page.getByRole('button', { name: 'Overview', exact: true }).click();
  for (const member of ordered) await expect(page.getByRole('row').filter({ hasText: member.displayName })).toBeVisible();

  page.on('dialog', (dialog) => void dialog.accept());
  await page.getByRole('button', { name: 'Members', exact: true }).click();
  await page.getByRole('button', { name: `Remove ${charlie.displayName}`, exact: true }).click();
  await expect(page.getByRole('button', { name: `Remove ${charlie.displayName}`, exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Overview', exact: true }).click();
  await expect(page.getByRole('row').filter({ hasText: charlie.displayName })).toContainText('Former member');
  await expect(page.getByRole('row').filter({ hasText: charlie.displayName })).toContainText(charlie.id === ordered[0].id ? '33.34' : '33.33');
  await addUiExpense(page, 'Shared groceries', '60.00', bob.id);
  await page.getByRole('button', { name: 'Delete Shared groceries', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Delete Shared groceries', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Delete Shared dinner', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Your first expense starts here' })).toBeVisible();
  await page.getByRole('button', { name: 'Overview', exact: true }).click();
  await expect(page.getByRole('heading', { name: '0 expenses' })).toBeVisible();
  await expectNoPersistentCredentials(page);
});

test('member controls match real server permissions and outsiders receive 404', async ({ page, request }) => {
  const admin = await registerAccount(request, 'Owner');
  const member = await registerAccount(request, 'Member');
  const outsider = await registerAccount(request, 'Outsider');
  const adminToken = await apiToken(request, admin);
  const group = await createApiGroup(request, adminToken, 'Permission boundaries');
  await addApiMember(request, adminToken, group.id, member);
  const created = await request.post(`/api/v1/groups/${group.id}/expenses`, { headers: bearer(adminToken), data: { amount: '100.00', description: 'Owner expense', category: 'FOOD', expenseDate: new Date().toISOString().slice(0, 10) } });
  expect(created.status()).toBe(201);
  const expense = await created.json() as { id: string };
  await signIn(page, member);
  await page.goto(`/app/groups/${group.id}`);
  await page.getByRole('button', { name: 'Members', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Add member', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Expenses', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Delete Owner expense', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Budgets', exact: true }).click();
  await expect(page.getByText('Only group admins can change category limits.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Save monthly limit', exact: true })).toHaveCount(0);

  const memberToken = await apiToken(request, member);
  const deniedBudget = await request.put(`/api/v1/groups/${group.id}/budgets/FOOD`, { headers: bearer(memberToken), data: { monthlyLimit: '10.00' } });
  expect(deniedBudget.status()).toBe(403);
  const deniedDeletion = await request.delete(`/api/v1/groups/${group.id}/expenses/${expense.id}`, { headers: bearer(memberToken) });
  expect(deniedDeletion.status()).toBe(403);
  const outsiderToken = await apiToken(request, outsider);
  for (const suffix of ['', '/expenses', '/balances', '/budgets']) {
    const response = await request.get(`/api/v1/groups/${group.id}${suffix}`, { headers: bearer(outsiderToken) });
    expect(response.status(), `Outsider ${suffix || 'group'} access`).toBe(404);
  }
});

test('CSV import reports actual valid/invalid rows and budgets show limits without fake live totals', async ({ page, request }) => {
  const account = await registerAccount(request, 'Import Demo');
  await signIn(page, account);
  await createUiGroup(page, 'Statements and plans');
  await page.getByRole('button', { name: 'Imports', exact: true }).click();
  const date = new Date().toISOString().slice(0, 10);
  await page.getByLabel('Statement file').setInputFiles({ name: 'synthetic-statement.csv', mimeType: 'text/csv', buffer: Buffer.from(`date,description,amount\n${date},SWIGGY lunch,100.00\nnot-a-date,Invalid row,25.00\n`) });
  await page.getByRole('button', { name: 'Upload statement', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Import complete.' })).toContainText('1 expense saved; 1 invalid row skipped', { timeout: 30_000 });
  await expect(page.getByText('COMPLETED', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Expenses', exact: true }).click();
  await expect(page.getByRole('row').filter({ hasText: 'SWIGGY lunch' })).toBeVisible();
  await expect(page.getByText('Statement import', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Budgets', exact: true }).click();
  await page.getByLabel('Monthly limit (INR)').fill('500.00');
  await page.getByRole('button', { name: 'Save monthly limit', exact: true }).click();
  await expect(page.getByRole('status')).toHaveText('Food budget saved.');
  await expect(page.getByRole('table').filter({ hasText: 'Monthly category limits' }).getByRole('row').filter({ hasText: 'Food' })).toContainText('500.00');
  await expect(page.getByText('No budget alerts yet', { exact: true })).toBeVisible();
  await expect(page.getByText(/not live spending totals or an immediate check/)).toBeVisible();
});

test('two tabs rotate the shared refresh cookie safely and sign out together', async ({ page, context, request }) => {
  const account = await registerAccount(request, 'Two Tabs');
  const token = await apiToken(request, account);
  const group = await createApiGroup(request, token, 'A shared browser session');
  await signIn(page, account);
  const second = await context.newPage();
  await Promise.all([page.goto('/app/groups'), second.goto('/app/groups')]);
  for (const tab of [page, second]) await expect(tab.getByRole('heading', { name: 'Your groups', exact: true })).toBeVisible();
  const successfulRefreshes = [0, 0];
  for (const [index, tab] of [page, second].entries()) {
    tab.on('response', (response) => {
      if (response.url().endsWith('/api/v1/browser-auth/refresh') && response.status() === 200) successfulRefreshes[index]++;
    });
    // Only simulate access expiry. Refresh, cookie rotation and every business request remain real.
    await tab.route('**/api/v1/groups', (route) => route.fulfill({ status: 401, contentType: 'application/problem+json', body: JSON.stringify({ status: 401, detail: 'Access token expired.' }) }), { times: 1 });
  }
  await Promise.all([page.getByRole('link', { name: group.name, exact: true }).click(), second.getByRole('link', { name: group.name, exact: true }).click()]);
  for (const tab of [page, second]) await expect(tab.getByRole('heading', { name: group.name, exact: true })).toBeVisible();
  await Promise.all([page.getByRole('link', { name: /My groups/ }).click(), second.getByRole('link', { name: /My groups/ }).click()]);
  for (const tab of [page, second]) {
    await expect(tab.getByRole('heading', { name: 'Your groups', exact: true })).toBeVisible();
    await expect(tab.getByRole('link', { name: group.name, exact: true })).toBeVisible();
    await expectNoPersistentCredentials(tab);
  }
  await expect.poll(() => successfulRefreshes[0]).toBeGreaterThanOrEqual(1);
  await expect.poll(() => successfulRefreshes[1]).toBeGreaterThanOrEqual(1);
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Welcome back.' })).toBeVisible();
  await expect(second.getByRole('heading', { name: 'Welcome back.' })).toBeVisible();
});

test('mobile layout supports group and expense entry without horizontal page overflow', async ({ page, request }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const account = await registerAccount(request, 'Mobile Demo');
  await signIn(page, account);
  await createUiGroup(page, 'A mobile weekend');
  await page.getByRole('button', { name: 'Expenses', exact: true }).click();
  await page.getByLabel('Amount (INR)').fill('1.234');
  await page.getByLabel('Description', { exact: true }).fill('Mobile breakfast');
  await page.getByRole('button', { name: 'Add expense', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('at most two decimal places');
  await page.getByLabel('Amount (INR)').fill('100.00');
  await page.getByRole('button', { name: 'Add expense', exact: true }).click();
  await expect(page.getByRole('row').filter({ hasText: 'Mobile breakfast' })).toBeVisible();
  const fits = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
  expect(fits, 'Tables may scroll internally; the page itself must fit the mobile viewport').toBe(true);
});

test('real login rate limiting announces Retry-After accessibly', async ({ page, request }) => {
  const account = await registerAccount(request, 'Rate Limit');
  await page.goto('/login');
  await page.getByLabel('Email address').fill(account.email);
  await page.locator('input[name="password"]').fill('WrongSyntheticPassword!');
  // Avoid crossing the fixed calendar-minute boundary during six deliberate attempts.
  const seconds = new Date().getUTCSeconds();
  if (seconds >= 55) await page.waitForTimeout((61 - seconds) * 1_000);
  for (let attempt = 0; attempt < 6; attempt++) {
    const response = page.waitForResponse((candidate) => candidate.url().endsWith('/api/v1/browser-auth/login') && candidate.request().method() === 'POST');
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    expect((await response).status()).toBe(attempt < 5 ? 401 : 429);
    await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeEnabled();
  }
  await expect(page.getByRole('alert')).toContainText(/Try again in \d+ seconds/);
});

test('keyboard navigation supports password visibility, sign-in, skip link and group sections', async ({ page, request }) => {
  const account = await registerAccount(request, 'Keyboard Demo');
  const token = await apiToken(request, account);
  const group = await createApiGroup(request, token, 'Keyboard-friendly sharing');
  await page.goto('/login');
  await page.getByLabel('Email address').focus();
  await page.keyboard.type(account.email);
  await page.keyboard.press('Tab');
  await expect(page.locator('input[name="password"]')).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'Show password', exact: true })).toBeFocused();
  // Exercise visibility while empty so failure screenshots never display a password.
  await page.keyboard.press('Space');
  await expect(page.locator('input[name="password"]')).toHaveAttribute('type', 'text');
  await page.keyboard.press('Space');
  await expect(page.locator('input[name="password"]')).toHaveAttribute('type', 'password');
  await page.keyboard.press('Shift+Tab');
  await page.keyboard.type(account.password);
  await page.keyboard.press('Tab');
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: 'Your groups', exact: true })).toBeVisible();

  await page.goto('/app/groups');
  await expect(page.getByRole('heading', { name: 'Your groups', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: group.name, exact: true })).toBeVisible();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'Skip to content', exact: true })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('#main-content')).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: group.name, exact: true })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: group.name, exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Overview', exact: true }).focus();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'Expenses', exact: true })).toBeFocused();
  await page.keyboard.press('Space');
  await expect(page.getByRole('heading', { name: 'Add an expense', exact: true })).toBeVisible();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'Members', exact: true })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: 'Group members', exact: true })).toBeVisible();
});
