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

  test('safety screen is a sparse three-row list; Unmatch only when matched', () => {
    const safety = source('app/(safety)/report-modal.tsx');
    expect(safety).toContain('safety-block-btn');
    expect(safety).toContain('safety-report-btn');
    expect(safety).toContain("{matched ? <Row testID=\"safety-unmatch-btn\"");
    expect(safety).toContain('safety-report-submit-btn');
    // No solid danger buttons: dangerSolid is only a text/outline colour in the confirm step.
    expect(safety).not.toContain('variant="danger"');
    expect(safety).not.toMatch(/backgroundColor:\s*palette\.dangerSolid/);
    expect(safety.match(/palette\.dangerSolid/g)?.length).toBe(3);
    expect(safety).toContain('fadeEdge');
  });

  test('discovery profile opens Safety without match (no Unmatch); matched entry points pass matched=1', () => {
    const profile = source('app/(tabs)/discover/[id].tsx');
    expect(profile).not.toContain("matched: '1'");
    expect(profile).not.toContain('variant="danger"');
    for (const file of ['components/discovery/DiscoveryFeed.tsx', 'app/(tabs)/(chats)/chatScreen.tsx', 'app/(tabs)/(chats)/index.tsx']) {
      expect(source(file)).toContain("matched: '1'");
    }
  });
});
