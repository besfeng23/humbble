// https://docs.expo.dev/guides/using-eslint/
module.exports = {
  extends: 'expo',
  // Supabase Edge Functions are Deno code (npm:/URL imports); they are checked with `deno check`/`deno test`.
  ignorePatterns: ['/dist/*', '/supabase/functions/*'],
};
