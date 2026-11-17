# TapeBoot spec

> TapeBoot defines how a device fetches firmware from a tape container: on-chain paths, channel pointers, manifest fields, signatures and the check order. Draft v0.3.

## On-chain paths

Everything lives in the device holder's tape container, as ordinary SiteRegistry files.

| Path | Content |
|---|---|
| `tapeboot/<board>/channel/<channel>.json` | Channel pointer |
| `tapeboot/<board>/<seq>/manifest.json` | Manifest, signed |
| `tapeboot/<board>/<seq>/<file>` | File; anything over 8,400,000 bytes is split into `<file>.p0`, `<file>.p1` ... |
| `tapeboot/<board>/rollback/<seq>.json` | Rollback instruction, optional, signed |

| Name | Rule |
|---|---|
| `<board>` | `[a-z0-9][a-z0-9-]{0,31}`, for example `mm-gw2a18` |
| `<seq>` | Positive decimal integer, no leading zeros |
| `<channel>` | `[a-z][a-z0-9-]{0,15}` |
| All paths | ≤ 200 characters, do not start with `/`, contain none of `\ ? # :`, and have no empty segments, `.` or `..` |

A single on-chain file holds at most 350 chunks × 24,000 bytes = 8,400,000 bytes. Larger files are split into parts. Every part except the last is a multiple of 24,000 bytes long.

## Channel pointer

```json
{"tapeboot":1,"board":"mm-gw2a18","channel":"stable","seq":7,"manifest":"tapeboot/mm-gw2a18/7/manifest.json","manifest_sha256":"0x…"}
```

| Field | Meaning |
|---|---|
| `tapeboot` | `1` |
| `board` | Board name |
| `channel` | Channel name, such as `stable` or `beta` |
| `seq` | The version it points to |
| `manifest` | Manifest path |
| `manifest_sha256` | sha256 of the manifest file, `0x` + 64 lower-case hex digits |

- Strict JSON, ≤ 4,096 bytes, stored in canonical form.
- **Not signed**. Trust comes from the manifest's signature and `seq ≥ min_seq`.
- After fetching the manifest, compare `manifest_sha256` first. If it does not match, treat it as not read.

## manifest

- Path `tapeboot/<board>/<seq>/manifest.json`, ≤ 65,536 bytes.
- UTF-8 strict JSON: no duplicate keys, no BOM, no lone surrogates; nesting ≤ 32 levels; the top level is an object.
- Numbers may only be integers from 0 to 2^53−1.
- What is stored on chain is the canonical form (including `sig`). Anything not in canonical form is rejected.
- It is also a valid tapemule app manifest: `name`, `version` and `tapeout.v = 1` are required, and `tapeout.files` lists the path and sha256 of every on-chain part. Tools that do not know TapeBoot can still check it as an ordinary site.

### The `tapeboot` member

| Field | Type | Rule |
|---|---|---|
| `v` | integer | Must be `1` |
| `board` | string | Equals the board built into the device |
| `seq` | integer | ≥ 1, strictly increasing, equals `<seq>` in the path |
| `version` | string | semver, for people only; which version is newer depends only on `seq` |
| `created` | string | RFC 3339 UTC, such as `2026-10-22T08:00:00Z`; for people only |
| `prev` | string | sha256 of the previous manifest; 64 zeros when `seq = 1` |
| `min_loader` | string | Lowest semver of the boot firmware; anything lower is rejected |
| `owner` | object | `{chain_id, registry, container, holder}` |
| `files` | array | 1–16 entries |
| `sig` | string | Signature, see below |

Addresses in `owner` are `0x` + 40 hex digits, compared case-insensitively. The device compares each one with its built-in root of trust. If any one differs, the whole manifest is rejected.

### Each entry in `files[]`

| Field | Type | Rule |
|---|---|---|
| `name` | string | `[A-Za-z0-9._-]{1,64}`, unique within one manifest |
| `role` | string | `bitstream` / `runtime` / `os` / `model` / `config` |
| `size` | integer | Total file size in bytes, ≥ 1 |
| `sha256` | string | sha256 of the whole file (all parts joined in order) |
| `chunk` | integer | Must be `24000` |
| `chunk_sha256` | array | Used when there are ≤ 256 chunks: entry i is the sha256 of chunk i, `ceil(size/24000)` entries in total |
| `chunk_list` | object | Used when there are > 256 chunks; give exactly one of this and `chunk_sha256` |
| `parts` | array | The on-chain parts in order, `{path, size, sha256}`; the `size` values add up to the file's `size` |
| `load` | string | `fpga`, `sd`, or `ddr:0x` plus 8 hex digits (such as `ddr:0x81000000`) |
| `compress` | string | v1 only has `none`; any other value rejects the whole manifest |

- Chunk hashes are numbered across the whole file and continue across parts. Part lengths are multiples of 24,000, so no chunk spans two parts.
- `parts[].path` usually sits under `tapeboot/<board>/<seq>/`, but it can also point to an existing file in the same container. The paths are covered by the signature, so a node cannot swap them.

### `chunk_list` (large files)

```json
"chunk_list": {"path":"tapeboot/<board>/<seq>/<name>.chunks","size":<32 × number of chunks>,"sha256":"0x…","chunk_sha256":["0x…", …]}
```

| Field | Meaning |
|---|---|
| `path` | Path of the list file; it must also be listed in `tapeout.files` |
| `size` | 32 × `ceil(file size / 24000)`, ≤ 8,400,000 |
| `sha256` | sha256 of the whole list file |
| `chunk_sha256` | Hashes of the list file itself, one per 24,000-byte chunk; one chunk holds 750 chunk hashes |

