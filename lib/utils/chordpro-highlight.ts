function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * Renders ChordPro text as HTML with directives/section-headers/chords each
 * wrapped in a colored span. All text content is HTML-escaped before being
 * placed in a span — never trust/render raw user text as markup.
 */
export function highlightChordPro(text: string): string {
  return text
    .split('\n')
    .map((line) => {
      const directiveM = line.match(/^\{([a-z_]+):(.*)\}$/i);
      if (directiveM) {
        return `<span class="text-amber-400">${escapeHtml(line)}</span>`;
      }

      const sectionM = line.match(/^\[([^\]]+)\]$/);
      if (sectionM) {
        return `<span class="text-cyan-400 font-bold">${escapeHtml(line)}</span>`;
      }

      return line
        .split(/(\[[^\]]*\])/g)
        .map((part) =>
          part.startsWith('[') && part.endsWith(']')
            ? `<span class="text-violet-400 font-bold">${escapeHtml(part)}</span>`
            : `<span class="text-zinc-300">${escapeHtml(part)}</span>`
        )
        .join('');
    })
    .join('\n');
}
