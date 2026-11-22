# ANZInnovate agent notes

## Purpose
Static Australian National Innovation visa (subclass 858) website published by ANZ Migrate Pte Ltd.

## Project boundaries
- Use semantic HTML, local CSS and vanilla JavaScript; no framework, build tool, package, backend, forms or calculator.
- Preserve mobile navigation, accessibility, accordion functionality and reduced-motion fallbacks.
- Confirm public immigration facts against the ANZ Migrate NIV information sheets and Department of Home Affairs.
- Disclose private publisher identity, national migration registration identifiers and not-government status.

## Pages
- `index.html`: NIV eligibility, nine indicators, priority sectors, process, checklist, FAQs and contact CTA.
- `who-we-are/index.html`: publisher information.
- `privacy/index.html`: privacy and official sources.
- Legacy routes `/visas/`, `/study/`, `/skillselect/`, `/faq/` should be 301 redirects configured in `vercel.json` and `_redirects`. Their HTML files are non-indexed fallback redirects only.

## QA
1. Check nine indicator cards, two-indicator benchmarks, 2026 statistics, visa fees and Form 1000 requirements.
2. Check internal and cross-page navigation including #next and #faq.
3. Verify hosting honours 301 redirects; HTML fallbacks are not actual HTTP 301s.
4. Validate deployment and sitemap with the live hostname.
