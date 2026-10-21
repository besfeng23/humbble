import fs from 'node:fs';
import path from 'node:path';

describe('production discovery data source', () => {
  const root = path.resolve(__dirname, '../..');
  test('Discover and People cannot import DB/userDB mock fixtures', () => {
    for (const relative of ['app/(tabs)/discover.tsx', 'app/(tabs)/people.tsx']) {
      const source = fs.readFileSync(path.join(root, relative), 'utf8');
      expect(source).not.toMatch(/from\s+['"]@\/DB\/userDB['"]/);
      expect(source).toContain('DiscoveryFeed');
    }
  });

  test('legacy userDB fixtures are empty outside __DEV__', () => {
    const source = fs.readFileSync(path.join(root, 'DB/userDB.tsx'), 'utf8');
    expect(source).toMatch(/__DEV__\s*\?/);
    expect(source).toMatch(/:\s*\[\]\s*;/);
  });
});
