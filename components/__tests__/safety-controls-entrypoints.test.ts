import fs from 'node:fs';
import path from 'node:path';

const source = (relativePath: string) => fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8');

describe('P3-05 safety controls entry points', () => {
  test('discovery profile opens targeted safety controls', () => {
    const screen = source('app/(tabs)/discover/[id].tsx');
    expect(screen).toContain('scr-12-shield-btn');
    expect(screen).toContain("'/(safety)/report-modal'");
    expect(screen).toContain('targetId: candidate?.profile_id');
  });

  test('mutual-match view exposes safety controls for the matched profile', () => {
    const feed = source('components/discovery/DiscoveryFeed.tsx');
    expect(feed).toContain('discovery-match-safety');
    expect(feed).toContain('Block, report or unmatch');
    expect(feed).toContain('targetId: match.profile_id');
  });

  test('chat header and conversation long-press route to the counterpart safety controls', () => {
    const chat = source('app/(tabs)/(chats)/chatScreen.tsx');
    const list = source('app/(tabs)/(chats)/index.tsx');
    expect(chat).toContain('scr-16-shield-btn');
    expect(chat).toContain('targetId: conversation?.counterpartId');
    expect(list).toContain('onLongPress');
    expect(list).toContain("source: 'conversation-list'");
  });

  test('shared safety screen has separate block, unmatch, and report actions', () => {
    const safety = source('app/(safety)/report-modal.tsx');
    expect(safety).toContain('safety-block-btn');
    expect(safety).toContain('safety-unmatch-btn');
    expect(safety).toContain('safety-report-submit-btn');
    expect(safety).toContain('variant="danger"');
  });
});
