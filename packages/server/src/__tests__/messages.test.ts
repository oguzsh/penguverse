import { describe, test, expect } from 'bun:test';
import { MessageRouter } from '../messages';

describe('MessageRouter', () => {
  test('queueMessage and drainInbox', () => {
    const router = new MessageRouter();
    router.queueMessage('bob', 'alice', 'Hello Bob!');
    router.queueMessage('bob', 'charlie', 'Hey Bob!');

    const msgs = router.drainInbox('bob');
    expect(msgs.length).toBe(2);
    expect(msgs[0].from).toBe('alice');
    expect(msgs[0].message).toBe('Hello Bob!');
    expect(msgs[1].from).toBe('charlie');

    // Drain again should be empty
    expect(router.drainInbox('bob')).toEqual([]);
  });

  test('peekInbox does not clear messages', () => {
    const router = new MessageRouter();
    router.queueMessage('bob', 'alice', 'Hi');
    expect(router.peekInbox('bob').length).toBe(1);
    expect(router.peekInbox('bob').length).toBe(1); // Still there
  });

  test('inbox capped at 100', () => {
    const router = new MessageRouter();
    for (let i = 0; i < 110; i++) {
      router.queueMessage('bob', 'alice', `msg-${i}`);
    }
    const msgs = router.drainInbox('bob');
    expect(msgs.length).toBe(100);
    expect(msgs[0].message).toBe('msg-10'); // First 10 evicted
  });

  test('join and leave channel', () => {
    const router = new MessageRouter();
    router.joinChannel('alice', 'general');
    router.joinChannel('bob', 'general');

    const members = router.getChannelMembers('general');
    expect(members.size).toBe(2);
    expect(members.has('alice')).toBe(true);
    expect(members.has('bob')).toBe(true);

    router.leaveChannel('alice', 'general');
    expect(router.getChannelMembers('general').size).toBe(1);
  });

  test('getAllChannels', () => {
    const router = new MessageRouter();
    router.joinChannel('a', 'ch1');
    router.joinChannel('b', 'ch1');
    router.joinChannel('c', 'ch2');

    const all = router.getAllChannels();
    expect(all['ch1']).toEqual(expect.arrayContaining(['a', 'b']));
    expect(all['ch2']).toEqual(['c']);
  });

  test('removeAgent cleans up channels', () => {
    const router = new MessageRouter();
    router.joinChannel('alice', 'general');
    router.joinChannel('alice', 'dev');
    router.removeAgent('alice');
    expect(router.getChannelMembers('general').has('alice')).toBe(false);
    expect(router.getChannelMembers('dev').has('alice')).toBe(false);
  });

  test('getChannelMembers for unknown channel returns empty set', () => {
    const router = new MessageRouter();
    expect(router.getChannelMembers('nonexistent').size).toBe(0);
  });

  test('queueMessage includes timestamp', () => {
    const router = new MessageRouter();
    const before = Date.now();
    router.queueMessage('bob', 'alice', 'hi');
    const msgs = router.drainInbox('bob');
    expect(msgs[0].timestamp).toBeGreaterThanOrEqual(before);
  });

  test('queueMessage with channel', () => {
    const router = new MessageRouter();
    router.queueMessage('bob', 'alice', 'Hi channel', 'general');
    const msgs = router.drainInbox('bob');
    expect(msgs[0].channel).toBe('general');
  });
});
