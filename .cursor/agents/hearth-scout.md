---
name: hearth-scout
description: >
  Locate Hearth code and callers without editing. Uses Cursor's standard
  routine model while keeping the shared Claude-compatible prompt canonical.
model: composer-2.5
readonly: true
---

Read and follow `.claude/agents/hearth-scout.md` in full.

That file is the canonical behaviour and output contract. Ignore only its
frontmatter `model` and `tools` fields: this Cursor wrapper's model selection,
read-only restriction and Cursor's available tools take precedence. Do not
substitute a more expensive model if this model is unavailable; report the
availability problem to the parent agent.
