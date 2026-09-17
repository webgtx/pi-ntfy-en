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
pi install npm:pi-ntfy
```

卸载：

```bash
pi remove npm:pi-ntfy
```

## 配置

插件固定从以下路径读取配置，不再通过环境变量选择配置文件：

```text
~/.pi/agent/pi-ntfy.json
```

如果文件不存在，插件保持静默；可直接创建该文件，或使用 `/ntfy set`、`/ntfy enable` 等命令生成和修改配置。

示例配置：

```json
{
  "enabled": true,
  "modes": ["tui"],
  "titleTemplate": "[{{project}}] {{status}} · {{session}}",
  "template": "项目: {{project}}\\n会话: {{session}}\\n任务: {{task}}\\n状态: {{status}}\\n原因: {{reason}}\\n摘要: {{summary}}\\n耗时: {{duration}}\\n模型: {{model}}\\n主机: {{host}}\\n时间: {{date}} {{time}}\\n工具: {{tools}}",
  "channels": [
    {
      "type": "ntfy",
      "name": "Agent",
      "enabled": true,
      "topic": "Agent",
      "server": "https://n.ipao.vip",
      "token": "$NTFY_TOKEN"
    }
  ]
}
```

`token` 可以使用 `$NTFY_TOKEN` 或 `${NTFY_TOKEN}` 引用环境变量；配置文件路径本身不受环境变量影响。

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

## 发布

版本发布由 Gitea Actions 完成。推送 `v*` 标签或手动运行 `Publish pi-ntfy to npm` workflow 即可发布到 npm。

workflow 使用账户级 Secret：

```text
NPM_PACKAGE_TOKEN
```

例如：

```bash
npm version patch
git push
git push --tags
```
