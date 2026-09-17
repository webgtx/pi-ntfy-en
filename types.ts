/** pi-ntfy shared types. */

export type NotifyEvent =
	| "idle"
	| "interrupted"
	| "needInput"
	| "exit"
	| "test";

export interface EventToggles {
	idle?: boolean;
	interrupted?: boolean;
	needInput?: boolean;
	exit?: boolean;
}

export interface NtfyChannel {
	type: "ntfy";
	name?: string;
	enabled?: boolean;
	events?: EventToggles;
	timeoutMs?: number;
	topic: string;
	server?: string;
	token?: string;
	priority?: string | number;
	tags?: string | string[];
	clickUrl?: string;
	icon?: string;
	email?: string;
}

export type ChannelConfig = NtfyChannel;

export interface NotifyConfig {
	enabled: boolean;
	modes: string[];
	timeoutMs: number;
	shutdownTimeoutMs: number;
	dedupeMs: number;
	minDurationSec: number;
	maxTextChars: number;
	titleTemplate: string;
	template: string;
	events: Required<EventToggles>;
	needInputTools: string[];
	debug: boolean;
	channels: NtfyChannel[];
	warnings: string[];
	path: string;
	exists: boolean;
}

export interface NotifyPayload {
	event: NotifyEvent;
	status: string;
	reason: string;
	title: string;
	text: string;
	vars: Record<string, string>;
}

export interface ChannelResult {
	channel: string;
	ok: boolean;
	status: number;
	error?: string;
	ms: number;
}
