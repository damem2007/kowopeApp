import test from 'node:test';
import assert from 'node:assert/strict';
import { accessibleScopeClause, accessibleScopeParameters } from '../server/services/access-scope.js';

test('access scope separates personal records from organization records', () => {
  assert.equal(
    accessibleScopeClause('invoice'),
    '(invoice.organization_id = ? OR (invoice.organization_id IS NULL AND invoice.user_id = ?))',
  );
  assert.equal(
    accessibleScopeClause('client', 'created_by_user_id'),
    '(client.organization_id = ? OR (client.organization_id IS NULL AND client.created_by_user_id = ?))',
  );
  assert.deepEqual(
    accessibleScopeParameters({ organization_id: null, id: 'personal-user' }),
    [null, 'personal-user'],
  );
  assert.deepEqual(
    accessibleScopeParameters({ organization_id: 7, id: 'organization-member' }),
    [7, 'organization-member'],
  );
});
