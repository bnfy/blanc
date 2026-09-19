const path = require('node:path');
const sharp = require('sharp');

const ROOT = __dirname;
const ISLAND = path.join(ROOT, 'quiet-island-overlay.png');

const directions = [
  {
    id: 'architectural',
    background: path.join(ROOT, 'sunrise-architectural-background-master.png'),
    islandOutputs: [
      {
        filename: 'sunrise-architectural-island-master-3000x1000.jpg',
        width: 3000,
        height: 1000,
        islandX: 450,
        islandY: 359,
        islandWidth: 2100,
      },
      {
        filename: 'sunrise-architectural-island-x-cover-1500x500.jpg',
        width: 1500,
        height: 500,
        islandX: 225,
        islandY: 179,
        islandWidth: 1050,
      },
      {
        filename: 'sunrise-architectural-island-facebook-cover-1640x624.jpg',
        width: 1640,
        height: 624,
        islandX: 295,
        islandY: 241,
        islandWidth: 1050,
      },
    ],
  },
  {
    id: 'minimal',
    background: path.join(ROOT, 'sunrise-minimal-background-master.png'),
    islandOutputs: [
      {
        filename: 'sunrise-minimal-island-master-3000x1000.jpg',
        width: 3000,
        height: 1000,
        islandX: 450,
        islandY: 359,
        islandWidth: 2100,
      },
      {
        filename: 'sunrise-minimal-island-x-cover-1500x500.jpg',
        width: 1500,
        height: 500,
        islandX: 225,
        islandY: 179,
        islandWidth: 1050,
      },
      {
        filename: 'sunrise-minimal-island-facebook-cover-1640x624.jpg',
        width: 1640,
        height: 624,
        islandX: 295,
        islandY: 241,
        islandWidth: 1050,
      },
    ],
  },
];

async function renderIsland(direction, spec) {
  const island = await sharp(ISLAND)
    .trim({ background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .resize({ width: spec.islandWidth })
    .png()
    .toBuffer();

  await sharp(direction.background)
    .resize(spec.width, spec.height, { fit: 'cover', position: 'centre' })
    .composite([{ input: island, top: spec.islandY, left: spec.islandX }])
    .jpeg({ quality: 94, chromaSubsampling: '4:4:4', mozjpeg: true })
    .toFile(path.join(ROOT, spec.filename));
}

async function main() {
  for (const direction of directions) {
    for (const spec of direction.islandOutputs) await renderIsland(direction, spec);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
