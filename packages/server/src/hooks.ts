import type { AgentStore } from "./store";
import type { EventLog } from "./events";
import { truncate } from "./actions";

export class HookHandler {
	private keepalives: Map<string, ReturnType<typeof setInterval>> = new Map();
	private subagentKeepAlives: Map<string, Set<string>> = new Map();

	constructor(
		private store: AgentStore,
		private events: EventLog,
	) {}

	stopAll() {
		for (const interval of this.keepalives.values()) {
			clearInterval(interval);
		}
		this.keepalives.clear();
	}

	handleClaudeCodeHook(data: Record<string, unknown>) {
		const event = data.hook_event_name as string | undefined;
		if (!event) return;

		const sessionId = data.session_id as string | undefined;
		const cwd = data.cwd as string | undefined;
		const folder = (cwd ?? "").split("/").pop() || "code";
		const shortSession = sessionId ? sessionId.slice(0, 6) : "";

		const agentId =
			(data as any).agent ??
			(shortSession ? `claude-${folder}-${shortSession}` : `claude-${folder}`);
		const agentName =
			(data as any).name ??
			(shortSession
				? `Claude (${folder} #${shortSession})`
				: `Claude (${folder})`);

		const toolName = data.tool_name as string | undefined;
		const prompt = data.prompt as string | undefined;
		const subagentId = data.subagent_id as string | undefined;
		const subagentTask = data.subagent_task as string | undefined;

		switch (event) {
			case "SessionStart":
				this.store.heartbeat({ agent: agentId, name: agentName, state: "idle" });
				this.events.push(agentId, { type: "status", state: "idle" });
				this.startKeepalive(agentId, agentName);
				break;

			case "UserPromptSubmit":
				this.store.heartbeat({
					agent: agentId, name: agentName, state: "thinking",
					task: prompt ? truncate(prompt, 60) : "Processing request",
				});
				this.events.push(agentId, { type: "status", state: "thinking" });
				this.startKeepalive(agentId, agentName);
				break;

			case "PreToolUse":
				this.store.heartbeat({
					agent: agentId, name: agentName, state: "working",
					task: toolName ?? "Using tool",
				});
				break;

			case "PostToolUse":
				this.store.heartbeat({
					agent: agentId, name: agentName, state: "working",
					task: toolName ? `Done: ${toolName}` : "Tool complete",
				});
				break;

			case "PostToolUseFailure":
				this.store.heartbeat({
					agent: agentId, name: agentName, state: "error",
					task: toolName ? `Failed: ${toolName}` : "Tool failed",
				});
				this.events.push(agentId, { type: "status", state: "error" });
				break;

			case "Stop":
				this.store.heartbeat({ agent: agentId, name: agentName, state: "idle", task: null });
				this.events.push(agentId, { type: "status", state: "idle" });
				break;

			case "SubagentStart": {
				const subId = subagentId
					? `${agentId}-sub-${subagentId.slice(0, 6)}`
					: `${agentId}-sub-${Math.random().toString(36).slice(2, 8)}`;
				const subName = subagentTask
					? `Claude (${truncate(subagentTask, 20)})`
					: `Claude (sub of ${folder})`;
				this.store.heartbeat({ agent: subId, name: subName, state: "working", task: subagentTask ?? "Running" });
				this.startKeepalive(subId, subName);
				if (!this.subagentKeepAlives.has(agentId)) this.subagentKeepAlives.set(agentId, new Set());
				this.subagentKeepAlives.get(agentId)!.add(subId);
				this.store.heartbeat({ agent: agentId, name: agentName, state: "working", task: "Running subagent" });
				break;
			}

			case "SubagentStop": {
				const subs = this.subagentKeepAlives.get(agentId);
				if (subs) {
					let matchedSubId: string | undefined;
					if (subagentId) {
						const prefix = `${agentId}-sub-${subagentId.slice(0, 6)}`;
						for (const id of subs) {
							if (id === prefix) { matchedSubId = id; break; }
						}
					}
					if (!matchedSubId) matchedSubId = [...subs].pop();
					if (matchedSubId) {
						this.stopKeepalive(matchedSubId);
						this.store.heartbeat({ agent: matchedSubId, name: matchedSubId, state: "offline", task: null });
						subs.delete(matchedSubId);
					}
				}
				this.store.heartbeat({ agent: agentId, name: agentName, state: "working", task: "Subagent complete" });
				break;
			}

			case "SessionEnd": {
				this.stopKeepalive(agentId);
				this.store.heartbeat({ agent: agentId, name: agentName, state: "offline", task: null });
				this.events.push(agentId, { type: "status", state: "offline" });
				const subs = this.subagentKeepAlives.get(agentId);
				if (subs) {
					for (const subId of subs) {
						this.stopKeepalive(subId);
						this.store.heartbeat({ agent: subId, name: subId, state: "offline", task: null });
					}
					this.subagentKeepAlives.delete(agentId);
				}
				break;
			}

			case "Notification": {
				this.events.push(agentId, {
					type: "notification",
					message: data.message as string,
				});
				break;
			}
		}
	}

	private startKeepalive(agentId: string, agentName: string) {
		this.stopKeepalive(agentId);
		const interval = setInterval(() => {
			this.store.heartbeat({ agent: agentId, name: agentName });
		}, 15000);
		this.keepalives.set(agentId, interval);
	}

	private stopKeepalive(agentId: string) {
		const existing = this.keepalives.get(agentId);
		if (existing) {
			clearInterval(existing);
			this.keepalives.delete(agentId);
		}
	}
}