- Content of the list file: the raw 32-byte sha256 of each data chunk, joined in order.
- Chain of trust: signature → chunk hashes of the list file → hashes of the data chunks → data bytes.
- A file has at most 16 parts, about 134 MB.

## Signature

Rules for canonical form (writing an object as the byte string C):

- Keys sorted by UTF-16 code unit, ascending (for ASCII keys this is byte order);
- No whitespace at all;
- Strings escape only `"`, `\` and U+0000–U+001F, always written as `\u00XX` (lower-case hex); everything else stays as raw UTF-8;
- Integers in decimal, no leading zeros, no `+`.

Steps:

1. Remove `tapeboot.sig` and write the rest in canonical form, giving C.
2. Digest `D = sha256(C)`, 32 bytes.
3. `sig` is the holder's EIP-191 `personal_sign` over D: the message is `"\x19Ethereum Signed Message:\n32"` followed by D, then keccak256.
4. Write `sig` as `0x` + 130 hex digits: r, s and v joined in that order, where v is 27 or 28.
5. Verify: the address recovered from `sig` equals the built-in `holder` (case-insensitive). s must be in the lower half of the curve order, or it is rejected.

What is stored on chain is already in canonical form, so the board does not need to build a parse tree: cut the `,"sig":"0x…"` segment out of the raw text and compute sha256. The result is the same as above.

## Check order

A manifest is usable only after the device has done all of these:

| Step | What it checks |
|---|---|
| 1 | The channel pointer's `manifest_sha256` = the sha256 of the fetched manifest |
| 2 | It parses; `v = 1`; `board` and `seq` match the path; every `compress` is `none`; `min_loader` ≤ the local version |
| 3 | The four `owner` fields = the built-in root of trust |
| 4 | The address recovered from the signature = the built-in `holder` |
| 5 | `seq ≥ min_seq` (the seq of the last successful boot, kept on the microSD) |
| 6 | If the previous manifest is stored locally, `prev` = its sha256; if not (fresh install, skipped versions), do only 1–5 |
| 7 | Check every chunk against `chunk_sha256`, and every part and every file against `sha256` |

- With several sources, run steps 1–6 in full for each source. If one source fails, move to the next.
- If any step fails, treat the manifest as not read and keep using the current slot. Files that passed only partly are not written to a slot.
- Not one byte goes to the write target until the whole file has passed.

## Two ways to read

| Way | Who uses it | Rule |
|---|---|---|
| Full way | Hosts, web pages, packaging tools | Pin to a finalized block, check `eth_chainId`, require at least 2 independent operators to agree exactly, send only read-only methods; also reconcile against `fileInfo.sha256Hash` recorded on chain and `parts[].sha256` |
| Device way | Boards | Can connect to just one node, without pinning a block or voting. With signatures and per-chunk hashes, a node can only cause a failure or a controlled downgrade. Configure 2 or more nodes |

Fetching bytes: first get the size with `fileInfo(container, path)`, then call `readRange(container, path, offset, len)`. `offset` and `len` are multiples of 24,000 (except for the last chunk). As a fallback, use the `https://<tape name>.tapekit.org/<path>` gateway, in the device way only.

## Slots and rollback

| Item | Rule |
|---|---|
| Chunk cache | `cache/<chunk_sha256 without 0x>` on the microSD; the same chunk is reused across files and versions |
| Slots | `slot/a/` and `slot/b/`, each holding a complete manifest and its files |
| State | `state.json`: `{active, pending, min_seq}` |
| Commit | Install the new version into the slot not in use, mark it `pending` and do a trial run; if a heartbeat arrives within 60 seconds, set `active` = the new slot and `min_seq` = the new seq |
| Rollback | With no heartbeat, go back to the old slot, mark the new seq as a bad version, and do not try it again automatically |
| Manual rollback | The channel pointer can point to an older seq, but not below `min_seq` |
| Rollback instruction | Going below `min_seq` needs a separate `rollback/<seq>.json` signed by the holder, see below |

```json
{"tapeboot":1,"board":"…","kind":"rollback","to_seq":5,"new_min_seq":5,"nonce":<next value of seq>,"sig":"0x…"}
```

It is signed the same way as the manifest. If the signature checks out and `nonce` is greater than the largest seq seen, lower `min_seq` to `new_min_seq`. A v1 board client may leave this out.

## Client API

| Function | What it does |
|---|---|
| `tb_init(cfg)` | Built-in root of trust, node list, gateway, cache directory |
| `tb_resolve(channel)` | Read the channel → fetch the manifest → run check steps 1–6 |
| `tb_plan(manifest)` | List the chunks missing from the cache |
| `tb_fetch(manifest, file, sink, progress_cb)` | Fetch chunk by chunk, check hashes, write the cache; hand the file to the write target in order only after the whole file passes |
| `tb_stage(manifest)` | Once every file is fetched, write them into the standby slot and mark it `pending` |
| `tb_commit(manifest)` | Commit after a successful boot |
| `tb_rollback()` | Go back to the old slot |
| `tb_status()` | `{seq, slot, pending, min_seq, last_error}` |

Error kinds: `transport`, `not-found`, `bad-manifest`, `wrong-owner`, `bad-sig`, `old-seq`, `bad-prev`, `loader-too-old`, `chunk-mismatch`, `file-mismatch`, `no-space`.

## Known limits

1. In the device way, a node can point the device to an older signed version, as long as it is not below `min_seq`.
2. If the holder loses the private key or the container changes hands, the device stops accepting new versions, and you have to flash the boot firmware again.
3. The chunk hashes in a single manifest cover about 48 MB at most.
4. `created` and `version` are for people only and play no part in deciding which version is newer.
5. v1 has no compression.

> For a step-by-step guide, see [Fetch firmware from the chain](../machine/tapeboot.md).
