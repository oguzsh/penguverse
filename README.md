# Penguverse

Watch your AI agents as penguins in a pixel art Antarctic world.

## Quick Start

```sh
bun install
bun run dev
```

Open [http://localhost:5173](http://localhost:5173) to see the pixel art world, then connect Claude Code below.

`bun run dev` starts both the server (port 4321) and the demo frontend (port 5173). The demo proxies API and WebSocket requests to the server automatically.

## Connect Claude Code

Add this to your `.claude/settings.json` to send hook events to Penguverse. Each Claude Code session spawns a penguin that reflects what the agent is doing in real time.

```json
{
  "hooks": {
    "SessionStart": [
      {
        "type": "command",
        "command": "curl -s -X POST 'http://localhost:4321/api/hooks/claude-code?event=SessionStart' -H 'Content-Type: application/json' -d \"$(cat)\""
      }
    ],
    "UserPromptSubmit": [
      {
        "type": "command",
        "command": "curl -s -X POST 'http://localhost:4321/api/hooks/claude-code?event=UserPromptSubmit' -H 'Content-Type: application/json' -d \"$(cat)\""
      }
    ],
    "PreToolUse": [
      {
        "type": "command",
        "command": "curl -s -X POST 'http://localhost:4321/api/hooks/claude-code?event=PreToolUse' -H 'Content-Type: application/json' -d \"$(cat)\""
      }
    ],
    "PostToolUse": [
      {
        "type": "command",
        "command": "curl -s -X POST 'http://localhost:4321/api/hooks/claude-code?event=PostToolUse' -H 'Content-Type: application/json' -d \"$(cat)\""
      }
    ],
    "PostToolUseFailure": [
      {
        "type": "command",
        "command": "curl -s -X POST 'http://localhost:4321/api/hooks/claude-code?event=PostToolUseFailure' -H 'Content-Type: application/json' -d \"$(cat)\""
      }
    ],
    "Stop": [
      {
        "type": "command",
        "command": "curl -s -X POST 'http://localhost:4321/api/hooks/claude-code?event=Stop' -H 'Content-Type: application/json' -d \"$(cat)\""
      }
    ],
    "SubagentStart": [
      {
        "type": "command",
        "command": "curl -s -X POST 'http://localhost:4321/api/hooks/claude-code?event=SubagentStart' -H 'Content-Type: application/json' -d \"$(cat)\""
      }
    ],
    "SubagentStop": [
      {
        "type": "command",
        "command": "curl -s -X POST 'http://localhost:4321/api/hooks/claude-code?event=SubagentStop' -H 'Content-Type: application/json' -d \"$(cat)\""
      }
    ],
    "SessionEnd": [
      {
        "type": "command",
        "command": "curl -s -X POST 'http://localhost:4321/api/hooks/claude-code?event=SessionEnd' -H 'Content-Type: application/json' -d \"$(cat)\""
      }
    ],
    "Notification": [
      {
        "type": "command",
        "command": "curl -s -X POST 'http://localhost:4321/api/hooks/claude-code?event=Notification' -H 'Content-Type: application/json' -d \"$(cat)\""
      }
    ]
  }
}
```

Once configured, start a Claude Code session and a penguin will appear in the world. The server auto-generates an agent identity from the session ID and working directory.

## What You'll See

Each penguin reflects its agent's current state:

| State | Penguin Behavior |
|-------|-----------------|
| Idle | Stands around, occasional wandering |
| Working | Walks to desk, shows task bubble |
| Thinking | Thought particles |
| Speaking | Speech bubble with message |
| Listening | Stands at social spot, awaiting input |
| Sleeping | Zzz particles |
| Error | Exclamation mark |
| Offline | Penguin disappears |

## Architecture

```
penguverse/
  packages/
    core/       @penguverse/core    Canvas rendering engine
    server/     @penguverse/server  WebSocket server + hook receiver
    types/      @penguverse/types   Shared TypeScript types
  demo/         Development demo app (Vite)
  worlds/       World data (tile maps, scenes)
```

**Data flow:** Claude Code --> HTTP hook --> Server (4321) --> WebSocket --> Browser (5173) --> Canvas

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/` | GET | Server status page |
| `/api/info` | GET | Agent count JSON |
| `/api/hooks/claude-code` | POST | Hook receiver |
| `/ws` | WS | Real-time WebSocket |

The hook endpoint accepts query params: `?event=`, `?agent=`, `?name=`

## Development

```sh
bun run dev          # Start demo + server
bun run dev:demo     # Demo only (port 5173)
bun run dev:server   # Server only (port 4321)
bun test             # Run tests
bun run build        # Build core package
bun run typecheck    # Type check
```
