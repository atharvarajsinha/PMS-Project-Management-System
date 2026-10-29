// Ids are integers (API.md §1), but URL params and <Select> values are always strings.
// Compare and display ids as strings; send them back to the API as numbers.

export const idStr = (value) => (value === null || value === undefined ? "" : String(value));

export const sameId = (a, b) => a !== null && a !== undefined && b !== null && b !== undefined && String(a) === String(b);

// "" / null → null, "42" → 42 (anything non-numeric is passed through unchanged)
export const apiId = (value) => {
  if (value === null || value === undefined || value === "") return null;
  return /^\d+$/.test(String(value)) ? Number(value) : value;
};
