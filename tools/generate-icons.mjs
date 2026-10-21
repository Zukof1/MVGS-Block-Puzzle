// Generates PWA icons (PNG) with no dependencies: node tools/generate-icons.mjs
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'assets', 'icons');
mkdirSync(outDir, { recursive: true });

// --- Minimal PNG encoder (RGBA, 8-bit) ---
const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
});
const crc32 = buf => {
    let c = 0xffffffff;
    for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body));
    return Buffer.concat([len, body, crc]);
};
function encodePNG(size, rgba) {
    const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(size, 0);
    ihdr.writeUInt32BE(size, 4);
    ihdr[8] = 8;  // bit depth
    ihdr[9] = 6;  // color type RGBA
    const raw = Buffer.alloc((size * 4 + 1) * size);
    for (let y = 0; y < size; y++) {
        raw[y * (size * 4 + 1)] = 0; // filter: none
        rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
    }
    return Buffer.concat([
        sig,
        chunk('IHDR', ihdr),
        chunk('IDAT', deflateSync(raw, { level: 9 })),
        chunk('IEND', Buffer.alloc(0)),
    ]);
}

// --- Drawing helpers ---
const hex = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16), 255];
const BG = hex('#1a1a2e');
const BLOCK_COLORS = ['#00ffff', '#ffd700', '#9b59b6', '#3498db', '#e67e22', '#e94560'];

function drawIcon(size, maskable) {
    const px = Buffer.alloc(size * size * 4);
    const set = (x, y, [r, g, b, a]) => {
        if (x < 0 || y < 0 || x >= size || y >= size) return;
        const i = (y * size + x) * 4;
        px[i] = r; px[i + 1] = g; px[i + 2] = b; px[i + 3] = a;
    };
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) set(x, y, BG);

    // 4x4 block grid in the safe zone (central 62.5% for maskable, 80% otherwise)
    const art = maskable ? 0.55 : 0.72;
    const zone = size * art;
    const off = (size - zone) / 2;
    const cell = zone / 4;
    const gap = Math.max(1, Math.round(cell * 0.12));
    // A recognizable block-puzzle pattern: filled cells of a 4x4 board.
    const pattern = [
        [1, 1, 0, 2],
        [1, 0, 3, 3],
        [0, 4, 4, 0],
        [5, 0, 1, 1],
    ];
    for (let r = 0; r < 4; r++) {
        for (let c = 0; c < 4; c++) {
            const v = pattern[r][c];
            if (!v) continue;
            const color = hex(BLOCK_COLORS[v - 1]);
            const x0 = Math.round(off + c * cell) + gap;
            const y0 = Math.round(off + r * cell) + gap;
            const x1 = Math.round(off + (c + 1) * cell) - gap;
            const y1 = Math.round(off + (r + 1) * cell) - gap;
            for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) set(x, y, color);
        }
    }
    return encodePNG(size, px);
}

for (const [name, size, maskable] of [
    ['icon-192.png', 192, false],
    ['icon-512.png', 512, false],
    ['maskable-512.png', 512, true],
    ['apple-touch-icon.png', 180, true],
]) {
    writeFileSync(join(outDir, name), drawIcon(size, maskable));
    console.log(`wrote assets/icons/${name} (${size}x${size})`);
}
