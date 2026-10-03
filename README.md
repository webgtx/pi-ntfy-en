# pi-ntfy-en

NTFY notification plugin for the pi coding agent (English UI fork of `pi-ntfy`), designed to distinguish projects, sessions, and tasks during parallel development.

## Features

- NTFY only — no Bark, Feishu, WeCom, DingTalk, or generic webhooks
- Title includes project, status, and session name
- Body includes project, session, status, reason, and more (fully templateable)
- Duration, model, host, and time each get their own line
- NTFY uses status tags per event type
- Supports environment variables for the NTFY token

## Installation

```bash
pi install npm:pi-ntfy-en
```

Uninstall:

```bash
pi remove npm:pi-ntfy-en
```

## Configuration

The plugin reads its config from a fixed path; the path is not influenced by environment variables:

```text
~/.pi/agent/pi-ntfy.json
```

If the file does not exist, the plugin stays silent. Create the file directly, or use the `/ntfy set`, `/ntfy enable`, and other commands to generate and modify it.

Example configuration:

```json
{
  "enabled": true,
  "modes": ["tui"],
  "titleTemplate": "[{{project}}] {{status}} · {{session}}",
  "template": "Project: {{project}}\\nSession: {{session}}\\nTask: {{task}}\\nStatus: {{status}}\\nReason: {{reason}}\\nSummary: {{summary}}\\nDuration: {{duration}}\\nModel: {{model}}\\nHost: {{host}}\\nTime: {{date}} {{time}}\\nTools: {{tools}}",
  "channels": [
    {
      "type": "ntfy",
      "name": "Agent",
      "enabled": true,
      "topic": "Agent",
      "server": "https://ntfy.sh",
      "token": "$NTFY_TOKEN"
    }
  ]
}
```

`token` may reference an environment variable via `$NTFY_TOKEN` or `${NTFY_TOKEN}`; the config file path itself is not affected by environment variables.

Configuration fields:

```json
{
  "titleTemplate": "[{{project}}] {{status}} · {{session}}",
  "template": "Project: {{project}}\\nSession: {{session}}\\nTask: {{task}}\\nStatus: {{status}}\\nReason: {{reason}}\\nSummary: {{summary}}\\nDuration: {{duration}}\\nModel: {{model}}\\nHost: {{host}}\\nTime: {{date}} {{time}}\\nTools: {{tools}}"
}
```

Supported placeholders:

```text
{{status}} {{reason}} {{text}} {{title}} {{event}}
{{cwd}} {{project}} {{duration}} {{session}} {{sessionId}}
{{model}} {{mode}} {{thinking}} {{task}} {{summary}} {{tools}}
{{host}} {{time}} {{date}}
```

> **Privacy note:** `{{task}}` and `{{summary}}` carry conversation content (your latest input and the agent's latest reply, each truncated). Omit those placeholders from `template` if you don't want content leaving your machine.

## Commands

```text
/ntfy
/ntfy list
/ntfy get
/ntfy set topic=xxx enabled=true
/ntfy enable
/ntfy disable
/ntfy test
/ntfy events idle=on interrupted=on needInput=on exit=off
/ntfy on
/ntfy off
```
