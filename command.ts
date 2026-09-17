/** pi-ntfy command parser and config mutations. */

import {
	CHANNEL_SETTABLE_FIELDS,
	formatChannelLabel,
	invalidateConfigCache,
	loadConfig,
	loadRawConfig,
	maskSecret,
	saveRawConfig,
	type RawConfigFile,
} from "./config.ts";
import type { ChannelResult, NotifyConfig } from "./types.ts";

export interface CommandResult {
	ok: boolean;
	message: string;
	runTest?: boolean;
	testFilter?: string;
}

function usage(): string {
	return [
		"用法:",
		"  /ntfy                         状态",
		"  /ntfy list                    查看 ntfy 配置",
		"  /ntfy get                     查看配置（密钥脱敏）",
		"  /ntfy enable|disable         开关 ntfy",
		"  /ntfy set key=value ...       设置 topic/token/server 等",
		"  /ntfy test                    发送测试通知",
		"  /ntfy on | off                当前会话总开关",
		"  /ntfy events [k=on|off…]      设置事件开关",
		"  /ntfy help                   帮助",
		"",
		"示例:",
		"  /ntfy set topic=my-topic token=$NTFY_TOKEN enabled=true",
		"  /ntfy test",
	].join("\n");
}

export function tokenize(args: string): string[] {
	const out: string[] = [];
	const re = /"([^"\\]|\\.)*"|'([^'\\]|\\.)*'|\S+/g;
	for (const match of args.matchAll(re)) {
		let token = match[0];
		if (
			(token.startsWith('"') && token.endsWith('"')) ||
			(token.startsWith("'") && token.endsWith("'"))
		) {
			token = token.slice(1, -1).replace(/\\([\\'"])/g, "$1");
		}
		out.push(token);
	}
	return out;
}

function parseBool(raw: string): boolean {
	const value = raw.trim().toLowerCase();
	if (["1", "true", "on", "yes", "开", "启用"].includes(value)) return true;
	if (["0", "false", "off", "no", "关", "禁用"].includes(value)) return false;
	throw new Error(`无法解析布尔值: ${raw}（用 true/false 或 on/off）`);
}

function coerceField(key: string, raw: string): string | number | boolean {
	if (key === "enabled") return parseBool(raw);
	if (key === "timeoutMs" || key === "priority")
		return /^\d+$/.test(raw) ? Number(raw) : raw;
	return raw;
}

function channelData(data: RawConfigFile): Array<Record<string, unknown>> {
	if (!Array.isArray(data.channels)) data.channels = [];
	return data.channels;
}

function ntfyIndex(data: RawConfigFile): number {
	const channels = channelData(data);
	const index = channels.findIndex(
		(channel) => String(channel.type ?? "ntfy") === "ntfy",
	);
	if (index >= 0) return index;
	channels.push({ type: "ntfy", name: "ntfy", enabled: true });
	return channels.length - 1;
}

function applyPairs(
	channel: Record<string, unknown>,
	pairs: string[],
): string[] {
	const allowed = new Set(CHANNEL_SETTABLE_FIELDS.ntfy);
	const changed: string[] = [];
	for (const pair of pairs) {
		const separator = pair.indexOf("=");
		if (separator <= 0) throw new Error(`参数应为 key=value，收到: ${pair}`);
		const key = pair.slice(0, separator).trim();
		if (!allowed.has(key))
			throw new Error(
				`ntfy 不支持字段 "${key}"。可设: ${[...allowed].join(", ")}`,
			);
		channel[key] = coerceField(key, pair.slice(separator + 1));
		changed.push(key);
	}
	if (changed.length === 0) throw new Error("请至少提供一个 key=value");
	return changed;
}

function describeConfig(
	config: NotifyConfig,
	runtimeEnabled: boolean,
	last?: { at: number; event: string; results: ChannelResult[] },
	describeResults?: (results: ChannelResult[]) => string,
): string {
	const channel = config.channels[0];
	const lines = [
		`pi-ntfy: ${runtimeEnabled && config.enabled ? "已启用" : "已停用"}${config.exists ? "" : "（无配置文件）"}`,
		`配置: ${config.path}`,
		`渠道: ${channel ? formatChannelLabel(channel, 0) : "ntfy（未配置）"}`,
		`事件: ${(["idle", "interrupted", "needInput", "exit"] as const).map((key) => `${key}=${config.events[key] ? "on" : "off"}`).join(" ")}`,
		`模式: ${config.modes.join(",")}`,
	];
	if (last && describeResults)
		lines.push(
			`上次推送: ${new Date(last.at).toTimeString().slice(0, 8)} ${last.event} → ${describeResults(last.results)}`,
		);
	else lines.push("上次推送: (无)");
	if (config.warnings.length > 0)
		lines.push(`警告: ${config.warnings.join("; ")}`);
	return lines.join("\n");
}

export function handlePushCommand(
	args: string,
	options: {
		runtimeEnabled: boolean;
		setRuntimeEnabled: (enabled: boolean) => void;
		last?: { at: number; event: string; results: ChannelResult[] };
		describeResults: (results: ChannelResult[]) => string;
	},
): CommandResult {
	const tokens = tokenize(args.trim());
	const action = (tokens[0] ?? "").toLowerCase();
	if (!action || action === "status") {
		invalidateConfigCache();
		const config = loadConfig();
		return {
			ok: true,
			message: describeConfig(
				config,
				options.runtimeEnabled,
				options.last,
				options.describeResults,
			),
		};
	}
	if (["help", "-h", "--help"].includes(action))
		return { ok: true, message: usage() };
	if (action === "on" || action === "off") {
		options.setRuntimeEnabled(action === "on");
		return {
			ok: true,
			message: `pi-ntfy 已${action === "on" ? "开启" : "关闭"}（仅当前会话）`,
		};
	}
	if (action === "test") return { ok: true, message: "", runTest: true };
	if (action === "list" || action === "get") {
		const raw = loadRawConfig();
		const channels = channelData(raw.data);
		if (channels.length === 0) return { ok: true, message: "没有配置 ntfy" };
		const channel = channels[0];
		if (action === "list")
			return {
				ok: true,
				message: `${formatChannelLabel(channel, 0)} topic=${maskSecret("topic", channel.topic)}`,
			};
		return {
			ok: true,
			message: [
				formatChannelLabel(channel, 0),
				...CHANNEL_SETTABLE_FIELDS.ntfy
					.filter((key) => key in channel)
					.map((key) => `${key}=${maskSecret(key, channel[key])}`),
			].join("\n"),
		};
	}
	if (action === "enable" || action === "disable") {
		const raw = loadRawConfig();
		const index = ntfyIndex(raw.data);
		channelData(raw.data)[index].enabled = action === "enable";
		const path = saveRawConfig(raw.data);
		return {
			ok: true,
			message: `ntfy 已${action === "enable" ? "开启" : "关闭"}\n已写入 ${path}`,
		};
	}
	if (action === "set") {
		const raw = loadRawConfig();
		const index = ntfyIndex(raw.data);
		const changed = applyPairs(channelData(raw.data)[index], tokens.slice(1));
		const path = saveRawConfig(raw.data);
		return {
			ok: true,
			message: `已更新 ntfy: ${changed.map((key) => `${key}=${maskSecret(key, channelData(raw.data)[index][key])}`).join(" ")}\n已写入 ${path}`,
		};
	}
	if (action === "events") {
		const raw = loadRawConfig();
		const events = (raw.data.events ??= {
			idle: true,
			interrupted: true,
			needInput: true,
			exit: false,
		});
		for (const pair of tokens.slice(1)) {
			const separator = pair.indexOf("=");
			if (separator <= 0) throw new Error(`参数应为 event=on|off，收到: ${pair}`);
			const key = pair.slice(0, separator);
			if (!(key in events)) throw new Error(`未知事件 "${key}"`);
			events[key] = parseBool(pair.slice(separator + 1));
		}
		if (tokens.length > 1) saveRawConfig(raw.data);
		return {
			ok: true,
			message: Object.entries(events)
				.map(([key, value]) => `${key}=${value ? "on" : "off"}`)
				.join(" "),
		};
	}
	return { ok: false, message: `未知子命令 "${action}"\n${usage()}` };
}

export function filterConfigToChannel(
	config: NotifyConfig,
	_selector: string,
): NotifyConfig {
	return { ...config, channels: config.channels.slice(0, 1) };
}
