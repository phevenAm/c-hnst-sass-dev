// Parses the stdout of `supabase db query` into { rows }.
//
// The output shape depends on how the CLI detects its host:
//   • agent host (e.g. Claude Code):        { boundary, rows: [...], warning }
//   • plain terminal + --output-format json: a bare [ ...rows ] array
//   • no --output-format flag:               a human-readable ASCII table (no JSON)
//
// Status lines ("Initialising login role...") go to stderr, so stdout is just
// the JSON — but be defensive about leading/trailing noise anyway.
export function parseDbRows(out, cmd) {
  const text = (out ?? "").trim();
  const start = text.search(/[[{]/);
  if (start === -1) {
    throw new Error(
      `\`${cmd}\` produced no JSON output.\nRaw output:\n${text || "(empty)"}\n` +
        "Make sure the call passes `--output-format json`, and run it once by hand " +
        "to clear any first-run npx install prompt.",
    );
  }
  let parsed;
  try {
    parsed = JSON.parse(text.slice(start));
  } catch (err) {
    throw new Error(`\`${cmd}\` returned unparseable output:\n${text}\n\n(${err.message})`);
  }
  const rows = Array.isArray(parsed) ? parsed : parsed?.rows;
  if (!Array.isArray(rows)) {
    throw new Error(`\`${cmd}\` JSON had no rows array:\n${text}`);
  }
  return { rows };
}
