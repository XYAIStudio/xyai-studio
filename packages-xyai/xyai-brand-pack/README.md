---
description: "XYAI brand-pack engine: Host-validated brand settings, browser brand editor, brand slots, and a disposable theme override layer."
kind: "package-reference"
---

# @xyai/dsh-brand-pack

English | [中文](README.zh.md)

## Summary

The Host registers the validated `xyai-brand` settings namespace: name, initials, accent, body text color, gradient start and end, vision statement, comma-separated ecosystem sites, an ICP filing number, and an image logo stored as a data URL up to about 60 KB. The browser half edits every field with one atomic mutation, projects the saved value into the sidebar and hero brand slots, and applies a disposable theme override layer to both brand-primary tokens plus the label-primary token when a body text color is set. A configured ICP filing number renders as a clickable legal line to the MIIT filing lookup under the hero brand mark and in the brand preview. Reset removes user overrides, and failed saves keep the draft.

## Table of Contents

- Summary
- Model Experience
- Known Limitations and Deferred Work
- Dev Note

## Model Experience

None, as this package registers browser-side brand settings and theme slots and adds no model context or tools.

#### KV Cache effect

None; this package neither assembles nor sends a provider request.

## Known Limitations and Deferred Work

- **Writable settings required** — brand editing is disabled on connections without a writable Host settings scope.
- **Per-tenant branding not provided** — tenant-isolated brand provisioning belongs to the `xyai-tenancy` seam.
- **Body text color is single-valued** — when set it applies to both light and dark themes; leave empty to keep the theme defaults.
- **No `./invariant`** — slot ownership and settings validation are owned by their DSH services; this package owns no independently diverging runtime observations.

### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
