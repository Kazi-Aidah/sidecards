
export function updateFrontmatter(content: string, key: string, value: any): string {
  try {
    if (typeof content !== 'string') return content;

    const keyName = String(key || '').trim();
    if (!keyName) return content;

    const fmMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
    const fm = fmMatch ? fmMatch[1] : '';
    const rest = fmMatch ? content.slice(fmMatch[0].length) : content;

    const lines = fm ? fm.split(/\r?\n/) : [];
    const escKey = keyName.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
    const keyRegex = new RegExp('^\\s*' + escKey + '\\s*:\\s*.*$', 'i');
    const filtered = lines.filter(l => !keyRegex.test(l));

    if (value === null || typeof value === 'undefined') {
      if (filtered.length === 0) {
        return rest.startsWith('\n') ? rest.slice(1) : rest;
      }
      const rebuilt = filtered.join('\n');
      return '---\n' + rebuilt + '\n---\n' + rest;
    }

    let valueStr;
    if (typeof value === 'boolean' || typeof value === 'number') {
      valueStr = String(value);
    } else {
      const s = String(value);
      if (/^[A-Za-z0-9 _\-]+$/.test(s)) valueStr = s;
      else valueStr = '"' + s.replace(/"/g, '\\"') + '"';
    }

    filtered.push(keyName + ': ' + valueStr);
    const newFm = filtered.join('\n');
    return '---\n' + newFm + '\n---\n' + rest;
  } catch (err) {
    console.error('Error in updateFrontmatter:', err);
    return content;
  }
}

export function parseTagsFromFrontmatter(fm: string): string[] {
  const match = fm.match(/tags:\s*\[(.*?)\]/i) || fm.match(/tags:\s*(.*)/i);
  if (!match) return [];
  const raw = match[1];
  if (raw.startsWith('[')) {
    try {
      return JSON.parse(raw.replace(/'/g, '"'));
    } catch (e) {
      return raw.replace(/[\[\]"']/g, '').split(',').map(t => t.trim()).filter(Boolean);
    }
  }
  return raw.split(',').map(t => t.trim()).filter(Boolean);
}
