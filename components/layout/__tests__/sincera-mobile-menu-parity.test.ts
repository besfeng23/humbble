import fs from "node:fs";
import path from "node:path";
const source=(p:string)=>fs.readFileSync(path.join(process.cwd(),p),"utf8");
describe("Sincera authenticated Bubble Live navigation parity",()=>{
 it("shows mobile brand and menu below 760px",()=>{
  const shell=source("components/layout/DatingLayout.tsx");
  expect(shell).toContain("effectiveWidth >= 760");
  expect(shell).toContain('testID="sincera-mobile-header"');
  expect(shell).toContain('testID="sincera-mobile-menu-toggle"');
  expect(shell).toContain('testID="sincera-mobile-member-menu"');
  expect(shell).toContain("DATING_NAV_ITEMS.map(item =>");
  expect(shell).toContain("navigateFromMenu(item.href)");
  expect(shell).toContain("void logOut()");
 });
 it("retains Bubble bottom tabs below 760px and removes them above",()=>{
  const tabs=source("app/(tabs)/_layout.tsx");
  expect(tabs).toContain('width>=760');
  expect(tabs).toContain('tabBarStyle:wideWeb?{display:"none"}');
 });
});
