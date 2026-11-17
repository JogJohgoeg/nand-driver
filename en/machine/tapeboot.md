# Fetch firmware from the chain

> At boot, the model machine fetches its runtime and model from a tape container. It checks the signature first, then each chunk's hash. If a check fails, it goes back to the last version that worked.

## Why you don't have to trust nodes

- The holder signs a manifest. The manifest lists every file and the sha256 of every 24,000-byte chunk.
- The device accepts bytes only if the signature matches the built-in holder address, the sequence number does not go backwards, and every chunk's hash matches.
- A node or gateway that lies can at most make the download fail. It can't make the device accept wrong bytes or an unsigned version.

## What is built into the device

| Item | Use |
|---|---|
| `chain_id`, `registry`, `container` | Which chain and which container to read |
| `holder` | Holder address. The device accepts only manifests signed by it |
| `board` | Board name, such as `mm-tang20k` |
| `min_seq` | Kept on the microSD: the sequence number of the last successful boot |

## Where it is on chain

```text
tapeboot/<board>/channel/<channel>.json   channel pointer (stable, beta …)
tapeboot/<board>/<seq>/manifest.json      manifest (signed)
tapeboot/<board>/<seq>/<file>             file; anything over 8,400,000 bytes is split into <file>.p0, <file>.p1 …
```

## 1. Fetch

1. Read the channel pointer to get `seq`, the manifest path and `manifest_sha256`. The channel pointer is not signed. It only suggests which manifest to read.
2. Fetch the manifest, compute its sha256 and compare it with the one in the channel pointer. If it does not match, treat it as not read.
3. Compare against the chunk cache on the microSD and list the missing chunks. Chunks already in the cache are not fetched again, so an upgrade fetches only the chunks that changed, and after a power loss the next boot picks up where it left off.
4. Get the size with `fileInfo`, then fetch chunk by chunk with `readRange`. Offset and length are multiples of 24,000 (except for the last chunk).

If a node can't be read, move to the next one. The last fallback is the `https://<tape name>.tapekit.org/` gateway, and the bytes it returns are checked against the hashes in the same way.

## 2. Check the signature

1. The manifest parses, `board` and `seq` match the path, and the boot firmware version is not below `min_loader`.
2. The four `owner` fields in the manifest (chain, registry, container, holder) match the built-in ones.
3. The address recovered from `sig` equals the built-in `holder`. For the signing method, see [TapeBoot spec](../reference/tapeboot.md#signature).
4. `seq` is not below `min_seq`.
5. If the previous manifest is stored locally, `prev` equals its sha256.

## 3. Check the hashes

1. Compare each chunk with `chunk_sha256[i]` as it arrives. If it does not match, discard it and read it again from another node.
2. Once all chunks are in, check the sha256 of each part and each file.
3. Not one byte goes to a slot, the FPGA or DDR3 until the whole file has passed.

Each part gets one of four results, the same as in tapemule. Only `verified` can be used:

| Result | Meaning |
|---|---|
| `verified` | The sha256 of the bytes matches the manifest |
| `unverified` | No fingerprint is recorded on chain |
| `incomplete` | The length or hash does not match, or a chunk could not be read |
| `missing` | This path does not exist on chain |

## 4. A/B slots and rollback

1. The microSD has two slots, `slot/a/` and `slot/b/`. `state.json` records `{active, pending, min_seq}`.
2. The new version is installed into the slot not in use, marked `pending`, and restarted for a trial run.
3. If a heartbeat from the soft core arrives within 60 seconds: commit. `active` becomes the new slot and `min_seq` becomes the new seq.
4. If none arrives: go back to the old slot, mark the new seq as a bad version, and do not try it again automatically.
5. With no network, it boots directly from the `active` slot.

To go back to an older version on purpose, point the channel pointer to an older seq, but not below `min_seq`. Going below `min_seq` needs a separate rollback instruction signed by the holder.

## Known limits

- When the device connects to only one node, that node can point it to an older signed version that is not below `min_seq`. Configuring several nodes reduces this risk.
- If the holder loses the private key or the container changes hands, the device stops accepting new versions, and you have to flash the boot firmware again. This is on purpose: there is no back door.
- The chunk hashes in a single manifest cover about 48 MB at most.
- v1 has no compression.

## On a small computer

On a small ARM computer with no FPGA, TapeBoot is a Linux program. Fetching, checking and the A/B slots all work as above:

- All files are installed to local storage. Bitstream and operating-system files are skipped.
- The runtime writes 1 byte to a pipe every second, in place of the mailbox heartbeat.
- Once the runtime is up, it first reports "device identity, boot ID, operation ID". It commits only if all three are right. Otherwise it rolls back.
- If a seq has already succeeded or failed, sending it again does not redo it. A job left half done continues from where it stopped.

> The spec is draft v0.3. The reference implementation (TS), the board C client and the test vectors are not in a public repository yet.
