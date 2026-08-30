#!/usr/bin/env node
/**
 * Refuses to ship a build whose public face gives itself away.
 *
 * The concealment in this app rests on one property: everything belonging to
 * the conversation lives behind a dynamic import, so a visitor who never enters
 * a valid code never downloads it. That property is easy to establish and very
 * easy to lose — a single eager `import` added months from now, in a file that
 * looks unrelated, silently pulls the whole thing back into the entry chunk and
 * nothing about the running site looks any different.
 *
 * So it is checked mechanically rather than remembered. This reads the built
 * index.html, follows only the assets the browser fetches BEFORE any code is
 * entered — the entry script and anything modulepreloaded alongside it — and
 * fails the deploy if any of them contain a word that a revision-notes site has
 * no business shipping.
 *
 * Deliberately not a lint rule: the thing being asserted is a property of the
 * emitted bundle, and only the bundle can answer it.
 */

import { readFileSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
// Takes an explicit directory so the checker itself can be tested against
// fixtures without a real build standing by.
const dist = process.argv[2] !== undefined ? resolve(process.argv[2]) : join(root, 'dist');

/**
 * Words that must not appear in anything served before unlock.
 *
 * Kept deliberately blunt. A false positive costs a minute of renaming; a false
 * negative costs the entire premise, and would not be noticed by looking at the
 * site. Matched case-insensitively against the raw bytes.
 */
const FORBIDDEN = [
  'atlas',
  'passphrase',
  'pbkdf2',
  'end-to-end',
  'e2ee',
  'messenger',
  'incorrect password',
  'verifier',
  'firestore',
  'firebaseio',
  'conversation',
  'ciphertext',
  // Class and keyframe names that would otherwise describe the app in the
  // stylesheet. These were renamed for exactly this reason; the entries keep
  // them from creeping back.
  'bubble-in',
  'bubble-mine',
  'bubble-theirs',
  'typing-',
  'lock-out',
  'lock-screen',
  'unread',

  /**
   * Phrases from index.html, added after a near miss.
   *
   * HTML comments are NOT stripped by the minifier — they ship verbatim and are
   * the first thing view-source shows. index.html carried three: one mentioning
   * "your conversation", one mentioning "the composer", and one that said this
   * site "has an audience of two". Only the first was caught, because the other
   * two used words no rule covered.
   *
   * The lesson is that the forbidden list has to include the language people
   * describe the app IN, not just the app's own vocabulary.
   */
  'audience of two',
  'composer',
  'workspace',
  'both of you',
  'the other person',
  'two people',
];

function fail(message) {
  console.error(`\x1b[1;31m✗ ${message}\x1b[0m`);
  process.exit(1);
}

if (!existsSync(dist)) fail('No dist/ — run the build first.');

const indexPath = join(dist, 'index.html');
if (!existsSync(indexPath)) fail('No dist/index.html.');

const html = readFileSync(indexPath, 'utf8');

/**
 * Everything the browser loads without being asked: the entry module, plus any
 * chunk Vite decided to preload alongside it. Dynamic imports do NOT appear
 * here — that is exactly the distinction being tested.
 */
const eager = new Set();
for (const match of html.matchAll(/<script[^>]+src="([^"]+)"/g)) eager.add(match[1]);
for (const match of html.matchAll(/<link[^>]+rel="modulepreload"[^>]+href="([^"]+)"/g)) {
  eager.add(match[1]);
}

/**
 * The stylesheet counts too, and it is the sneakier half.
 *
 * Tailwind scans every source file regardless of the import graph, so the whole
 * app's utilities — and every keyframe and component class declared in
 * styles/index.css — end up in one stylesheet that loads on the public site.
 * Code splitting does nothing about this. Animation names are the exposure:
 * `@keyframes typing-bounce` in the CSS of a revision-notes site says more than
 * any amount of minified JavaScript would.
 */
for (const match of html.matchAll(/<link[^>]+rel="stylesheet"[^>]+href="([^"]+)"/g)) {
  eager.add(match[1]);
}

if (eager.size === 0) fail('Could not find any scripts in index.html — the parse is wrong.');

const targets = [
  { label: 'index.html', text: html },
  ...[...eager].map((url) => {
    const file = join(dist, url.replace(/^\//, ''));
    if (!existsSync(file)) fail(`index.html references ${url}, which is not in dist/.`);
    return { label: url, text: readFileSync(file, 'utf8') };
  }),
];

const manifest = join(dist, 'manifest.webmanifest');
if (existsSync(manifest)) {
  targets.push({ label: 'manifest.webmanifest', text: readFileSync(manifest, 'utf8') });
}

let failures = 0;

for (const target of targets) {
  const haystack = target.text.toLowerCase();
  for (const word of FORBIDDEN) {
    if (!haystack.includes(word)) continue;

    // A little context makes the difference between "obvious, fix it" and
    // "hunt through a 200 KB minified file".
    const at = haystack.indexOf(word);
    const excerpt = target.text.slice(Math.max(0, at - 60), at + word.length + 60);
    console.error(`\x1b[1;31m✗ "${word}" found in ${target.label}\x1b[0m`);
    console.error(`  …${excerpt.replace(/\s+/g, ' ')}…`);
    failures += 1;
  }
}

if (failures > 0) {
  console.error('');
  fail(
    `${failures} leak${failures === 1 ? '' : 's'} in the pre-unlock bundle. ` +
      'Move the offending module behind a dynamic import, or rename the string.',
  );
}

console.log(
  `\x1b[1;32m✓ Public bundle is clean\x1b[0m (${targets.length} files checked, ` +
    `${FORBIDDEN.length} patterns)`,
);
