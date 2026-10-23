import { randomUUID } from 'node:crypto';
import { expect, type APIRequestContext, type Page } from '@playwright/test';
import type { Group, User } from '../src/shared/api/types';

// These credentials are synthetic fixtures, never a real person's password.
export const DEMO_PASSWORD = 'PlacementDemo123!';
export type Account = User & { password: string };

export function uniqueEmail(label: string) {
  return `browser-${label}-${randomUUID()}@example.test`;
}

export async function registerAccount(request: APIRequestContext, displayName: string): Promise<Account> {
  const email = uniqueEmail(displayName.toLowerCase().replace(/[^a-z]/g, ''));
  const response = await request.post('/api/v1/auth/register', {
    data: { email, password: DEMO_PASSWORD, displayName },
  });
  expect(response.status(), 'Synthetic account registration succeeds').toBe(201);
  return { ...await response.json() as User, password: DEMO_PASSWORD };
}

export async function apiToken(request: APIRequestContext, account: Account): Promise<string> {
  const response = await request.post('/api/v1/auth/login', {
    data: { email: account.email, password: account.password },
  });
  expect(response.status(), 'Synthetic API login succeeds').toBe(200);
  const body = await response.json() as { accessToken: string };
  return body.accessToken;
}

export function bearer(token: string) { return { Authorization: `Bearer ${token}` }; }

export async function createApiGroup(request: APIRequestContext, token: string, name: string): Promise<Group> {
  const response = await request.post('/api/v1/groups', { headers: bearer(token), data: { name } });
  expect(response.status(), 'Fixture group creation succeeds').toBe(201);
  return response.json() as Promise<Group>;
}

export async function addApiMember(request: APIRequestContext, token: string, groupId: string, account: Account) {
  const response = await request.post(`/api/v1/groups/${groupId}/members`, {
    headers: bearer(token), data: { email: account.email },
  });
  expect(response.status(), 'Fixture membership creation succeeds').toBe(201);
}

export async function signIn(page: Page, account: Account) {
  await page.goto('/login');
  await expect(page.getByRole('heading', { name: 'Sign in', exact: true })).toBeVisible();
  await page.getByLabel('Email address').fill(account.email);
  await page.locator('input[name="password"]').fill(account.password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(/\/app\/home$/);
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Welcome,');
}

export async function createUiGroup(page: Page, name: string): Promise<string> {
  await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('link', { name: 'My groups', exact: true }).click();
  await page.getByLabel('Group name').fill(name);
  await page.getByRole('button', { name: 'Create group', exact: true }).click();
  await expect(page.getByRole('heading', { name, exact: true })).toBeVisible();
  return new URL(page.url()).pathname.split('/').at(-1)!;
}

export async function addUiExpense(page: Page, description: string, amount: string, payer?: string) {
  await page.getByRole('tab', { name: 'Expenses', exact: true }).click();
  await page.getByLabel('Amount (INR)').fill(amount);
  await page.getByLabel('Description', { exact: true }).fill(description);
  if (payer) await page.getByLabel('Paid by').selectOption(payer);
  await page.getByRole('button', { name: 'Add expense', exact: true }).click();
  await expect(page.getByRole('row').filter({ hasText: description })).toBeVisible();
}

export async function expectNoPersistentCredentials(page: Page) {
  const safe = await page.evaluate(() => {
    const entries = [...Object.entries(localStorage), ...Object.entries(sessionStorage)];
    return entries.every(([key, value]) => !/(?:access.?token|refresh.?token|password|authorization)/i.test(key)
      && !/^eyJ[\w-]+\.[\w-]+\.[\w-]+$/.test(value));
  });
  expect(safe, 'Browser storage must not persist passwords or authentication tokens').toBe(true);
}
