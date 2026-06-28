// Page-type classification (PRD §4.1 / §6.2). Maps a crawled URL + content to one of the
// PageTypes the engine routes on. Primary signal is the URL path (cheap, deterministic);
// content is a fallback for ambiguous "other" pages. Pure logic — fully unit-tested.

import type { PageType } from "../engine/types.ts";

function pathSegments(u: URL): string[] {
  return u.pathname.split("/").filter(Boolean);
}

/** Best-guess page type from the URL alone (used by both the classifier and URL selection). */
export function typeFromUrl(url: string, rootUrl: string): PageType {
  let u: URL;
  let root: URL;
  try {
    u = new URL(url);
    root = new URL(rootUrl);
  } catch {
    return "other";
  }

  const segs = pathSegments(u);
  if (segs.length === 0) return "homepage";
  // Treat the bare root (even with a trailing path equal to root's) as homepage.
  if (u.pathname.replace(/\/+$/, "") === root.pathname.replace(/\/+$/, "")) return "homepage";

  const first = segs[0]!.toLowerCase();
  const hasChild = segs.length > 1;

  if (/^(pricing|plans?)$/.test(first)) return "pricing";
  if (/^(about|company|mission|team|story)$/.test(first)) return "about";
  if (/^(careers?|jobs)$/.test(first)) return "careers";
  if (/^(customers?|case-stud(y|ies)|success-stories?|case-studies)$/.test(first)) {
    return "case_study";
  }
  if (/^(docs?|documentation|help|support|developers?|api|knowledge-base|kb)$/.test(first)) {
    return "docs";
  }
  if (/^(blog|news|articles?|resources?|guides?|insights?)$/.test(first)) {
    return hasChild ? "blog_post" : "blog_index";
  }
  if (/^(product|products|features?|platform|solutions?|use-cases?|capabilities)$/.test(first)) {
    return "product";
  }
  return "other";
}

/** Refine the URL guess with page content for pages the URL couldn't classify. */
export function classifyPage(input: {
  url: string;
  rootUrl: string;
  markdown: string;
  title?: string;
}): PageType {
  const fromUrl = typeFromUrl(input.url, input.rootUrl);
  if (fromUrl !== "other") return fromUrl;

  const text = `${input.title ?? ""}\n${input.markdown}`.toLowerCase();
  if (/\bpricing\b|\$\s?\d|\bper (month|user|seat|year)\b/.test(text)) return "pricing";
  if (/\bcase study\b|\bcustomer story\b|\bsuccess story\b/.test(text)) return "case_study";
  if (/\bdocumentation\b|\bapi reference\b|\bgetting started\b/.test(text)) return "docs";
  if (/\bour mission\b|\bour story\b|\babout us\b|\bfounded\b/.test(text)) return "about";
  return "other";
}
