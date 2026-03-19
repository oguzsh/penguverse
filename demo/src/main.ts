import { Penguverse } from "@penguverse/core";
import type { AgentStatus, AgentState } from "@penguverse/core";

const container = document.getElementById("world")!;

// Load scene data
const sceneRes = await fetch("/worlds/penguin-village/scenes/main.json");
const sceneData = await sceneRes.json();

const STATES: AgentState[] = [
	"idle",
	"working",
	"thinking",
	"sleeping",
	"speaking",
	"idle",
];

let mockAgents: AgentStatus[] = [
	{ id: "emperor", name: "Emperor", state: "idle", task: null, energy: 1 },
	{
		id: "pebble",
		name: "Pebble",
		state: "working",
		task: "Writing code",
		energy: 0.8,
	},
];

let stateIndex = 0;

function getMockData(): AgentStatus[] {
	// Cycle states periodically
	stateIndex++;
	if (stateIndex % 3 === 0) {
		for (const agent of mockAgents) {
			const idx = Math.floor(Math.random() * STATES.length);
			agent.state = STATES[idx];
			agent.task =
				agent.state === "working"
					? "Writing code"
					: agent.state === "thinking"
						? "Pondering..."
						: agent.state === "speaking"
							? "Hey there!"
							: null;
		}
	}
	return [...mockAgents];
}

const penguverse = new Penguverse({
	container,
	world: "penguin-village",
	scene: "main",
	worldBasePath: "/worlds/penguin-village",
	sceneConfig: {
		...sceneData,
		// Ensure tiles paths are relative to world base
	},
	signal: {
		type: "mock",
		mockData: getMockData,
		interval: 5000,
	},
	penguins: [],
	scale: 1,
	renderScale: 3,
	width: sceneData.columns * sceneData.tileWidth,
	height: sceneData.rows * sceneData.tileHeight,
	autoSpawn: true,
});

// Load typed locations from scene data
if (sceneData.typedLocations) {
	penguverse.setTypedLocations(sceneData.typedLocations);
}

penguverse.on("penguin:click", data => {
	console.log("Penguin clicked:", data);
});

await penguverse.start();

// Controls
let nextId = 1;
document.getElementById("addAgent")?.addEventListener("click", () => {
	const id = `penguin_${nextId++}`;
	console.log("Penguin added");
	mockAgents.push({
		id,
		name: `Penguin ${nextId - 1}`,
		state: "idle",
		task: null,
		energy: 1,
	});
});

document.getElementById("removeAgent")?.addEventListener("click", () => {
	const removed = mockAgents.pop();
	if (removed) {
		penguverse.removePenguin(removed.id);
	}
});
