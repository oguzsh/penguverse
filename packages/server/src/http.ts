import type { AgentStore } from "./store";
import { getFrontendHtml } from "./frontend";
import type { HookHandler } from "./hooks";

const CORS_HEADERS = {
	"Access-Control-Allow-Origin": "*",
	"Access-Control-Allow-Methods": "GET, POST, OPTIONS",
	"Access-Control-Allow-Headers": "Content-Type",
};

export async function handleHttp(
	req: Request,
	url: URL,
	store: AgentStore,
	port: number,
	hooks: HookHandler,
): Promise<Response> {
	if (req.method === "OPTIONS") {
		return new Response(null, { status: 204, headers: CORS_HEADERS });
	}

	if (req.method === "GET" && url.pathname === "/") {
		return new Response(getFrontendHtml(port), {
			headers: { ...CORS_HEADERS, "Content-Type": "text/html" },
		});
	}

	if (req.method === "GET" && url.pathname === "/api/info") {
		const agents = store.getPublicList();
		const online = agents.filter(a => a.state !== "offline").length;
		return Response.json(
			{
				penguverse: true,
				version: "0.1.0",
				agents: { online, total: agents.length },
			},
			{ headers: CORS_HEADERS },
		);
	}

	if (
		req.method === "POST" &&
		url.pathname.startsWith("/api/hooks/claude-code")
	) {
		try {
			const data = (await req.json()) as Record<string, unknown>;
			const qEvent = url.searchParams.get("event");
			const qAgent = url.searchParams.get("agent");
			const qName = url.searchParams.get("name");
			if (qEvent) data.hook_event_name = qEvent;
			if (qAgent) data.agent = qAgent;
			if (qName) data.name = qName;
			hooks.handleClaudeCodeHook(data);
			return new Response(null, { status: 200, headers: CORS_HEADERS });
		} catch {
			return new Response(null, { status: 200, headers: CORS_HEADERS });
		}
	}

	return Response.json({ error: "Not found" }, { status: 404, headers: CORS_HEADERS });
}
