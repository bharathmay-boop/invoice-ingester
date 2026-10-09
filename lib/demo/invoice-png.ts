// A PNG of a demo invoice, written by hand.
//
// The review screen puts the original beside what was read from it, and
// headless Chromium has no PDF viewer, so the demo draft has to be an image to
// be photographed (#206). Written here rather than with a library for the same
// reason contract-pdf.ts is: the need is text at a position, and the demo then
// owns its document, so what the page says is what the draft says it read.
import { deflateSync } from "node:zlib";

// The classic 5x7 column font, upper case only. Each glyph is five columns,
// the low bit at the top. Characters outside it are drawn as a blank.
const FIRST = 0x20;
const GLYPHS = (
  "0000000000 00005F0000 0007000700 147F147F14 242A7F2A12 2313086462 3649552250 0005030000" +
  " 001C224100 0041221C00 14083E0814 08083E0808 0050300000 0808080808 0060600000 2010080402" +
  " 3E5149453E 00427F4000 4261514946 2141454B31 1814127F10 2745454539 3C4A494930 0171090503" +
  " 3649494936 064949291E 0036360000 0056360000 0814224100 1414141414 0041221408 0201510906" +
  " 324979413E 7E1111117E 7F49494936 3E41414122 7F4141221C 7F49494941 7F09090901 3E41494 97A" +
  " 7F0808087F 00417F4100 204041 3F01 7F08142241 7F40404040 7F020C027F 7F0408107F" +
  " 3E4141413E 7F09090906 3E4151215E 7F09192946 4649494931 0101 7F0101 3F4040403F" +
  " 1F2040201F 3F4038403F 6314081463 07087008 07 6151494543"
)
  .replace(/ /g, "")
  .match(/.{10}/g)!
  .map((hex) => Array.from({ length: 5 }, (_, i) => parseInt(hex.slice(i * 2, i * 2 + 2), 16)));

const SCALE = 3;
const CELL_W = 6 * SCALE;
const CELL_H = 10 * SCALE;
const MARGIN = 24 * SCALE;

const CRC = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function chunk(type: string, data: Buffer): Buffer {
  const body = Buffer.concat([Buffer.from(type, "latin1"), data]);
  let crc = 0xffffffff;
  for (const byte of body) crc = CRC[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  const head = Buffer.alloc(4);
  head.writeUInt32BE(data.length);
  const tail = Buffer.alloc(4);
  tail.writeUInt32BE((crc ^ 0xffffffff) >>> 0);
  return Buffer.concat([head, body, tail]);
}

/** Black text on white, one line per entry. Everything is drawn upper case. */
export function invoicePng(lines: string[]): Uint8Array {
  if (!lines.length) throw new Error("an invoice image needs at least one line");

  const columns = Math.max(...lines.map((l) => l.length));
  const width = columns * CELL_W + MARGIN * 2;
  const height = lines.length * CELL_H + MARGIN * 2;

  // One grey byte per pixel, 255 for paper, behind the filter byte of each row.
  const stride = width + 1;
  const raw = Buffer.alloc(stride * height, 255);
  for (let y = 0; y < height; y++) raw[y * stride] = 0;

  lines.forEach((line, row) => {
    [...line.toUpperCase()].forEach((char, col) => {
      const glyph = GLYPHS[char.charCodeAt(0) - FIRST];
      if (!glyph) return;
      glyph.forEach((bits, gx) => {
        for (let gy = 0; gy < 7; gy++) {
          if (!((bits >> gy) & 1)) continue;
          for (let dy = 0; dy < SCALE; dy++) {
            for (let dx = 0; dx < SCALE; dx++) {
              const x = MARGIN + col * CELL_W + gx * SCALE + dx;
              const y = MARGIN + row * CELL_H + gy * SCALE + dy;
              raw[y * stride + 1 + x] = 0;
            }
          }
        }
      });
    });
  });

  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8; // bit depth
  header[9] = 0; // greyscale

  return new Uint8Array(
    Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      chunk("IHDR", header),
      chunk("IDAT", deflateSync(raw)),
      chunk("IEND", Buffer.alloc(0)),
    ]),
  );
}
