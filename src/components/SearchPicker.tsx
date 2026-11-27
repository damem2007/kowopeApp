import React from 'react';
import { state } from '../modules/store.ts';
import { render } from '../ui/render.tsx';

export const SearchPicker = ({ id, label, value, options, allLabel, onChange }) => {
  const openKey = `${id}Open`;
  const searchKey = `${id}Search`;
  const isOpen = Boolean(state[openKey]);
  const query = String(state[searchKey] || '').trim().toLowerCase();
  const selected = options.find(option => String(option.id) === String(value));
  const matchingOptions = options.filter(option => String(option.label).toLowerCase().includes(query)).slice(0, 6);
  const selectOption = optionId => {
    onChange(optionId);
    state[openKey] = false;
    state[searchKey] = '';
    render();
  };

  return <div className="search-picker-field">
    <span className="search-picker-label">{label}</span>
    <div className="search-picker">
      <button className="search-picker-trigger" type="button" aria-expanded={isOpen} aria-haspopup="listbox" onClick={() => { state[openKey] = !isOpen; state[searchKey] = ''; render(); }}><span>{selected?.label || allLabel}</span><span aria-hidden="true">▾</span></button>
      {isOpen && <div className="search-picker-popover" role="listbox" aria-label={`Choose ${label.toLowerCase()}`}>
        <input autoFocus value={state[searchKey] || ''} placeholder={`Search ${label.toLowerCase()} by name`} onChange={event => { state[searchKey] = event.currentTarget.value; render(); }} />
        <button className={`search-picker-option ${!value ? 'selected' : ''}`} type="button" onClick={() => selectOption('')}>{allLabel}</button>
        {matchingOptions.map(option => <button className={`search-picker-option ${String(option.id) === String(value) ? 'selected' : ''}`} type="button" key={option.id} onClick={() => selectOption(option.id)}>{option.label}</button>)}
        {!matchingOptions.length && <p className="search-picker-empty">No {label.toLowerCase()} match that search.</p>}
        <p className="search-picker-hint">Type to search. Showing up to 6 matches.</p>
      </div>}
    </div>
  </div>;
};
