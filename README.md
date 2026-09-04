# HumanoidUptime public data

Versioned public evidence from [HumanoidUptime](https://humanoiduptime.com/), a
public reliability record for humanoid robotics.

This repository contains the same reviewed public projection available from the
website. It is designed for inspection, reproducible analysis and stable release
references. It is not a dump of the editorial database.

## Contents

- `data/latest.json` — current complete structured export;
- `data/latest-*.csv` — current linked tables for spreadsheets and analysis;
- `data/latest-csv-manifest.json` — columns, keys, row counts and checksums;
- `data/latest-release-manifest.json` — current formal release identity and
  distributions;
- `data/data-dictionary.json` — field meanings and explicit exclusions;
- `data/humanoiduptime-public-data-v*` — immutable dated artifacts.

Formal releases expose one versioned JSON distribution and one deterministic
CSV ZIP. The ZIP contains all eight CSV tables, their CSV manifest and the data
dictionary. The release manifest binds both distributions to one release; the
release checksum file also covers the immutable manifest itself.

Stable IDs, rather than display labels, should be used for joins. CSV files are
UTF-8 with BOM, use quoted fields and neutralize spreadsheet-formula prefixes.

## What is not included

Private candidate observations, editorial priorities, raw submissions,
database internals, review schedules and retained third-party source bodies are
not published here. Source URLs, precise locators and verification metadata are
included where available. A missing value remains missing; it is not estimated.

## Validate locally

Node.js 24 or later is sufficient; there are no package dependencies.

```bash
node scripts/validate.mjs
```

The validator checks the public/private boundary, immutable/current artifact
equivalence, declared row counts, distribution manifests, SHA-256 checksums and
the release identity when run from a tag.

## Releases

Each formal release has one immutable `vX.Y.Z` tag. Files in the tagged commit
and their release manifest are canonical; GitHub Release attachments are only
checksum-equivalent download mirrors. Release-specific notes are retained under
[`releases/`](releases/).

The `Publish public data release` workflow validates the tagged state before it
creates a GitHub Release with the JSON, CSV ZIP, release manifest and release
checksums. It refuses to replace an existing Release object.

## Corrections and contributions

Open an issue with the affected record or stable ID, a public source URL and a
precise explanation. Do not submit confidential information or personal data.
An issue is a review request, not automatic acceptance or publication.

The website remains the canonical human-readable publication. PostgreSQL is the
internal canonical editorial source; this repository is a versioned public
distribution and verification layer.

## Licence

The database structure is available under ODC-By 1.0. Original HumanoidUptime
annotations are available under CC BY 4.0. Third-party source materials, names,
logos and trademarks are excluded. See [LICENSE.md](LICENSE.md).
