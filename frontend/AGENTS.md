<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Known error: too many images in request

If you hit this:

```
AiError: AiError: Invalid data for image - reason too many images in request (max 32) (4b910a94-d579-4dd7-8897-24915fb68459)
```

(also seen as `2e4b0b08-c543-439b-811a-74456052d1d1`, `6989dc2a-1a6b-4ed7-a16a-4f0462f205a5`)

the provider rejects requests carrying more than **32 images** — a hard limit, not a
transient failure. Don't retry the same request; reduce the payload instead. Avoid it by:

- Sending at most 32 images per request — trim, batch, or split the payload before calling the model.
- Not re-sending accumulated conversation images on every turn; keep history lean (drop or summarize old image attachments).
- Deduplicating identical images and skipping any that are not needed for the current step.
- Checking the image count before the request and failing fast with a clear message instead of letting the provider error surface.
