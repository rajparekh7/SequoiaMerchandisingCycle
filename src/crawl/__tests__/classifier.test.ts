import { test } from "node:test";
import assert from "node:assert/strict";

import { classifyPage, typeFromUrl } from "../classifier.ts";

const ROOT = "https://x.com/";

test("typeFromUrl maps common paths to page types", () => {
  const cases: Array<[string, string]> = [
    ["https://x.com/", "homepage"],
    ["https://x.com", "homepage"],
    ["https://x.com/pricing", "pricing"],
    ["https://x.com/plans", "pricing"],
    ["https://x.com/about", "about"],
    ["https://x.com/company/team", "about"],
    ["https://x.com/careers", "careers"],
    ["https://x.com/customers/acme", "case_study"],
    ["https://x.com/docs/api", "docs"],
    ["https://x.com/help", "docs"],
    ["https://x.com/blog", "blog_index"],
    ["https://x.com/blog/how-to-grow", "blog_post"],
    ["https://x.com/product", "product"],
    ["https://x.com/features/routing", "product"],
    ["https://x.com/random-thing", "other"],
  ];
  for (const [url, expected] of cases) {
    assert.equal(typeFromUrl(url, ROOT), expected, url);
  }
});

test("blog index vs blog post depends on whether there's a child path", () => {
  assert.equal(typeFromUrl("https://x.com/blog", ROOT), "blog_index");
  assert.equal(typeFromUrl("https://x.com/blog/post-1", ROOT), "blog_post");
});

test("classifyPage falls back to content for URL-ambiguous pages", () => {
  assert.equal(
    classifyPage({ url: "https://x.com/go", rootUrl: ROOT, markdown: "Simple, transparent pricing — $10 per month." }),
    "pricing",
  );
  assert.equal(
    classifyPage({ url: "https://x.com/x", rootUrl: ROOT, markdown: "Read the full case study from our customer." }),
    "case_study",
  );
  assert.equal(
    classifyPage({ url: "https://x.com/nothing-here", rootUrl: ROOT, markdown: "Just a random landing block." }),
    "other",
  );
});

test("a clear URL type is not overridden by content", () => {
  // /pricing stays pricing even if the body happens to mention 'case study'.
  assert.equal(
    classifyPage({ url: "https://x.com/pricing", rootUrl: ROOT, markdown: "See our customer case study." }),
    "pricing",
  );
});
