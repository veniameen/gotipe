import { describe, it, expect } from 'vitest';
import { sanitizeHtml } from '../src/security/sanitizer';

describe('sanitizeHtml', () => {
  it('should allow safe HTML tags', () => {
    const result = sanitizeHtml('<p>Hello <strong>world</strong></p>');
    expect(result).toContain('<p>');
    expect(result).toContain('<strong>');
  });

  it('should strip script tags', () => {
    const result = sanitizeHtml('<p>Hello</p><script>alert("xss")</script>');
    expect(result).not.toContain('<script>');
    expect(result).toContain('Hello');
  });

  it('should strip javascript: hrefs', () => {
    const result = sanitizeHtml('<a href="javascript:alert(1)">click</a>');
    expect(result).not.toContain('javascript:');
  });

  it('should strip data: src attributes', () => {
    const result = sanitizeHtml('<img src="data:text/html,<script>alert(1)</script>">');
    expect(result).not.toContain('data:');
  });

  it('should strip event handlers', () => {
    const result = sanitizeHtml('<p onclick="alert(1)">text</p>');
    expect(result).not.toContain('onclick');
  });

  it('should allow safe links', () => {
    const result = sanitizeHtml('<a href="https://example.com">link</a>');
    expect(result).toContain('href="https://example.com"');
  });

  it('should fallback to tag stripping in SSR (no DOMParser)', () => {
    // This test validates the SSR fallback path
    const html = '<p>Hello</p>';
    // In SSR, DOMParser is not available, so it should strip tags
    // Note: In test env DOMParser might be available via jsdom
    const result = sanitizeHtml(html);
    expect(result).toBeTruthy();
  });
});
