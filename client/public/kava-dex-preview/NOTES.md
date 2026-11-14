# Kava Launchpad DEX — Design Preview · Notes

Replaced 2026-11-14. The previous page here was the old pre-launch
simulated demo (fake balances, simulated wallet) from before the real
DEX existed. It has been superseded by this preview.

## What this page is now

A **presentation preview of the live DEX page** (`/kava-dex/`), built for
Tom's approval after community feedback that the projects' UX should look
modern and professional while staying easy to use.

- The file is the live page's own code, byte-for-byte, except:
  - `<title>` / social titles and the header + footer brand now read
    **KAVA LAUNCHPAD** (the KL red orb logo is unchanged).
  - One appended `<style id="kl-preview-theme">` block restyles the page
    into a dark KL theme (orb-red primary, deep panels, stronger type
    hierarchy) and fixes the factory card's fact rows
    ("Fixed supply — no mint ever" / "Decimals") running together at
    phone width — they were unstyled `.rrow` elements.
  - A `noindex, nofollow` robots meta was added.
- **Nothing functional changed:** all element ids, i18n hooks and all
  18-language strings, and every script are identical to the live page.
  All buttons, tabs, forms and flows behave exactly as on `/kava-dex/`,
  including real chain reads. Fact-bearing text (10 KAVA creation fee,
  treasury wording, safety lines, "Built on Kava Chain with Kava Origin.")
  is verbatim.
- Known leftover, deliberate: in-page i18n copy (ribbon, swap subtitle)
  still says "Kava Dev DEX" in all 18 languages, because the preview brief
  required i18n strings to stay verbatim. A full rename needs its own
  i18n pass.

Nothing moves to `/kava-dex/` until Tom approves this preview.
