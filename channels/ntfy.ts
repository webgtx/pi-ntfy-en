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

function isAscii(value: string): boolean {
	return [...value].every((char) => char.charCodeAt(0) <= 255);
}

function base64(value: string): string {
	return Buffer.from(value, "utf8").toString("base64url");
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
	if (!topic) return localFailure("ntfy: topic 为空");

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

	const project = payload.vars.project ?? "";
	const session = payload.vars.session ?? "";
	const task = payload.vars.task ?? "";
	const asciiSession = isAscii(session) ? session : "";
	const asciiTitle = isAscii(payload.title)
		? payload.title
		: `[${project || "pi"}] pi ${payload.event}${asciiSession ? ` · ${asciiSession}` : ""}`;

	// NTFY headers must be ASCII-safe under Node's fetch implementation.
	headers.Title = asciiTitle;
	headers["X-Event"] = payload.event;
	if (isAscii(project)) headers["X-Project"] = project;
	if (asciiSession) headers["X-Session"] = asciiSession;
	if (isAscii(task) && task) headers["X-Task"] = task;
	if (project) headers["X-Project-B64"] = base64(project);
	if (session) headers["X-Session-B64"] = base64(session);
	if (task) headers["X-Task-B64"] = base64(task);

	if (channel.priority != null && channel.priority !== "") {
		headers.Priority = String(channel.priority);
	}
	const configuredTags =
		channel.tags == null
			? ""
			: Array.isArray(channel.tags)
				? channel.tags.join(",")
				: String(channel.tags);
	const tags = [configuredTags, eventTagFor(payload.event)]
		.filter(Boolean)
		.join(",");
	if (tags) headers.Tags = tags;
	if (channel.clickUrl) headers.Click = channel.clickUrl;
	if (channel.icon) headers.Icon = channel.icon;
	if (channel.email) headers.Email = channel.email;

	const result = await httpRequest(
		`${server}/${encodeURIComponent(topic)}`,
		{ method: "POST", headers, body: payload.text },
		timeoutMs,
	);
	return addErrorDetail(result);
}
