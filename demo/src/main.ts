import { Penguverse } from "@penguverse/core";

const container = document.getElementById("world")!;

const sceneRes = await fetch("/worlds/penguin-village/scenes/main.json");
const sceneData = await sceneRes.json();

const wsProtocol = window.location.protocol === "https:" ? "wss:" : "ws:";
const wsUrl = `${wsProtocol}//${window.location.host}/ws`;

const penguverse = new Penguverse({
	container,
	world: "penguin-village",
	scene: "main",
	worldBasePath: "/worlds/penguin-village",
	sceneConfig: { ...sceneData },
	signal: {
		type: "websocket",
		url: wsUrl,
	},
	penguins: [],
	scale: 1,
	renderScale: 3,
	width: sceneData.columns * sceneData.tileWidth,
	height: sceneData.rows * sceneData.tileHeight,
	autoSpawn: true,
});

if (sceneData.typedLocations) {
	penguverse.setTypedLocations(sceneData.typedLocations);
}

penguverse.on("penguin:click", data => {
	console.log("Penguin clicked:", data);
});

await penguverse.start();
