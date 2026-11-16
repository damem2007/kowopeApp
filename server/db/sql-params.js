/** Convert SQLite positional SQL parameters for node-postgres.
 * SQL identifiers must still come only from trusted, fixed values.
 */
export function placeholders(sql) {
  // SQL '?' parameters to PostgreSQL $1, $2 ...; do not modify quoted strings
  // or PostgreSQL dollar quotes. No identifier interpolation is performed.
  let out = '', quoted = '', count = 0
  for (let i = 0; i < sql.length; i++) {
    const c = sql[i], n = sql[i+1]
    if (!quoted && c === '-' && n === '-') {
      const j = sql.indexOf('\n', i + 2)
      if (j === -1) return out + sql.slice(i)
      out += sql.slice(i, j); i = j - 1; continue
    }
    if (!quoted && c === '/' && n === '*') {
      const j = sql.indexOf('*/', i + 2)
      if (j === -1) throw new Error('Unterminated SQL block comment')
      out += sql.slice(i, j + 2); i = j + 1; continue
    }
    if (!quoted && c === '$') {
      const marker = sql.slice(i).match(/^\$(?:[A-Za-z_][A-Za-z0-9_]*)?\$/)?.[0]
      if (marker) {
        const end = sql.indexOf(marker, i + marker.length)
        if (end < 0) throw new Error('Unterminated PostgreSQL dollar-quoted string')
        out += sql.slice(i, end + marker.length)
        i = end + marker.length - 1
        continue
      }
    }
    if (quoted) {
      out += c
      if (c === quoted) {
        if (n === quoted) {out += n; i++} else quoted = ''
      }
    } else if (c === "'" || c === '"') {quoted = c; out += c}
    else if (c === '?') { out += `$${++count}` }
    else out += c
  }
  return out
}

