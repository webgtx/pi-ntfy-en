# pi-ntfy

Pi coding agent 的 NTFY 专用通知插件，适合并行开发时区分项目、Session 和任务。

## 特性

- 仅支持 NTFY，移除 Bark、飞书、企业微信、钉钉和通用 Webhook
- 插件名称：`pi-ntfy`
- 标题包含项目、状态和 Session 名称
- 正文包含项目、Session、任务、摘要、状态、原因
- 耗时、模型、主机、时间各自独占一行
- NTFY 使用状态标签和项目/Session/任务元数据 headers
- 支持环境变量保存 NTFY token

## 安装

```bash
pi remove /home/yanghao05/Workspace/pi-push
pi install /home/yanghao05/Workspace/pi-push
```

不要同时安装或启用旧版 `npm:pi-agent-push`。

## 配置

```bash
cp config.example.json config.json
```

默认配置：

```json
{
  "titleTemplate": "[{{project}}] {{status}} · {{session}}",
  "template": "项目: {{project}}\n会话: {{session}}\n任务: {{task}}\n状态: {{status}}\n原因: {{reason}}\n摘要: {{summary}}\n耗时: {{duration}}\n模型: {{model}}\n主机: {{host}}\n时间: {{date}} {{time}}\n工具: {{tools}}",
  "channels": [
    {
      "type": "ntfy",
      "enabled": true,
      "topic": "$NTFY_TOPIC",
      "server": "$NTFY_HOST",
      "token": "$NTFY_TOKEN"
    }
  ]
}
```

支持的占位符：

```text
{{status}} {{reason}} {{text}} {{title}} {{event}}
{{cwd}} {{project}} {{duration}} {{session}} {{sessionId}}
{{model}} {{mode}} {{thinking}} {{task}} {{summary}} {{tools}}
{{host}} {{time}} {{date}}
```

## 命令

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

旧的 `/push` 命令不再使用。
