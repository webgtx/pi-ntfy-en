# pi-ntfy 设计说明

## 目标

只通过 NTFY 推送 pi Agent 的状态，并让并行开发时可以区分项目、Session 和任务。

## 事件

- `agent_start`：记录开始时间和当前任务
- `agent_end`：记录最终 assistant 摘要和停止原因
- `agent_settled`：唯一的 idle/interrupted 推送点
- `tool_execution_start`：记录本轮使用过的工具
- `tool_call`：检测需要用户回答的工具
- `session_shutdown`：按配置发送退出通知

## 内容

标题默认包含：

```text
[项目] 状态 · Session
```

正文默认每项独占一行：

```text
项目
会话
任务
状态
原因
摘要
耗时
模型
主机
时间
工具
```

## 通道

本插件只有一个通道：`ntfy`。其他推送通道和对应实现已移除。

NTFY 元数据使用 `Title`、`Tags`、`X-Project`、`X-Session`、`X-Event`、`X-Task` headers。含中文的字段会写入 Base64 版本的 headers，完整中文内容始终保留在正文中。
