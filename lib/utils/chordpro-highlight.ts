function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * Renders ChordPro text as HTML with directives/section-headers/chords each
 * wrapped in a colored span using the design system's CSS custom properties.
 */
export function highlightChordPro(text: string): string {
  return text
    .split('\n')
    .map((line) => {
      const directiveM = line.match(/^\{([a-z_]+):(.*)\}$/i);
      if (directiveM) {
        return `<span style="color:var(--accent-ink)">${escapeHtml(line)}</span>`;
      }

      const sectionM = line.match(/^\[([^\]]+)\]$/);
      if (sectionM) {
        return `<span style="color:var(--tune);font-weight:700">${escapeHtml(line)}</span>`;
      }

      return line
        .split(/(\[[^\]]*\])/g)
        .map((part) =>
          part.startsWith('[') && part.endsWith(']')
            ? `<span style="color:var(--accent-ink);font-weight:700">${escapeHtml(part)}</span>`
            : `<span style="color:var(--ink)">${escapeHtml(part)}</span>`
        )
        .join('');
    })
    .join('\n');
}
