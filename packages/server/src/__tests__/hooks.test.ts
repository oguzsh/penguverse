import { describe, test, expect } from "bun:test";
import { HookHandler } from "../hooks";
import { AgentStore } from "../store";
import { EventLog } from "../events";

function setup() {
	const store = new AgentStore();
	const events = new EventLog();
	const hooks = new HookHandler(store, events);
	return { store, events, hooks };
}

describe("HookHandler", () => {
	test("SessionStart creates idle agent", () => {
		const { store, hooks } = setup();
		hooks.handleClaudeCodeHook({
			hook_event_name: "SessionStart",
			session_id: "abc123",
			cwd: "/home/user/project",
			agent: "test-agent",
			name: "Test Agent",
		});

		const agent = store.getAll().find(a => a.agent === "test-agent");
		expect(agent).toBeDefined();
		expect(agent?.state).toBe("idle");
		expect(agent?.name).toBe("Test Agent");
	});

	test("UserPromptSubmit sets thinking state", () => {
		const { store, hooks } = setup();
		hooks.handleClaudeCodeHook({
			hook_event_name: "UserPromptSubmit",
			agent: "test-agent",
			name: "Test",
			prompt: "Fix the bug",
		});

		const agent = store.getAll().find(a => a.agent === "test-agent");
		expect(agent?.state).toBe("thinking");
		expect(agent?.task).toBe("Fix the bug");
	});

	test("PreToolUse sets working state", () => {
		const { store, hooks } = setup();
		hooks.handleClaudeCodeHook({
			hook_event_name: "PreToolUse",
			agent: "test-agent",
			name: "Test",
			tool_name: "Read",
		});

		const agent = store.getAll().find(a => a.agent === "test-agent");
		expect(agent?.state).toBe("working");
		expect(agent?.task).toBe("Read");
	});

	test("PostToolUse sets done task", () => {
		const { store, hooks } = setup();
		hooks.handleClaudeCodeHook({
			hook_event_name: "PostToolUse",
			agent: "test-agent",
			name: "Test",
			tool_name: "Write",
		});

		const agent = store.getAll().find(a => a.agent === "test-agent");
		expect(agent?.state).toBe("working");
		expect(agent?.task).toBe("Done: Write");
	});

	test("PostToolUseFailure sets error state", () => {
		const { store, hooks } = setup();
		hooks.handleClaudeCodeHook({
			hook_event_name: "PostToolUseFailure",
			agent: "test-agent",
			name: "Test",
			tool_name: "Bash",
		});

		const agent = store.getAll().find(a => a.agent === "test-agent");
		expect(agent?.state).toBe("error");
		expect(agent?.task).toBe("Failed: Bash");
	});

	test("Stop sets idle state", () => {
		const { store, hooks } = setup();
		hooks.handleClaudeCodeHook({
			hook_event_name: "PreToolUse",
			agent: "test-agent",
			name: "Test",
		});
		hooks.handleClaudeCodeHook({
			hook_event_name: "Stop",
			agent: "test-agent",
			name: "Test",
		});

		const agent = store.getAll().find(a => a.agent === "test-agent");
		expect(agent?.state).toBe("idle");
		expect(agent?.task).toBeNull();
	});

	test("SessionEnd sets offline state", () => {
		const { store, hooks } = setup();
		hooks.handleClaudeCodeHook({
			hook_event_name: "SessionStart",
			agent: "test-agent",
			name: "Test",
		});
		hooks.handleClaudeCodeHook({
			hook_event_name: "SessionEnd",
			agent: "test-agent",
			name: "Test",
		});

		const agent = store.getAll().find(a => a.agent === "test-agent");
		expect(agent?.state).toBe("offline");
	});

	test("SubagentStart creates subagent and updates parent", () => {
		const { store, hooks } = setup();
		hooks.handleClaudeCodeHook({
			hook_event_name: "SessionStart",
			agent: "parent",
			name: "Parent",
		});
		hooks.handleClaudeCodeHook({
			hook_event_name: "SubagentStart",
			agent: "parent",
			name: "Parent",
			subagent_id: "sub123456",
			subagent_task: "Review code",
			cwd: "/home/user/project",
		});

		const parent = store.getAll().find(a => a.agent === "parent");
		expect(parent?.state).toBe("working");
		expect(parent?.task).toBe("Running subagent");

		const sub = store.getAll().find(a => a.agent === "parent-sub-sub123");
		expect(sub).toBeDefined();
		expect(sub?.state).toBe("working");
	});

	test("SubagentStop sets subagent offline", () => {
		const { store, hooks } = setup();
		hooks.handleClaudeCodeHook({
			hook_event_name: "SubagentStart",
			agent: "parent",
			name: "Parent",
			subagent_id: "sub123456",
			subagent_task: "Review",
			cwd: "/tmp",
		});
		hooks.handleClaudeCodeHook({
			hook_event_name: "SubagentStop",
			agent: "parent",
			name: "Parent",
			subagent_id: "sub123456",
		});

		const sub = store.getAll().find(a => a.agent === "parent-sub-sub123");
		expect(sub?.state).toBe("offline");
	});

	test("auto-generates agent ID from cwd and session", () => {
		const { store, hooks } = setup();
		hooks.handleClaudeCodeHook({
			hook_event_name: "SessionStart",
			session_id: "session123",
			cwd: "/home/user/my-project",
		});

		const agent = store.getAll().find(a => a.agent === "claude-my-project-sessio");
		expect(agent).toBeDefined();
	});

	test("ignores hooks without event name", () => {
		const { store, hooks } = setup();
		hooks.handleClaudeCodeHook({});
		expect(store.getAll().length).toBe(0);
	});

	test("stopAll clears keepalives", () => {
		const { hooks } = setup();
		hooks.handleClaudeCodeHook({
			hook_event_name: "SessionStart",
			agent: "test",
			name: "Test",
		});
		// Should not throw
		hooks.stopAll();
	});

	test("Notification pushes event", () => {
		const { events, hooks } = setup();
		hooks.handleClaudeCodeHook({
			hook_event_name: "Notification",
			agent: "test",
			name: "Test",
			message: "Build complete",
		});

		const recent = events.recent(10);
		expect(recent.length).toBe(1);
		expect(recent[0].action.type).toBe("notification");
	});
});
