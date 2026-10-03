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
		"Usage:",
		"  /ntfy                         status",
		"  /ntfy list                    show ntfy channel",
		"  /ntfy get                     show config (secrets masked)",
		"  /ntfy enable|disable          toggle ntfy",
		"  /ntfy set key=value ...       set topic/token/server etc.",
		"  /ntfy test                    send a test notification",
		"  /ntfy on | off                toggle for this session",
		"  /ntfy events [k=on|off…]      set event toggles",
		"  /ntfy help                    help",
		"",
		"Examples:",
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
	throw new Error(`cannot parse boolean: ${raw} (use true/false or on/off)`);
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
		if (separator <= 0) throw new Error(`expected key=value, got: ${pair}`);
		const key = pair.slice(0, separator).trim();
		if (!allowed.has(key))
			throw new Error(
				`ntfy does not support field "${key}". Settable: ${[...allowed].join(", ")}`,
			);
		channel[key] = coerceField(key, pair.slice(separator + 1));
		changed.push(key);
	}
	if (changed.length === 0) throw new Error("provide at least one key=value");
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
		`pi-ntfy: ${runtimeEnabled && config.enabled ? "enabled" : "disabled"}${config.exists ? "" : " (no config file)"}`,
		`Config: ${config.path}`,
		`Channel: ${channel ? formatChannelLabel(channel, 0) : "ntfy (not configured)"}`,
		`Events: ${(["idle", "interrupted", "needInput", "exit"] as const).map((key) => `${key}=${config.events[key] ? "on" : "off"}`).join(" ")}`,
		`Modes: ${config.modes.join(",")}`,
	];
	if (last && describeResults)
		lines.push(
			`Last push: ${new Date(last.at).toTimeString().slice(0, 8)} ${last.event} -> ${describeResults(last.results)}`,
		);
	else lines.push("Last push: (none)");
	if (config.warnings.length > 0)
		lines.push(`Warnings: ${config.warnings.join("; ")}`);
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
			message: `pi-ntfy ${action === "on" ? "enabled" : "disabled"} for this session`,
		};
	}
	if (action === "test") return { ok: true, message: "", runTest: true };
	if (action === "list" || action === "get") {
		const raw = loadRawConfig();
		const channels = channelData(raw.data);
		if (channels.length === 0) return { ok: true, message: "no ntfy channel configured" };
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
			message: `ntfy ${action === "enable" ? "enabled" : "disabled"}\nwritten to ${path}`,
		};
	}
	if (action === "set") {
		const raw = loadRawConfig();
		const index = ntfyIndex(raw.data);
		const changed = applyPairs(channelData(raw.data)[index], tokens.slice(1));
		const path = saveRawConfig(raw.data);
		return {
			ok: true,
			message: `updated ntfy: ${changed.map((key) => `${key}=${maskSecret(key, channelData(raw.data)[index][key])}`).join(" ")}\nwritten to ${path}`,
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
			if (separator <= 0) throw new Error(`expected event=on|off, got: ${pair}`);
			const key = pair.slice(0, separator);
			if (!(key in events)) throw new Error(`unknown event "${key}"`);
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
	return { ok: false, message: `unknown subcommand "${action}"\n${usage()}` };
}

export function filterConfigToChannel(
	config: NotifyConfig,
	_selector: string,
): NotifyConfig {
	return { ...config, channels: config.channels.slice(0, 1) };
}
