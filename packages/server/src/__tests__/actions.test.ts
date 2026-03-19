import { describe, test, expect, mock } from "bun:test";
import { handleAction, truncate } from "../actions";
import { AgentStore } from "../store";
import { EventLog } from "../events";
import { MessageRouter } from "../messages";

function setup() {
	const store = new AgentStore();
	store.heartbeat({ agent: "actor", name: "Actor", state: "idle" });
	const events = new EventLog();
	const messages = new MessageRouter();
	const agentSockets = new Map<string, WebSocket>();
	return { store, events, messages, agentSockets };
}

describe("handleAction", () => {
	test("move action updates metadata", () => {
		const { store, events, messages, agentSockets } = setup();
		handleAction("actor", { type: "move", to: "campfire" }, store, events, messages, agentSockets);

		const agent = store.getAll().find(a => a.agent === "actor");
		expect(agent?.metadata.moveTo).toBe("campfire");
	});

	test("speak action sets speaking state", () => {
		const { store, events, messages, agentSockets } = setup();
		handleAction("actor", { type: "speak", message: "Hello!" }, store, events, messages, agentSockets);

		const agent = store.getAll().find(a => a.agent === "actor");
		expect(agent?.state).toBe("speaking");
		expect(agent?.task).toBe("Hello!");
	});

	test("emote action updates metadata", () => {
		const { store, events, messages, agentSockets } = setup();
		handleAction("actor", { type: "emote", emote: "wave" }, store, events, messages, agentSockets);

		const agent = store.getAll().find(a => a.agent === "actor");
		expect(agent?.metadata.emote).toBe("wave");
	});

	test("status action updates agent state", () => {
		const { store, events, messages, agentSockets } = setup();
		handleAction("actor", { type: "status", state: "working", task: "coding", energy: 0.5 }, store, events, messages, agentSockets);

		const agent = store.getAll().find(a => a.agent === "actor");
		expect(agent?.state).toBe("working");
		expect(agent?.task).toBe("coding");
		expect(agent?.energy).toBe(0.5);
	});

	test("message action routes and sets speaking", () => {
		const { store, events, messages, agentSockets } = setup();
		handleAction("actor", { type: "message", message: "Hi team", to: "other" }, store, events, messages, agentSockets);

		const agent = store.getAll().find(a => a.agent === "actor");
		expect(agent?.state).toBe("speaking");
	});

	test("all actions push events", () => {
		const { store, events, messages, agentSockets } = setup();
		handleAction("actor", { type: "move", to: "x" }, store, events, messages, agentSockets);
		handleAction("actor", { type: "speak", message: "hi" }, store, events, messages, agentSockets);
		handleAction("actor", { type: "emote", emote: "dance" }, store, events, messages, agentSockets);
		handleAction("actor", { type: "status" }, store, events, messages, agentSockets);
		handleAction("actor", { type: "message", message: "msg" }, store, events, messages, agentSockets);

		expect(events.recent(10).length).toBe(5);
	});
});

describe("truncate", () => {
	test("returns string unchanged if within limit", () => {
		expect(truncate("hello", 10)).toBe("hello");
	});

	test("truncates long strings with ellipsis", () => {
		const result = truncate("this is a very long string", 10);
		expect(result.length).toBe(10);
		expect(result.endsWith("\u2026")).toBe(true);
	});

	test("handles exact length", () => {
		expect(truncate("exact", 5)).toBe("exact");
	});
});
