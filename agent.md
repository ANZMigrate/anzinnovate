# ANZInnovate agent notes

## Purpose
Static Australian National Innovation visa (subclass 858) website published by ANZ Migrate Pte Ltd.

## Project boundaries
- Use semantic HTML, local CSS and vanilla JavaScript; no UI framework or eligibility calculator. The only Node.js dependency is Nodemailer for the Vercel enquiry endpoint.
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

## Enquiry form and SMTP
- The homepage has a direct enquiry form at `#eligibility-check` and a prominent hero/header CTA.
- `enquiry.js` validates inputs and submits JSON; `api/enquiry.js` sends mail to the fixed mailbox info@anzinnovate.com using SMTP environment variables.
- Configure `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM` (optional `SMTP_SECURE`) in Vercel Production environment. Do not commit credentials.
- Do not claim the form is live until SMTP is configured and a real delivery is tested. CV PDF/DOC/DOCX attachment limit: 2 MB.
- Preserve the verified NIV copy when adjusting layout. The Privacy notice necessarily documents the new enquiry workflow.
