import { looksLikeSection } from './chordpro-parser';

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * Renders ChordPro text as HTML with directives/section-headers/chords each
 * wrapped in a colored span using the design system's CSS custom properties.
 * Avoids font-weight changes so the syntax-highlight <pre> matches <textarea> glyph widths 1:1.
 */
export function highlightChordPro(text: string): string {
  return text
    .split('\n')
    .map((line) => {
      const directiveM = line.match(/^\s*\{([a-z_]+):(.*)\}\s*$/i);
      if (directiveM) {
        return `<span style="color:var(--accent-ink)">${escapeHtml(line)}</span>`;
      }

      const sectionM = line.match(/^\s*\[([^\]]+)\]\s*$/);
      if (sectionM && looksLikeSection(sectionM[1])) {
        return `<span style="color:var(--tune);background:var(--tune-dim);border-radius:4px">${escapeHtml(line)}</span>`;
      }

      return line
        .split(/(\[[^\]]*\])/g)
        .map((part) =>
          part.startsWith('[') && part.endsWith(']')
            ? `<span style="color:var(--accent-ink);background:var(--primary-container);border-radius:4px">${escapeHtml(part)}</span>`
            : `<span style="color:var(--ink)">${escapeHtml(part)}</span>`
        )
        .join('');
    })
    .join('\n');
}
