import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FieldSelect } from './field-select';

afterEach(cleanup);

describe('FieldSelect', () => {
  const view = (onChange = vi.fn()) => {
    render(
      <FieldSelect aria-label="Role" value="AGENT" onChange={onChange} name="role">
        <option value="ADMIN">Admin</option>
        <>
          <option value="AGENT">Agent</option>
          <option value="OFF" disabled>
            Off
          </option>
        </>
        {['X', 'Y'].map((k) => (
          <option key={k} value={k}>
            {k}
          </option>
        ))}
      </FieldSelect>,
    );
    return onChange;
  };

  it('shows the chosen option and lists every <option>, also inside fragments and map output', () => {
    view();
    const trigger = screen.getByRole('combobox', { name: 'Role' });
    expect(trigger).toHaveTextContent('Agent');
    fireEvent.click(trigger);
    expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual([
      'Admin',
      'Agent',
      'Off',
      'X',
      'Y',
    ]);
    expect(screen.getByRole('option', { name: 'Off' })).toHaveAttribute('aria-disabled', 'true');
  });

  it('calls onChange like a native select, ignores a disabled option, and keeps its name in a hidden input', () => {
    const onChange = view();
    fireEvent.click(screen.getByRole('combobox', { name: 'Role' }));
    fireEvent.click(screen.getByRole('option', { name: 'Off' }));
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('option', { name: 'Admin' }));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0]![0].target.value).toBe('ADMIN');
    expect(document.querySelector('input[type="hidden"][name="role"]')).toHaveValue('AGENT');
  });

  it('closes on an outside click', () => {
    view();
    fireEvent.click(screen.getByRole('combobox', { name: 'Role' }));
    expect(screen.getByRole('listbox')).toBeInTheDocument();
    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole('listbox')).toBeNull();
  });
});
