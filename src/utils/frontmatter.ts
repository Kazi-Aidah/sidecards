export function parseTagsFromFrontmatter(fm: string): string[] {
  const lines = fm.split(/\r?\n/);
  const tagsLine = lines.find(l => /^\s*tags\s*:/i.test(l));
  if (!tagsLine) return [];

  const content = tagsLine.replace(/^\s*tags\s*:/i, '').trim();
  const sanitize = (t: string) => t.trim().replace(/^[-#\s]+/, '').replace(/^- /g, '').trim();

  if (!content) {
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

  return content.split(',').map(sanitize).filter(Boolean);
}
