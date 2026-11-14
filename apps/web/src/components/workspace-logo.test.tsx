import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { LOGO_CONTEXTS, logoSrc, WorkspaceLogo } from './workspace-logo';

const ID = '0192a3b4-c5d6-7e8f-9a0b-1c2d3e4f5a6b';
const URL_ = `https://api.test/api/v1/images/${ID}`;

describe('logoSrc', () => {
  it('asks the API for a standard width, and leaves other addresses alone', () => {
    expect(logoSrc(URL_, 360)).toBe(`${URL_}?w=360`);
    expect(logoSrc('blob:http://x/abc', 360)).toBe('blob:http://x/abc');
    expect(logoSrc('https://cdn.test/logo.png', 360)).toBe('https://cdn.test/logo.png');
  });
});

describe('WorkspaceLogo', () => {
  afterEach(cleanup);

  it('draws the saved logo inside the context’s maximum box, keeping its proportions', () => {
    render(<WorkspaceLogo name="Urban" logo={URL_} context="invoice" />);
    const img = screen.getByRole('img', { name: 'Urban logo' });
    expect(img).toHaveAttribute('src', `${URL_}?w=${LOGO_CONTEXTS.invoice.src}`);
    expect(img).toHaveStyle({ maxWidth: '150px', maxHeight: '48px' });
    expect(img.className).toContain('object-contain');
    expect(img.className).toContain('h-auto');
  });

  it('uses the dark-background logo only on a dark surface, and only when there is one', () => {
    const light = `https://api.test/api/v1/images/${ID.replace('0192', '0193')}`;
    const { rerender } = render(
      <WorkspaceLogo name="Urban" logo={URL_} logoLight={light} context="preview" tone="dark" />,
    );
    expect(screen.getByRole('img')).toHaveAttribute('src', expect.stringContaining('0193'));
    rerender(<WorkspaceLogo name="Urban" logo={URL_} logoLight={light} context="preview" />);
    expect(screen.getByRole('img')).toHaveAttribute('src', expect.stringContaining('0192'));
    rerender(<WorkspaceLogo name="Urban" logo={URL_} context="preview" tone="dark" />);
    expect(screen.getByRole('img')).toHaveAttribute('src', expect.stringContaining('0192'));
  });

  it('shows the initials when there is no logo, and when the image fails to load', () => {
    const { rerender } = render(<WorkspaceLogo name="Urban Nest" logo={null} context="header" />);
    expect(screen.getByRole('img', { name: 'Urban Nest logo' })).toHaveTextContent('UN');
    rerender(<WorkspaceLogo name="Urban Nest" logo={URL_} context="header" />);
    fireEvent.error(screen.getByRole('img', { name: 'Urban Nest logo' }));
    expect(screen.getByRole('img', { name: 'Urban Nest logo' })).toHaveTextContent('UN');
  });

  it('shows a chosen file before it is saved, as given', () => {
    render(<WorkspaceLogo name="Urban" logo={URL_} src="blob:http://x/new" context="preview" />);
    expect(screen.getByRole('img')).toHaveAttribute('src', 'blob:http://x/new');
  });
});
