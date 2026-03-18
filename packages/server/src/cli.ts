#!/usr/bin/env bun
import { PenguverseServer } from './server';

const args = process.argv.slice(2);

const portIdx = args.indexOf('--port');
const port = portIdx >= 0 ? parseInt(args[portIdx + 1], 10) : 4321;
const noBrowser = args.includes('--no-browser');

const server = new PenguverseServer({ port });

try {
  const actualPort = server.start();
  const url = `http://localhost:${actualPort}`;

  if (noBrowser) {
    console.log(`  Penguverse server ready on port ${actualPort}`);
    console.log('');
  } else {
    console.log('');
    console.log('  ╔══════════════════════════════════════╗');
    console.log('  ║         P E N G U V E R S E          ║');
    const line = `  Server:  ${url}`;
    const pad = 38 - line.length;
    console.log('  ╠══════════════════════════════════════╣');
    console.log(`  ║${line}${' '.repeat(Math.max(0, pad))}║`);
    console.log('  ╚══════════════════════════════════════╝');
    console.log('');
  }

  if (!noBrowser) {
    const { exec } = await import('node:child_process');
    const cmd = process.platform === 'darwin' ? `open "${url}"`
      : process.platform === 'win32' ? `start "${url}"`
      : `xdg-open "${url}"`;
    exec(cmd, () => {});
  }
} catch (err) {
  console.error('Failed to start Penguverse server:', err);
  process.exit(1);
}

process.on('SIGINT', () => {
  console.log('\nShutting down Penguverse...');
  server.stop();
  process.exit(0);
});

process.on('SIGTERM', () => {
  server.stop();
  process.exit(0);
});
