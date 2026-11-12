import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

afterEach(cleanup);
import { AIBadge, AIButton, AIProcessingIndicator } from './ai';

describe('AIButton', () => {
  it('is a plain button that never submits a form, with its accessible name', () => {
    render(<AIButton>AI Assist</AIButton>);
    const b = screen.getByRole('button', { name: 'AI Assist' });
    expect(b).toHaveAttribute('type', 'button');
    expect(b).toHaveAttribute('data-state', 'idle');
    expect(b.className).toContain('ai-btn-primary');
  });
  it('secondary uses the light variant', () => {
    render(<AIButton variant="secondary">Improve</AIButton>);
    expect(screen.getByRole('button', { name: 'Improve' }).className).toContain('ai-btn-secondary');
  });
  it('loading shows the processing label, is busy and cannot be clicked again', () => {
    render(
      <AIButton loading loadingLabel="Generating…" aria-label="Generate with AI">
        Generate
      </AIButton>,
    );
    const b = screen.getByRole('button', { name: 'Generate with AI' });
    expect(b).toBeDisabled();
    expect(b).toHaveAttribute('aria-busy', 'true');
    expect(b).toHaveAttribute('data-state', 'loading');
    expect(b).toHaveTextContent('Generating…');
  });
  it('success shows the completed state', () => {
    render(
      <AIButton success successLabel="Inserted">
        Insert
      </AIButton>,
    );
    const b = screen.getByRole('button', { name: /Inserted/ });
    expect(b).toHaveAttribute('data-state', 'success');
    expect(b.className).toContain('ai-btn-success');
  });
  it('disabled is marked so its animation and glow are removed', () => {
    render(<AIButton disabled>Rewrite</AIButton>);
    const b = screen.getByRole('button', { name: 'Rewrite' });
    expect(b).toBeDisabled();
    expect(b).toHaveAttribute('data-state', 'disabled');
  });
  it('keeps the label for screen readers when it is hidden on small screens', () => {
    render(<AIButton hideLabelOnSmall>AI Assist</AIButton>);
    expect(screen.getByRole('button', { name: 'AI Assist' })).toBeInTheDocument();
  });
});

describe('AI badge and processing indicator', () => {
  it('the badge reads AI by default', () => {
    render(<AIBadge />);
    expect(screen.getByText('AI')).toBeInTheDocument();
  });
  it('the indicator is a polite status with its text', () => {
    render(<AIProcessingIndicator label="Analyzing…" bar />);
    const s = screen.getByRole('status');
    expect(s).toHaveAttribute('aria-live', 'polite');
    expect(s).toHaveTextContent('Analyzing…');
  });
});
