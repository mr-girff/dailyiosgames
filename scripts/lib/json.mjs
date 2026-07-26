// Diff-friendly JSON writer for the generated data files.
//
// `JSON.stringify(x, null, 2)` puts every array element on its own line. For this
// dataset that is the dominant source of repository growth: velocity.rcSeries is a
// sliding 14-day window, so appending one day shifts every element and rewrites
// ~50 lines per game — around 3400 changed lines per day across the active set,
// for data nobody reads as text. `tags`, `genres`, `similar` and `screenshots`
// behave the same way.
//
// Objects stay expanded (they are the part a human reviews in a diff); arrays that
// contain no objects are emitted inline. One shifted series is then one changed
// line instead of fifty, and the file is ~25% smaller.
//
// Output is always valid JSON — this only changes whitespace.

const isPrimitive = v => v === null || ["string", "number", "boolean"].includes(typeof v)

/** True for arrays holding only primitives, or only arrays of primitives. */
function inlinable(arr) {
  return arr.every(v => isPrimitive(v) || (Array.isArray(v) && v.every(isPrimitive)))
}

export function stringify(value, indent = 2, depth = 0) {
  const pad = " ".repeat(indent * depth)
  const padIn = " ".repeat(indent * (depth + 1))

  if (Array.isArray(value)) {
    if (value.length === 0) return "[]"
    if (inlinable(value)) return JSON.stringify(value)
    const items = value.map(v => padIn + stringify(v, indent, depth + 1))
    return `[\n${items.join(",\n")}\n${pad}]`
  }

  if (value && typeof value === "object") {
    const keys = Object.keys(value).filter(k => value[k] !== undefined)
    if (keys.length === 0) return "{}"
    const items = keys.map(k => `${padIn}${JSON.stringify(k)}: ${stringify(value[k], indent, depth + 1)}`)
    return `{\n${items.join(",\n")}\n${pad}}`
  }

  return JSON.stringify(value ?? null)
}

/** Serialize with a trailing newline, ready for fs.writeFile. */
export const serialize = value => stringify(value) + "\n"
