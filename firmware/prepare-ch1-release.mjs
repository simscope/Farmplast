import { readFile, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { resolve } from 'node:path'

// Offline only: validates an application image and writes metadata; never uploads or flashes.
const [input, version, output] = process.argv.slice(2)
if (!input || !output || !/^[A-Za-z0-9._-]{1,48}$/.test(version || '')) throw new Error('Usage: node prepare-ch1-release.mjs app.bin version manifest.json')
const image = await readFile(input)
if (image.length < 256 || image.length > 1310720 || image[0] !== 0xe9 || image.readUInt16LE(12) !== 9 || image.readUInt32LE(32) !== 0xabcd5432) throw new Error('Expected an ESP32-S3 application image fitting the 1.25 MiB OTA slot; merged/bootloader images are not accepted')
if (!image.includes(Buffer.from(`CH1OTA_VERSION=${version}\0`))) throw new Error('Version does not match the compiled CH1 OTA marker')
const sha256 = createHash('sha256').update(image).digest('hex')
await writeFile(resolve(output), JSON.stringify({ version, model: 'CH1-ESP32S3-v1', sha256, size: image.length, storage_path: `${sha256}.bin`, approved: false }, null, 2) + '\n', { flag: 'wx' })
console.log('Validated application image. Created unapproved metadata only; no upload or device change.')
