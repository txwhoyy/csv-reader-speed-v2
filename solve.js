// solve.js — fast drop-in for csv-reader 1.0.0 (make.fun csv-reader-speed-01).
// Single left-to-right pass over the input string. No regex, no split,
// delimiter search via indexOf (C-speed), slow char loop only inside spans
// that actually contain CR/LF or doubled quotes.
export function run(input) {
  const text = input.text;
  const header = input.header;
  const n = text.length;
  let i = 0;
  if (n > 0 && text.charCodeAt(0) === 0xfeff) i = 1; // drop leading U+FEFF
  let line = 1;
  let columns = null;
  let width = -1;
  const rows = [];
  const errors = [];
  let first = true;

  while (true) {
    // Skip empty lines: a line left with no characters is no record.
    while (i < n) {
      const c = text.charCodeAt(i);
      if (c === 10) { i++; line++; }
      else if (c === 13 && text.charCodeAt(i + 1) === 10) { i += 2; line++; }
      else break;
    }
    if (i >= n) break;

    const recLine = line;
    const recRow = (first && header) ? null : rows.length;
    const fields = [];
    let lastQuoted = false;
    let recEnded = false; // true when a line break / EOF ended the record

    while (!recEnded) {
      // ---- parse one field ----
      if (i < n && text.charCodeAt(i) === 34) {
        // Quoted field: opens with a quote.
        const open = i;
        const openLine = line;
        lastQuoted = true;
        i++;
        let val = '';
        let closed = false;
        let unterminated = false;
        while (true) {
          const q = text.indexOf('"', i);
          if (q === -1) { unterminated = true; break; }
          if (text.charCodeAt(q + 1) === 34) {
            // Doubled quote: one literal quote, keep scanning.
            // (span ends at q; a CR at its very end is lone: next char is '"')
            line += countLines(text, i, q);
            val = normalizeSpan(val, text, i, q) + '"';
            i = q + 2;
            continue;
          }
          // Closing quote at q.
          if (q > i) {
            line += countLines(text, i, q);
            val += normalizeSpan('', text, i, q);
          }
          i = q + 1;
          closed = true;
          break;
        }
        if (unterminated) {
          errors.push({ code: 'unterminated_quote', line: recLine, row: recRow });
          // The opening quote is a literal character; the text after it is
          // read again as unquoted, from just after the opening quote, with
          // the line count reset to where the quote opened (any newlines
          // counted inside the failed quoted scan do not count).
          val = '"';
          i = open + 1;
          line = openLine;
          const r = scanUnquoted(text, i, n, val, errors, recLine, recRow);
          i = r.i; line += r.lines; recEnded = r.ended; fields.push(r.value);
          if (recEnded) break;
          if (i >= n) { recEnded = true; break; }
          i++; // skip the comma the re-scan stopped at
          continue;
        }
        // Junk after the closing quote, up to the next comma or line break,
        // appended as it stands.
        let junkStart = i;
        let junk = '';
        while (i < n) {
          const c = text.charCodeAt(i);
          if (c === 44) break; // comma: next field
          // On a line break, slice the junk BEFORE moving past the
          // terminator, so the terminator itself never becomes junk.
          if (c === 10) { junk += text.slice(junkStart, i); recEnded = true; i++; line++; break; }
          if (c === 13) {
            if (text.charCodeAt(i + 1) === 10) { junk += text.slice(junkStart, i); recEnded = true; i += 2; line++; break; }
            errors.push({ code: 'stray_cr', line: recLine, row: recRow });
            junk += text.slice(junkStart, i);
            i++;
            junkStart = i;
            continue;
          }
          i++;
        }
        if (!recEnded) junk += text.slice(junkStart, i);
        if (junk.length > 0) {
          val += junk;
          errors.push({ code: 'quote_junk', line: recLine, row: recRow });
        }
        fields.push(val);
        if (recEnded) break;
        if (i >= n) { recEnded = true; break; }
        // We stopped at a comma.
        i++;
        continue;
      }

      // Unquoted field: quotes are literal characters.
      lastQuoted = false;
      const r = scanUnquoted(text, i, n, '', errors, recLine, recRow);
      i = r.i; line += r.lines; recEnded = r.ended; fields.push(r.value);
      if (recEnded) break;
      if (i >= n) { recEnded = true; break; }
      i++; // skip the comma
    }

    // ---- record finished ----
    // A line that held only stray CRs is left with no characters: no record
    // (its stray_cr errors stay).
    if (fields.length === 1 && fields[0] === '' && !lastQuoted) continue;
    if (first) {
      width = fields.length;
      columns = header ? fields : null;
      first = false;
      if (!header) {
        rows.push(fields);
      }
    } else {
      if (fields.length < width) {
        errors.push({ code: 'short_row', line: recLine, row: recRow, fields: fields.length });
        while (fields.length < width) fields.push('');
      } else if (fields.length > width) {
        const extra = fields.slice(width);
        errors.push({ code: 'long_row', line: recLine, row: recRow, extra });
        fields.length = width;
      }
      rows.push(fields);
    }
  }

  return { columns: header ? (columns ?? []) : null, rows, errors };
}

