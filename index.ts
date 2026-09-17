/** pi-ntfy runtime event wiring.
 *
 * Event wiring (see DESIGN.md for the reasoning):
 *
 *   agent_start      → remember when the run started
 *   agent_end        → remember the terminal stopReason of this low-level run
 *   agent_settled    → the single send point after retries and compaction
 *   tool_call        → pi is asking the user something
 *   session_shutdown → the session is going away
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { invalidateConfigCache, loadConfig } from "./config.ts";
import { filterConfigToChannel, handlePushCommand } from "./command.ts";
import { createNotifier, type PayloadInput } from "./notifier.ts";
import { summarizeError } from "./render.ts";
import type { ChannelResult, NotifyConfig } from "./types.ts";

interface RunState {
	startedAt: number;
	stopReason?: string;
	errorMessage?: string;
	task?: string;
	summary?: string;
	tools: Set<string>;
}

const ERROR_REASON_CHARS = 120;
const CONTEXT_CHARS = 180;

function compactText(value: string | undefined, max = CONTEXT_CHARS): string {
	if (!value) return "";
	const text = value
		.replace(/```[\s\S]*?```/g, "[代码]")
		.replace(/\s+/g, " ")
		.trim();
	return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function assistantText(message: { content?: unknown }): string {
	if (!Array.isArray(message.content)) return "";
	return message.content
		.filter((part): part is { type: "text"; text: string } =>
			Boolean(
				part &&
					typeof part === "object" &&
					(part as { type?: unknown }).type === "text" &&
					typeof (part as { text?: unknown }).text === "string",
			),
		)
		.map((part) => part.text)
		.join(" ");
}

function describeResults(results: ChannelResult[]): string {
	if (results.length === 0) return "没有匹配的渠道";
	return results
		.map((r) =>
			r.ok
				? `${r.channel} ok(${r.status}, ${r.ms}ms)`
				: `${r.channel} 失败(${r.error ?? "unknown"})`,
		)
		.join("; ");
}

export default function piNtfy(pi: ExtensionAPI) {
	const notifier = createNotifier();
	let run: RunState | undefined;
	let runtimeEnabled = true;
	let currentTask = "";

	/** Config for the current context, or undefined when this run must stay quiet. */
	function activeConfig(mode: string): NotifyConfig | undefined {
		if (!runtimeEnabled) return undefined;
		const config = loadConfig();
		if (!config.enabled || !config.exists) return undefined;
		// Subagents run `pi --mode json -p`; pushing for each of those is noise.
		if (!config.modes.includes(mode)) return undefined;
		return config;
	}

	function baseInput(
		ctx: {
			cwd: string;
			mode?: string;
			sessionManager: {
				getSessionName(): string | undefined;
				getSessionFile(): string | undefined;
				getSessionId?(): string;
			};
			model: { id: string; provider: string } | undefined;
			thinkingLevel?: string;
		},
		state?: RunState,
	): Pick<
		PayloadInput,
		| "cwd"
		| "session"
		| "sessionId"
		| "model"
		| "mode"
		| "thinking"
		| "task"
		| "summary"
		| "tools"
	> {
		const file = ctx.sessionManager.getSessionFile();
		const session =
			ctx.sessionManager.getSessionName() ??
			(file
				? file
						.split("/")
						.pop()
						?.replace(/\.jsonl?$/, "")
				: undefined);
		return {
			cwd: ctx.cwd,
			session: session ?? "",
			sessionId: ctx.sessionManager.getSessionId?.() ?? "",
			model: ctx.model ? `${ctx.model.provider}/${ctx.model.id}` : "",
			mode: ctx.mode ?? "",
			thinking: ctx.thinkingLevel ?? "",
			task: compactText(state?.task),
			summary: compactText(state?.summary),
			tools: state ? [...state.tools].join(", ") : "",
		};
	}

	pi.on("session_start", async () => {
		run = undefined;
		currentTask = "";
		invalidateConfigCache();
	});

	pi.on("input", async (event) => {
		const text = event.text.trim();
		if (!text || text.startsWith("/")) return;
		currentTask = compactText(text);
		if (run) run.task = currentTask;
	});

	pi.on("agent_start", async () => {
		run = { startedAt: Date.now(), task: currentTask, tools: new Set() };
	});

	pi.on("agent_end", async (event) => {
		if (!run)
			run = { startedAt: Date.now(), task: currentTask, tools: new Set() };
		for (let i = event.messages.length - 1; i >= 0; i--) {
			const message = event.messages[i];
			if (message.role !== "assistant") continue;
			const assistant = message as {
				stopReason?: string;
				errorMessage?: string;
				content?: unknown;
			};
			run.stopReason = assistant.stopReason;
			run.errorMessage = assistant.errorMessage;
			run.summary = compactText(assistantText(assistant));
			return;
		}
	});

	pi.on("tool_execution_start", async (event) => {
		if (!run) return;
		run.tools.add(event.toolName);
	});

	pi.on("agent_settled", async (_event, ctx) => {
		const state = run;
		run = undefined;

		const config = activeConfig(ctx.mode);
		if (!config) return;

		const durationMs = state ? Date.now() - state.startedAt : undefined;
		const stopReason = state?.stopReason;

		if (stopReason === "aborted" || stopReason === "error") {
			const reason =
				stopReason === "aborted"
					? "本轮被取消"
					: `运行出错：${summarizeError(state?.errorMessage, ERROR_REASON_CHARS) || "未知错误"}`;
			notifier.fire(config, {
				event: "interrupted",
				status: "已中断",
				reason,
				durationMs,
				...baseInput(ctx, state),
			});
			return;
		}

		// Short runs are usually the user still sitting at the keyboard.
		if (durationMs !== undefined && durationMs < config.minDurationSec * 1000)
			return;

		notifier.fire(config, {
			event: "idle",
			status: "已就绪",
			reason: "输出结束，等待输入",
			durationMs,
			...baseInput(ctx, state),
		});
	});

	pi.on("tool_call", async (event, ctx) => {
		const config = activeConfig(ctx.mode);
		if (!config) return;
		if (!config.needInputTools.includes(event.toolName)) return;
		notifier.fire(config, {
			event: "needInput",
			status: "需要确认",
			reason: "pi 正在等你回答问题",
			durationMs: run ? Date.now() - run.startedAt : undefined,
			...baseInput(ctx, run),
		});
	});

	pi.on("session_shutdown", async (event, ctx) => {
		const config = activeConfig(ctx.mode);
		if (!config) {
			await notifier.flush(1000);
			return;
		}
		if (event.reason === "quit") {
			// pi awaits this handler with no timeout of its own, so the cap is ours.
			await notifier.fireBlocking(
				config,
				{
					event: "exit",
					status: "已退出",
					reason: "会话结束",
					...baseInput(ctx, run),
				},
				config.shutdownTimeoutMs,
			);
		}
		// Drain notifications that were fired moments before the exit.
		await notifier.flush(config.shutdownTimeoutMs);
	});

	pi.registerCommand("ntfy", {
		description:
			"pi-ntfy: status|list|get|set|enable|disable|test|events|on|off|help",
		handler: async (args, ctx) => {
			let result: ReturnType<typeof handlePushCommand>;
			try {
				result = handlePushCommand(args, {
					runtimeEnabled,
					setRuntimeEnabled: (v) => {
						runtimeEnabled = v;
					},
					last: (() => {
						const last = notifier.lastResults();
						return last
							? { at: last.at, event: last.event, results: last.results }
							: undefined;
					})(),
					describeResults,
				});
			} catch (error) {
				ctx.ui.notify(
					error instanceof Error ? error.message : String(error),
					"error",
				);
				return;
			}

			if (result.runTest) {
				invalidateConfigCache();
				let config = loadConfig();
				if (!config.exists && config.channels.length === 0) {
					ctx.ui.notify(`未找到配置文件：${config.path}`, "error");
					return;
				}
				try {
					if (result.testFilter) {
						config = filterConfigToChannel(config, result.testFilter);
					}
				} catch (error) {
					ctx.ui.notify(
						error instanceof Error ? error.message : String(error),
						"error",
					);
					return;
				}
				const results = await notifier.sendTest(
					{ ...config, enabled: true },
					{
						event: "test",
						status: "测试",
						reason: result.testFilter
							? `pi-ntfy 测试 (${result.testFilter})`
							: "pi-ntfy 通道测试",
						durationMs: 0,
						...baseInput(ctx, run),
					},
				);
				const ok = results.length > 0 && results.every((r) => r.ok);
				ctx.ui.notify(
					`pi-ntfy 测试：${describeResults(results)}`,
					ok ? "info" : "error",
				);
				return;
			}

			ctx.ui.notify(result.message, result.ok ? "info" : "error");
		},
	});
}
