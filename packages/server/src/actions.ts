import type { WorldAction } from "@penguverse/types";
import type { AgentStore } from "./store";
import type { EventLog } from "./events";
import type { MessageRouter } from "./messages";

function truncate(s: string, max: number): string {
	return s.length <= max ? s : s.slice(0, max - 1) + "\u2026";
}

export { truncate };

export function handleAction(
	agentId: string,
	action: WorldAction,
	store: AgentStore,
	events: EventLog,
	messages: MessageRouter,
	agentSockets: Map<string, WebSocket>,
) {
	switch (action.type) {
		case "move":
			store.heartbeat({
				agent: agentId,
				metadata: { moveTo: action.to },
			});
			events.push(agentId, action);
			break;

		case "speak":
			store.heartbeat({
				agent: agentId,
				state: "speaking",
				task: action.message,
				metadata: { to: action.to ?? null },
			});
			events.push(agentId, action);
			break;

		case "emote":
			store.heartbeat({
				agent: agentId,
				metadata: { emote: action.emote },
			});
			events.push(agentId, action);
			break;

		case "status":
			store.heartbeat({
				agent: agentId,
				state: action.state,
				task: action.task,
				energy: action.energy,
			});
			events.push(agentId, action);
			break;

		case "message":
			routeMessage(agentId, action, messages, agentSockets, events);
			store.heartbeat({
				agent: agentId,
				state: "speaking",
				task: truncate(action.message, 40),
			});
			break;

		default: {
			const _exhaustive: never = action;
			break;
		}
	}
}

function routeMessage(
	fromId: string,
	action: Extract<WorldAction, { type: "message" }>,
	messages: MessageRouter,
	agentSockets: Map<string, WebSocket>,
	events: EventLog,
) {
	const msg = JSON.stringify({
		type: "message",
		from: fromId,
		message: action.message,
		channel: action.channel ?? undefined,
	});

	if (action.channel) {
		const members = messages.getChannelMembers(action.channel);
		for (const memberId of members) {
			if (memberId === fromId) continue;
			const ws = agentSockets.get(memberId);
			if (ws && ws.readyState === WebSocket.OPEN) {
				ws.send(msg);
			} else {
				messages.queueMessage(
					memberId,
					fromId,
					action.message,
					action.channel,
				);
			}
		}
	} else if (action.to) {
		const targets = Array.isArray(action.to) ? action.to : [action.to];
		for (const targetId of targets) {
			const ws = agentSockets.get(targetId);
			if (ws && ws.readyState === WebSocket.OPEN) {
				ws.send(msg);
			} else {
				messages.queueMessage(targetId, fromId, action.message);
			}
		}
	}

	events.push(fromId, {
		type: "message",
		to: action.to ?? undefined,
		channel: action.channel ?? undefined,
	});
}
