---
name: hearth-verifier
description: >
  Run Hearth's post-edit checks without changing files. Uses Cursor's fast
  routine model while keeping the shared Claude-compatible prompt canonical.
model: composer-2.5-fast
readonly: true
---

Read and follow `.claude/agents/hearth-verifier.md` in full.

That file is the canonical behaviour and output contract. Ignore only its
frontmatter `model` and `tools` fields: this Cursor wrapper's model selection,
read-only restriction and Cursor's available tools take precedence. Do not
substitute a more expensive model if this model is unavailable; report the
availability problem to the parent agent.
