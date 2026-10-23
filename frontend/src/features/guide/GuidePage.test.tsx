import { fireEvent, render, screen, within } from '@testing-library/react';
import { Link, MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { GuidePage } from './GuidePage';

function renderGuide() { render(<MemoryRouter><GuidePage /></MemoryRouter>); }

describe('GuidePage', () => {
  it('provides a complete set of working task anchors and group entry links', () => {
    renderGuide();
    expect(screen.getByRole('heading', { name: 'A quick guide to SplitNest' })).toBeInTheDocument();
    const navigation = screen.getByRole('navigation', { name: 'In this guide' });
    const links = within(navigation).getAllByRole('link');
    expect(links).toHaveLength(6);
    for (const link of links) {
      const target = document.getElementById(link.getAttribute('href')!.slice(1));
      expect(target?.tagName).toBe('SECTION');
      expect(target).toHaveAttribute('aria-labelledby');
    }
    expect(screen.getByRole('link', { name: 'Create a group' })).toHaveAttribute('href', '/app/groups#create-group');
    expect(screen.getByRole('link', { name: 'Open my groups' })).toHaveAttribute('href', '/app/groups');
  });

  it('explains membership, exact splits and balances without implying payments are processed', () => {
    renderGuide();
    const members = document.getElementById('members')!;
    expect(members).toHaveTextContent('Each person first creates their own account');
    expect(members).toHaveTextContent('registered email');
    expect(members).toHaveTextContent('does not send invitation emails');
    const expenses = document.getElementById('expenses')!;
    expect(expenses).toHaveTextContent('₹33.33, ₹33.33 and ₹33.34');
    expect(expenses).toHaveTextContent('Illustrative example');
    expect(expenses).toHaveTextContent('current member');
    const balances = document.getElementById('balances')!;
    expect(balances).toHaveTextContent('Positive (+)');
    expect(balances).toHaveTextContent('Negative (−)');
    expect(balances).toHaveTextContent('does not transfer money or process payments');
  });

  it('offers the actual sample asset and explains background import outcomes and limits', () => {
    renderGuide();
    expect(screen.getByRole('link', { name: 'Download sample CSV' })).toHaveAttribute('href', '/examples/statement.csv');
    expect(screen.getByRole('link', { name: 'Download sample CSV' })).toHaveAttribute('download', 'splitnest-statement-example.csv');
    const imports = document.getElementById('imports')!;
    expect(imports).toHaveTextContent('date,description,amount');
    expect(imports).toHaveTextContent('CSV or XLSX');
    expect(imports).toHaveTextContent('5 MiB');
    expect(imports).toHaveTextContent('YYYY-MM-DD');
    expect(imports).toHaveTextContent('paid by you');
    expect(imports).toHaveTextContent('invalid rows are skipped');
  });

  it('explains actual scheduled alert timing and data persistence rather than promising live alerts', () => {
    renderGuide();
    const budgets = document.getElementById('budgets')!;
    expect(budgets).toHaveTextContent('00:00 UTC');
    expect(budgets).toHaveTextContent('while the app is running');
    expect(budgets).toHaveTextContent('does not trigger an immediate check');
    expect(budgets).toHaveTextContent('not a live spending total');
    expect(screen.getByText(/Your account and records live in PostgreSQL/)).toHaveTextContent('Signing out does not erase them');
    expect(screen.getByRole('figure', { name: 'Illustration: from a group to an expense and equal shares' })).toBeInTheDocument();
  });

  it('scrolls to a known task after initial routed entry and subsequent route hash navigation', () => {
    const previous = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollIntoView');
    const scrolledSections: string[] = [];
    const scroll = vi.fn(function(this: HTMLElement) { scrolledSections.push(this.id); });
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', { value: scroll, configurable: true });
    try {
      render(<MemoryRouter initialEntries={['/app/guide#imports']}><Link to="/app/guide#budgets">Read budget instructions</Link><Link to="/app/guide#not-a-task">Unknown section</Link><GuidePage /></MemoryRouter>);
      expect(scrolledSections).toEqual(['imports']);
      expect(scroll).toHaveBeenLastCalledWith({ block: 'start' });
      fireEvent.click(screen.getByRole('link', { name: 'Read budget instructions' }));
      expect(scrolledSections).toEqual(['imports', 'budgets']);
      fireEvent.click(screen.getByRole('link', { name: 'Unknown section' }));
      expect(scrolledSections).toEqual(['imports', 'budgets']);
    } finally {
      if (previous) Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', previous);
      else Reflect.deleteProperty(HTMLElement.prototype, 'scrollIntoView');
    }
  });
});