// Count line breaks in text[a..b): each LF, each CRLF (once), each lone CR.
function countLines(text, a, b) {
  let count = 0;
  let p = a;
  while (p < b) {
    const nl = text.indexOf('\n', p);
    const cr = text.indexOf('\r', p);
    // Only count breaks strictly inside [a, b); a break at or after b
    // belongs to the text after this span and must not be counted here.
    if ((nl === -1 || nl >= b) && (cr === -1 || cr >= b)) break;
    if (cr !== -1 && cr < b && (nl === -1 || nl >= b || cr < nl)) {
      // CR at cr: lone unless followed by LF.
      if (cr + 1 < b && text.charCodeAt(cr + 1) === 10) { count++; p = cr + 2; }
      else { count++; p = cr + 1; }
    } else {
      count++;
      p = nl + 1;
    }
  }
  return count;
}

// Append text[a..b) to `base`, normalising each CRLF / lone CR to LF.
function normalizeSpan(base, text, a, b) {
  if (text.indexOf('\r', a) === -1 || text.indexOf('\r', a) >= b) {
    return base + text.slice(a, b);
  }
  let out = base;
  let p = a;
  while (p < b) {
    const cr = text.indexOf('\r', p);
    if (cr === -1 || cr >= b) { out += text.slice(p, b); break; }
    out += text.slice(p, cr) + '\n';
    p = (cr + 1 < b && text.charCodeAt(cr + 1) === 10) ? cr + 2 : cr + 1;
  }
  return out;
}

// Scan an unquoted field starting at i. Returns {i, ended, value, lines}
// where ended=true means a line break or EOF ended the record, lines is 1
// when a line break was consumed (else 0), and otherwise i points at the
// comma that ended the field. Stray CRs are dropped with an error.
function scanUnquoted(text, i, n, prefix, errors, recLine, recRow) {
  let value = prefix;
  let start = i;
  let ended = false;
  let lines = 0;
  while (true) {
    // Next delimiter: comma, LF, or CR, whichever comes first.
    const comma = text.indexOf(',', i);
    const lf = text.indexOf('\n', i);
    const cr = text.indexOf('\r', i);
    let d = -1; let kind = 0; // 1=comma 2=lf 3=cr
    if (comma !== -1) { d = comma; kind = 1; }
    if (lf !== -1 && (d === -1 || lf < d)) { d = lf; kind = 2; }
    if (cr !== -1 && (d === -1 || cr < d)) { d = cr; kind = 3; }
    if (d === -1) {
      value += text.slice(start, n);
      i = n; ended = true;
      break;
    }
    if (kind === 1) {
      value += text.slice(start, d);
      i = d;
      break;
    }
    if (kind === 2) {
      value += text.slice(start, d);
      i = d + 1; ended = true; lines = 1;
      break;
    }
    // CR: CRLF ends the record; a lone CR is dropped (stray_cr).
    if (d + 1 < n && text.charCodeAt(d + 1) === 10) {
      value += text.slice(start, d);
      i = d + 2; ended = true; lines = 1;
      break;
    }
    errors.push({ code: 'stray_cr', line: recLine, row: recRow });
    value += text.slice(start, d);
    i = d + 1;
    start = i;
  }
  return { i, value, ended, lines };
}
