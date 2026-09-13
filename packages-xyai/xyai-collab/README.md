# @xyai/dsh-product-collab

Desktop collaboration layer: one Cordis patch that mounts `@xyai/dsh-ai-employees`
after `@xyai/dsh-product-base`.

Keep this separate from product-base so the five local-capability plugins can
cold-start without Agent Teams / AI-employee experimental surfaces.
