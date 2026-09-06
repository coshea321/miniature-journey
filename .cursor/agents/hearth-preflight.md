---
name: hearth-preflight
description: >
  Run Hearth's mandatory preflight before any edit. Uses Cursor's fast
  routine model while keeping the shared Claude-compatible prompt canonical.
model: composer-2.5-fast
---

Read and follow `.claude/agents/hearth-preflight.md` in full.

That file is the canonical behaviour and output contract. Ignore only its
frontmatter `model` and `tools` fields: this Cursor wrapper's model selection
and Cursor's available tools take precedence. Do not substitute a more
expensive model if this model is unavailable; report the availability
problem to the parent agent.
