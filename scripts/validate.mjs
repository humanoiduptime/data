import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dataRoot = path.join(repositoryRoot, 'data');
const forbiddenKeys = new Set([
  'internalPath',
  'candidateObservations',
  'operationalEvidence',
  'measurementProvenance',
  'researchPipeline',
  'reviewSchedule',
  'submissions',
]);
const tables = '(records|claims|disclosures|sources|history|deployments|coverage|metrics)';
const allowedFiles = [
  /^data-dictionary\.json$/,
  /^latest\.json$/,
  /^latest-csv-manifest\.json$/,
  /^latest-release-manifest\.json$/,
  new RegExp(`^latest-${tables}\\.csv$`),
  /^humanoiduptime-public-data-v\d+\.\d+\.\d+-\d{4}-\d{2}-\d{2}\.json(?:\.sha256)?$/,
  new RegExp(`^humanoiduptime-public-data-v\\d+\\.\\d+\\.\\d+-\\d{4}-\\d{2}-\\d{2}-${tables}\\.csv$`),
  /^humanoiduptime-public-data-v\d+\.\d+\.\d+-\d{4}-\d{2}-\d{2}-csv-manifest\.json$/,
  /^humanoiduptime-public-data-v\d+\.\d+\.\d+-\d{4}-\d{2}-\d{2}-csv-checksums\.sha256$/,
  /^humanoiduptime-public-data-v\d+\.\d+\.\d+-\d{4}-\d{2}-\d{2}-csv\.zip$/,
  /^humanoiduptime-public-data-v\d+\.\d+\.\d+-\d{4}-\d{2}-\d{2}-release-manifest\.json$/,
  /^humanoiduptime-public-data-v\d+\.\d+\.\d+-\d{4}-\d{2}-\d{2}-release-checksums\.sha256$/,
];

function sha256(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

function assertPublicObject(value, location = '$') {
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertPublicObject(item, `${location}[${index}]`));
    return;
  }
  if (!value || typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value)) {
    if (forbiddenKeys.has(key)) throw new Error(`Forbidden internal field: ${location}.${key}`);
    assertPublicObject(child, `${location}.${key}`);
  }
}

function csvRowCount(text) {
  let inQuotes = false;
  let lines = 0;
  for (let index = 0; index < text.length; index += 1) {
    if (text[index] === '"') {
      if (inQuotes && text[index + 1] === '"') index += 1;
      else inQuotes = !inQuotes;
    } else if (text[index] === '\n' && !inQuotes) {
      lines += 1;
    }
  }
  if (inQuotes) throw new Error('CSV contains an unterminated quoted field.');
  return Math.max(0, lines - 1);
}

async function sameBytes(left, right) {
  const [leftBuffer, rightBuffer] = await Promise.all([readFile(left), readFile(right)]);
  return leftBuffer.equals(rightBuffer);
}

const files = await readdir(dataRoot);
const unexpectedFiles = files.filter((file) => !allowedFiles.some((pattern) => pattern.test(file)));
if (unexpectedFiles.length > 0) {
  throw new Error(`Unexpected file(s) in data/: ${unexpectedFiles.join(', ')}`);
}

for (const file of files.filter((name) => /^humanoiduptime-public-data-v\d+\.\d+\.\d+-\d{4}-\d{2}-\d{2}\.json$/.test(name))) {
  const buffer = await readFile(path.join(dataRoot, file));
  assertPublicObject(JSON.parse(buffer));
  const sidecar = (await readFile(path.join(dataRoot, `${file}.sha256`), 'utf8')).trim().split(/\s+/);
  if (sidecar[1] !== file || sidecar[0] !== sha256(buffer)) throw new Error(`Invalid JSON checksum sidecar: ${file}`);
}

const latestBuffer = await readFile(path.join(dataRoot, 'latest.json'));
const latest = JSON.parse(latestBuffer);
if (latest.schema !== 'humanoiduptime-public-data' || latest.schemaVersion !== 1) {
  throw new Error('Unrecognized public data schema.');
}
assertPublicObject(latest);

const immutableJson = `humanoiduptime-public-data-v${latest.exportVersion}-${latest.snapshotDate}.json`;
if (!await sameBytes(path.join(dataRoot, 'latest.json'), path.join(dataRoot, immutableJson))) {
  throw new Error('latest.json differs from its immutable versioned artifact.');
}

const jsonChecksum = (await readFile(path.join(dataRoot, `${immutableJson}.sha256`), 'utf8')).trim().split(/\s+/);
if (jsonChecksum[1] !== immutableJson || jsonChecksum[0] !== sha256(latestBuffer)) {
  throw new Error('The current JSON checksum sidecar is invalid.');
}

const manifestBuffer = await readFile(path.join(dataRoot, 'latest-csv-manifest.json'));
const manifest = JSON.parse(manifestBuffer);
if (manifest.schema !== 'humanoiduptime-public-csv-package' || manifest.exportVersion !== latest.exportVersion || manifest.snapshotDate !== latest.snapshotDate || manifest.tables?.length !== 8) {
  throw new Error('The current CSV manifest does not match the JSON release.');
}

const immutableManifest = `humanoiduptime-public-data-v${latest.exportVersion}-${latest.snapshotDate}-csv-manifest.json`;
if (!await sameBytes(path.join(dataRoot, 'latest-csv-manifest.json'), path.join(dataRoot, immutableManifest))) {
  throw new Error('latest-csv-manifest.json differs from its immutable artifact.');
}

