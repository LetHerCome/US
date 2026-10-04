# Review Checklist

Independent review should answer:

- Does the diff stay inside the mission scope?
- Did it reuse existing authorities rather than create parallel systems?
- Are auth/privacy/couple boundaries correct?
- Are retry, duplicate, stale and reconnect paths safe where relevant?
- Are product-visible states understandable without technical language?
- Do focused tests cover the new invariant?
- Does the full test suite and Cloudflare build pass?
- Any production/deploy/schema action performed without explicit authorization?

Return blockers first; do not rewrite the implementation during a review-only pass.
