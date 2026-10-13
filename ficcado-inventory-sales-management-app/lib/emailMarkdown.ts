/**
 * lib/emailMarkdown.ts
 *
 * Lightweight, robust Markdown-to-HTML parser for Ficcado announcement emails.
 * Converts markdown formatting syntax into styled inline HTML elements:
 *  - **bold** -> <strong>bold</strong>
 *  - *italic* or _italic_ -> <em>italic</em>
 *  - [text](url) -> <a href="url">text</a>
 *  - # Heading / ## Heading -> <h3 ...>Heading</h3>
 *  - - Item / * Item -> <li>Item</li>
 *  - Paragraph breaks -> <p ...>
 */

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export function renderEmailMarkdown(markdown: string): string {
  if (!markdown) return '';

  const lines = markdown.split('\n');
  const htmlLines: string[] = [];
  let inList = false;

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];

    // Check for list item (- item or * item)
    const listMatch = line.match(/^(\s*)[-*]\s+(.*)$/);
    if (listMatch) {
      if (!inList) {
        inList = true;
        htmlLines.push('<ul style="margin: 10px 0; padding-left: 24px; color: #22261E;">');
      }
      const itemText = formatInlineMarkdown(listMatch[2]);
      htmlLines.push(`<li style="margin-bottom: 6px; line-height: 1.6;">${itemText}</li>`);
      continue;
    }

    // Close list if line is not a list item
    if (inList) {
      inList = false;
      htmlLines.push('</ul>');
    }

    // Check headings (# Heading, ## Heading, ### Heading)
    const headingMatch = line.match(/^(#{1,3})\s+(.*)$/);
    if (headingMatch) {
      const headingText = formatInlineMarkdown(headingMatch[2]);
      const level = headingMatch[1].length;
      const fontSize = level === 1 ? '20px' : level === 2 ? '17px' : '15px';
      htmlLines.push(
        `<h3 style="font-family: Arial, sans-serif; color: #2B62C6; font-size: ${fontSize}; font-weight: 700; margin: 18px 0 8px 0;">${headingText}</h3>`
      );
      continue;
    }

    // Empty line -> paragraph break
    if (!line.trim()) {
      htmlLines.push('<div style="height: 12px;"></div>');
      continue;
    }

    // Regular text line
    const formattedLine = formatInlineMarkdown(line);
    htmlLines.push(`<p style="margin: 0 0 8px 0; line-height: 1.6; color: #22261E; font-size: 15px;">${formattedLine}</p>`);
  }

  if (inList) {
    htmlLines.push('</ul>');
  }

  return htmlLines.join('\n');
}

/** Formats inline elements: **bold**, *italic*, [link](url) */
function formatInlineMarkdown(text: string): string {
  let result = escapeHtml(text);

  // Markdown links: [Link Text](http://example.com)
  result = result.replace(
    /\[([^\]]+)\]\(([^)]+)\)/g,
    (_, linkText, url) => {
      // Unescape HTML in URL if needed
      const cleanUrl = url.replace(/&amp;/g, '&');
      return `<a href="${cleanUrl}" target="_blank" style="color: #2B62C6; font-weight: 700; text-decoration: underline;">${linkText}</a>`;
    }
  );

  // Bold: **text** or __text__
  result = result.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  result = result.replace(/__([^_]+)__/g, '<strong>$1</strong>');

  // Italic: *text* or _text_
  result = result.replace(/\*([^*]+)\*/g, '<em>$1</em>');
  result = result.replace(/_([^_]+)_/g, '<em>$1</em>');

  return result;
}