for (const table of manifest.tables) {
  const immutablePath = path.join(dataRoot, table.file);
  const latestPath = path.join(dataRoot, table.latestFile);
  const immutableBuffer = await readFile(immutablePath);
  if (sha256(immutableBuffer) !== table.sha256) throw new Error(`Checksum mismatch: ${table.file}`);
  if (!await sameBytes(immutablePath, latestPath)) throw new Error(`${table.latestFile} differs from ${table.file}`);
  const rows = csvRowCount(immutableBuffer.toString('utf8'));
  if (rows !== table.rowCount) throw new Error(`Row count mismatch for ${table.file}: expected ${table.rowCount}, found ${rows}`);
}

const checksumFile = path.join(dataRoot, `humanoiduptime-public-data-v${latest.exportVersion}-${latest.snapshotDate}-csv-checksums.sha256`);
const declaredCsvChecksums = (await readFile(checksumFile, 'utf8')).trim().split('\n').map((line) => line.trim().split(/\s+/));
if (declaredCsvChecksums.length !== manifest.tables.length) throw new Error('CSV checksum sidecar has the wrong table count.');
for (const [checksum, file] of declaredCsvChecksums) {
  const table = manifest.tables.find((item) => item.file === file);
  if (!table || table.sha256 !== checksum) throw new Error(`CSV checksum sidecar mismatch: ${file}`);
}

const dictionary = JSON.parse(await readFile(path.join(dataRoot, 'data-dictionary.json'), 'utf8'));
if (dictionary.schema !== latest.schema || dictionary.schemaVersion !== latest.schemaVersion || dictionary.updatedAt !== latest.snapshotDate) {
  throw new Error('Data dictionary does not match the current release.');
}

const releaseBase = `humanoiduptime-public-data-v${latest.exportVersion}-${latest.snapshotDate}`;
const releaseManifestFile = `${releaseBase}-release-manifest.json`;
const releaseManifestBuffer = await readFile(path.join(dataRoot, releaseManifestFile));
const releaseManifest = JSON.parse(releaseManifestBuffer);
if (releaseManifest.schema !== 'humanoiduptime-public-release-manifest' || releaseManifest.schemaVersion !== 1 || releaseManifest.exportVersion !== latest.exportVersion || releaseManifest.snapshotDate !== latest.snapshotDate || releaseManifest.releaseTag !== `v${latest.exportVersion}`) {
  throw new Error('Release manifest does not match the current dataset release identity.');
}
if (!await sameBytes(path.join(dataRoot, 'latest-release-manifest.json'), path.join(dataRoot, releaseManifestFile))) {
  throw new Error('latest-release-manifest.json differs from its immutable artifact.');
}

const distributionKeys = releaseManifest.distributions?.map((distribution) => distribution.key).sort();
if (distributionKeys?.join(',') !== 'csv_bundle,json') throw new Error('Release manifest must declare JSON and CSV bundle distributions.');
for (const distribution of releaseManifest.distributions) {
  const buffer = await readFile(path.join(dataRoot, distribution.file));
  if (buffer.length !== distribution.byteLength || sha256(buffer) !== distribution.sha256) throw new Error(`Release distribution mismatch: ${distribution.file}`);
}
const csvBundle = releaseManifest.distributions.find((distribution) => distribution.key === 'csv_bundle');
const expectedBundleEntries = [...manifest.tables.map((table) => table.file), immutableManifest, 'data-dictionary.json'].sort();
if (csvBundle.entries?.slice().sort().join('\n') !== expectedBundleEntries.join('\n')) throw new Error('CSV bundle entry declaration does not match the current CSV package.');

const releaseChecksumsFile = `${releaseBase}-release-checksums.sha256`;
if (releaseManifest.checksumFile !== releaseChecksumsFile) throw new Error('Release manifest checksum filename mismatch.');
const declaredReleaseChecksums = (await readFile(path.join(dataRoot, releaseChecksumsFile), 'utf8')).trim().split('\n').map((line) => line.trim().split(/\s+/));
const expectedReleaseFiles = new Set([...releaseManifest.distributions.map((distribution) => distribution.file), releaseManifestFile]);
if (declaredReleaseChecksums.length !== expectedReleaseFiles.size) throw new Error('Release checksum sidecar has the wrong artifact count.');
for (const [checksum, file] of declaredReleaseChecksums) {
  if (!expectedReleaseFiles.delete(file) || checksum !== sha256(await readFile(path.join(dataRoot, file)))) throw new Error(`Release checksum sidecar mismatch: ${file}`);
}
if (expectedReleaseFiles.size > 0) throw new Error(`Release checksum sidecar is missing: ${[...expectedReleaseFiles].join(', ')}`);

if (process.env.GITHUB_REF_TYPE === 'tag' && process.env.GITHUB_REF_NAME !== releaseManifest.releaseTag) {
  throw new Error(`Tag ${process.env.GITHUB_REF_NAME} does not match release identity ${releaseManifest.releaseTag}.`);
}

const citation = await readFile(path.join(repositoryRoot, 'CITATION.cff'), 'utf8');
if (!citation.includes(`version: ${latest.exportVersion}`) || !citation.includes(`/tree/v${latest.exportVersion}`)) {
  throw new Error('CITATION.cff does not identify the current immutable release.');
}
const releaseNotes = await readFile(path.join(repositoryRoot, 'releases', `v${latest.exportVersion}.md`), 'utf8');
if (!releaseNotes.includes(`Public Data v${latest.exportVersion}`) || !releaseNotes.includes(`Snapshot: ${latest.snapshotDate}`)) {
  throw new Error('Release notes do not match the current dataset release.');
}

console.log(`Validated HumanoidUptime public data ${latest.exportVersion} (${latest.snapshotDate}): ${latest.records.length} records, ${manifest.tables.reduce((sum, table) => sum + table.rowCount, 0)} CSV rows and ${releaseManifest.distributions.length} checksummed distributions.`);
