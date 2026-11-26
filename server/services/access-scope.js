/**
 * A personal record is owned by its user only when it has no organization.
 * An organization record is shared through the active organization, even
 * though it may also retain the creating user's id for audit purposes.
 */
export const accessibleScopeClause = (tableAlias = '', ownerColumn = 'user_id') => {
  const prefix = tableAlias ? `${tableAlias}.` : '';
  return `(${prefix}organization_id = ? OR (${prefix}organization_id IS NULL AND ${prefix}${ownerColumn} = ?))`;
};

export const accessibleScopeParameters = user => [user.organization_id ?? null, user.id];
