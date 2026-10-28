'use strict';

// Turns a decoded favicon into the square PNG an icon record holds. Shared by
// the live favicon sanitizer and the synced tab-icon sidecar.

const { nativeImage } = require('electron');
const { ICON_SIZE, fitWithin, centerInSquare, validIconData } = require('./tabicons-model');

/** A decoded nativeImage as the square ICON_SIZE PNG data URL an icon record
 * holds. A non-square source keeps its shape, centered on transparency. */
function squarePngData(image) {
  if (!image || image.isEmpty()) return null;
  const source = image.getSize();
  const fit = fitWithin(source.width, source.height);
  let icon = image.resize({ ...fit, quality: 'best' });
  if (icon.isEmpty()) return null;
  if (fit.width !== fit.height) {
    const square = centerInSquare(icon.toBitmap(), fit.width, fit.height);
    if (!square) return null;
    icon = nativeImage.createFromBitmap(square, { width: ICON_SIZE, height: ICON_SIZE });
  }
  return validIconData(`data:image/png;base64,${icon.toPNG().toString('base64')}`);
}

module.exports = { squarePngData };
