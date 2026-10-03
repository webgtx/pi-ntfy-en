/** pi-ntfy NTFY channel.
 *
 * Fetch/HTTP headers are ByteString-only. Keep headers ASCII-safe and leave the
 * full UTF-8 project/session/task information in the message body. Encoded
 * metadata headers are added for consumers that need machine-readable values.
 */

import { httpRequest, localFailure, type HttpResult } from "../http.ts";
import type { NotifyPayload, NtfyChannel } from "../types.ts";

const DEFAULT_SERVER = "https://n.ipao.vip";

function eventTagFor(event: NotifyPayload["event"]): string {
	switch (event) {
		case "idle":
			return "white_check_mark";
		case "interrupted":
			return "warning";
		case "needInput":
			return "question";
		case "exit":
			return "door";
		default:
			return "test_tube";
	}
}

function addErrorDetail(result: HttpResult): HttpResult {
	if (result.ok) return result;
	let detail = result.error ?? `HTTP ${result.status}`;
	if (result.body) {
		try {
			const data = JSON.parse(result.body) as { error?: string; message?: string };
			detail = data.error || data.message || detail;
		} catch {
			detail = result.body.slice(0, 200) || detail;
		}
	}
	return { ...result, error: `ntfy ${detail}` };
}

export async function sendNtfy(
	channel: NtfyChannel,
	payload: NotifyPayload,
	timeoutMs: number,
): Promise<HttpResult> {
	const topic = (channel.topic ?? "").trim();
	if (!topic) return localFailure("ntfy: topic is empty");

	const server = (channel.server ?? DEFAULT_SERVER).trim().replace(/\/+$/, "");
	const headers: Record<string, string> = {
		"Content-Type": "text/plain; charset=utf-8",
	};
	const token = (channel.token ?? "").trim();
	if (token) {
		headers.Authorization = token.toLowerCase().startsWith("bearer ")
			? token
			: `Bearer ${token}`;
	}

	// Publish as JSON (POST to the server root): title/message travel in a UTF-8
	// body, so Chinese titles work — plain-text publishing would force headers to
	// be Latin-1 (fetch ByteString) and we had to mangle non-ASCII titles.
	const configuredTags =
		channel.tags == null
			? []
			: Array.isArray(channel.tags)
				? channel.tags
				: [String(channel.tags)];
	const body = JSON.stringify({
		topic,
		title: payload.title,
		message: payload.text,
		tags: [...configuredTags, eventTagFor(payload.event)],
		...(channel.priority != null && channel.priority !== "" && { priority: channel.priority }),
		...(channel.clickUrl && { click: channel.clickUrl }),
		...(channel.icon && { icon: channel.icon }),
		...(channel.email && { email: channel.email }),
	});

	const result = await httpRequest(
		server,
		{ method: "POST", headers, body },
		timeoutMs,
	);
	return addErrorDetail(result);
}
