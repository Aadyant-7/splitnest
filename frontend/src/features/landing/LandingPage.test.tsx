import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import { LandingPage } from './LandingPage';

describe('public introduction', () => {
  it('explains the first steps and leads to working account routes', () => {
    render(<MemoryRouter><LandingPage /></MemoryRouter>);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('shared expenses');
    expect(screen.getByRole('link', { name: 'Create your account' })).toHaveAttribute('href', '/register');
    expect(within(screen.getByRole('navigation')).getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/login');
    expect(screen.getByRole('link', { name: 'See how it works' })).toHaveAttribute('href', '#how-it-works');
    for (const title of ['Bring your group together', 'Record a shared expense', 'See where everyone stands']) {
      expect(screen.getByRole('heading', { name: title })).toBeInTheDocument();
    }
  });
  it('clearly distinguishes the explanatory ledger from account records', () => {
    render(<MemoryRouter><LandingPage /></MemoryRouter>);
    expect(screen.getByText('Illustration only. Your account starts with your own records.')).toBeVisible();
    const example = screen.getByLabelText('Illustrative balances');
    expect(example).toHaveTextContent('+₹600.00');
    expect(example).toHaveTextContent('−₹300.00');
    expect(screen.getByText(/No bank connection or payments/)).toBeVisible();
    expect(screen.getByRole('contentinfo')).toHaveTextContent('Equal shares · Amounts in INR');
    expect(screen.getByRole('contentinfo')).not.toHaveTextContent('Local application');
  });
});
