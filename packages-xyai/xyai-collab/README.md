# @xyai/dsh-product-collab

Desktop collaboration layer: one Cordis patch that mounts `@xyai/dsh-ai-employees`
after `@xyai/dsh-product-base`.

Keep this separate from product-base so the five local-capability plugins can
cold-start without Agent Teams. The employee library Host activates without
`agentTeams`; team spawn, mailbox, and task RPC refuse until a composition
provides Agent Teams (the full web XYAI profile does; the desktop seed does not).
