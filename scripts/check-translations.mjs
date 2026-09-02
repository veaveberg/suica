import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const translationSource = readFileSync(new URL('../src/translations.ts', import.meta.url), 'utf8');

function readCatalog(language) {
    const startMarker = `    ${language}: {`;
    const start = translationSource.indexOf(startMarker);
    assert.notEqual(start, -1, `Missing ${language} catalog`);

    const end = translationSource.indexOf('\n    },', start);
    assert.notEqual(end, -1, `Could not find the end of the ${language} catalog`);

    const entries = [...translationSource.slice(start, end).matchAll(/^        ([A-Za-z0-9_]+):\s*'([^']*)',?$/gm)];
    const catalog = new Map(entries.map(([, key, value]) => [key, value]));
    assert.equal(catalog.size, entries.length, `${language} contains duplicate keys`);
    return catalog;
}

function placeholders(value) {
    return [...value.matchAll(/{{([A-Za-z0-9_]+)}}/g)].map(([, name]) => name).sort();
}

const russian = readCatalog('RU');
const ukrainian = readCatalog('UK');
const missingKeys = [...russian.keys()].filter(key => !ukrainian.has(key));
assert.deepEqual(missingKeys, [], `UK is missing Russian catalog keys: ${missingKeys.join(', ')}`);

for (const [key, russianValue] of russian) {
    assert.deepEqual(
        placeholders(ukrainian.get(key)),
        placeholders(russianValue),
        `UK.${key} must preserve interpolation variables`,
    );
}

for (const key of [
    'days_one',
    'days_few',
    'days_many',
    'days_other',
    'lessons_one',
    'lessons_few',
    'lessons_many',
    'lessons_other',
    'lessons_not_assigned_one',
    'lessons_not_assigned_few',
    'lessons_not_assigned_many',
    'lessons_not_assigned_other',
]) {
    assert.ok(ukrainian.has(key), `UK is missing plural form ${key}`);
}

for (const [key, value] of ukrainian) {
    assert.doesNotMatch(value, /[ыэёъ]/iu, `UK.${key} contains a Russian-only letter`);
}

console.log(`Translation check passed: UK covers ${russian.size} Russian keys.`);
