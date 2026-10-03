# pi-ntfy-en Design Notes

## Goal

Push pi agent status exclusively via NTFY, so parallel development sessions can be distinguished by project, session, and task.

## Events

- `agent_start`: remember when the run started
- `agent_end`: remember the terminal assistant summary and stop reason of this low-level run
- `agent_settled`: the single idle/interrupted push point, after retries and compaction
- `tool_execution_start`: record the tools used during the run
- `tool_call`: detect tools that are waiting for a user answer
- `session_shutdown`: send the exit notification when enabled

## Content

The title includes, by default:

```text
[project] status · session
```

The body includes, by default (one item per line):

```text
Project
Session
Task
Status
Reason
Summary
Duration
Model
Host
Time
Tools
```

## Channel

This plugin has a single channel: `ntfy`. Other push channels and their implementations have been removed.

NTFY publishes as JSON (POST to the server root): `title`/`message` travel in the UTF-8 body, so non-ASCII titles and bodies are unaffected by the Latin-1-only HTTP header limitation. `tags`/`priority`/`click`/`icon`/`email` are likewise carried as JSON fields.
