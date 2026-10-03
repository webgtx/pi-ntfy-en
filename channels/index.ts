/** pi-ntfy channel registry. */

import type { HttpResult } from "../http.ts";
import { localFailure } from "../http.ts";
import type { NotifyPayload, NtfyChannel } from "../types.ts";
import { sendNtfy } from "./ntfy.ts";

export function channelName(channel: NtfyChannel, index: number): string {
	return channel.name?.trim() || `ntfy#${index + 1}`;
}

export function sendToChannel(
	channel: NtfyChannel,
	payload: NotifyPayload,
	timeoutMs: number,
): Promise<HttpResult> {
	if (channel.type !== "ntfy") {
		return Promise.resolve(localFailure(`unknown channel type: ${channel.type}`));
	}
	return sendNtfy(channel, payload, timeoutMs);
}
