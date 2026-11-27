import React from 'react';
import { state } from '../modules/store.ts';
import { render } from '../ui/render.tsx';

export const pageSizeOptions = [5, 10, 20, 50, 100, 200];

export const paginate = (items, key) => {
  const pageSizeKey = `${key}PageSize`;
  const pageKey = `${key}Page`;
  const pageSize = pageSizeOptions.includes(Number(state[pageSizeKey])) ? Number(state[pageSizeKey]) : 10;
  const pageCount = Math.max(1, Math.ceil(items.length / pageSize));
  const page = Math.min(Math.max(Number(state[pageKey]) || 1, 1), pageCount);
  state[pageKey] = page;
  return { page, pageCount, pageSize, rows: items.slice((page - 1) * pageSize, page * pageSize) };
};

export const Pagination = ({ paginationKey, page, pageCount, pageSize }) => <div className="pagination" aria-label="Pagination controls">
  <span>Page {page} of {pageCount}</span>
  <button className="btn s sm" type="button" disabled={page === 1} onClick={() => { state[`${paginationKey}Page`] = page - 1; render(); }}>Previous</button>
  <button className="btn s sm" type="button" disabled={page === pageCount} onClick={() => { state[`${paginationKey}Page`] = page + 1; render(); }}>Next</button>
  <label>Rows per page <select value={pageSize} onChange={event => { state[`${paginationKey}PageSize`] = Number(event.currentTarget.value); state[`${paginationKey}Page`] = 1; render(); }}>{pageSizeOptions.map(option => <option key={option} value={option}>{option}</option>)}</select></label>
</div>;
