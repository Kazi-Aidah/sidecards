
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
      if (/^[A-Za-z0-9 _-]+$/.test(s)) valueStr = s;
      else valueStr = '"' + s.replace(/"/g, '\\"') + '"';
    }

    filtered.push(keyName + ': ' + valueStr);
    const newFm = filtered.join('\n');
    return '---\n' + newFm + '\n---\n' + rest;
  } catch (err) {
    // eslint-disable-next-line no-undef
    console.error('Error in updateFrontmatter:', err);
    return content;
  }
}

export function parseTagsFromFrontmatter(fm: string): string[] {
  const lines = fm.split(/\r?\n/);
  const tagsLine = lines.find(l => /^\s*tags\s*:/i.test(l));
  if (!tagsLine) return [];

  const content = tagsLine.replace(/^\s*tags\s*:/i, '').trim();
  const sanitize = (t: string) => t.trim().replace(/^[-#\s]+/, '').replace(/^- /g, '').trim();

  if (!content) {
    // Check if it's a list format below
    const tagsIdx = lines.findIndex(l => /^\s*tags\s*:/i.test(l));
    const listTags: string[] = [];
    for (let i = tagsIdx + 1; i < lines.length; i++) {
      const line = lines[i];
      const match = line.match(/^\s*-\s+(.*)$/);
      if (match) {
        listTags.push(sanitize(match[1]));
      } else if (line.trim() && !line.startsWith(' ')) {
        break;
      }
    }
    return listTags;
  }

  if (content.startsWith('[')) {
    try {
      const parsed = JSON.parse(content.replace(/'/g, '"'));
      return Array.isArray(parsed) ? parsed.map(sanitize) : [sanitize(String(parsed))];
    } catch {
      return content.replace(/[[\]"']/g, '').split(',').map(sanitize).filter(Boolean);
    }
  }
  
  // Single tag or comma-separated
  return content.split(',').map(sanitize).filter(Boolean);
}
