import { describe, it, expect } from "bun:test";
import { sanitizeOptionalRichText, sanitizeRichText } from "../sanitize-html";

describe("sanitizeRichText", () => {
  it("strips scripts, event handlers and javascript: URLs", () => {
    expect(sanitizeRichText("<p>a<script>alert(1)</script></p>")).toBe("<p>a</p>");
    expect(sanitizeRichText('<img src="x" onerror="alert(1)" />')).toBe('<img src="x" />');
    expect(sanitizeRichText('<a href="javascript:alert(1)">x</a>')).not.toContain("javascript");
    expect(sanitizeRichText('<iframe src="https://evil"></iframe>')).toBe("");
    expect(sanitizeRichText('<p style="background:url(x)">a</p>')).toBe("<p>a</p>");
  });

  it("keeps what the editor produces", () => {
    const html =
      '<h2 style="text-align:center">Title</h2><p><strong>b</strong> <em>i</em> <u>u</u> <s>s</s></p>' +
      '<ul><li><p>one</p></li></ul><blockquote><p>q</p></blockquote>' +
      '<pre><code class="language-ts">x</code></pre><img src="https://example.com/a.png" alt="a" />';
    expect(sanitizeRichText(html)).toBe(html);
  });

  it("forces safe link attributes", () => {
    expect(sanitizeRichText('<a href="https://example.com">x</a>')).toBe(
      '<a href="https://example.com" target="_blank" rel="noopener noreferrer nofollow">x</a>',
    );
  });

  it("only accepts raster data images", () => {
    expect(sanitizeRichText('<img src="data:image/png;base64,AAAA" />')).toContain("data:image/png");
    expect(sanitizeRichText('<img src="data:image/svg+xml;base64,AAAA" />')).toBe("");
  });

  it("passes nullish values through", () => {
    expect(sanitizeOptionalRichText(null)).toBeNull();
    expect(sanitizeOptionalRichText(undefined)).toBeUndefined();
  });
});
