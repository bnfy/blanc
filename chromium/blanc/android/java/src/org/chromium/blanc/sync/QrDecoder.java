// Copyright 2026 Bananify Creative. MIT; see LICENSE.

package org.chromium.blanc.sync;

import com.google.zxing.BinaryBitmap;
import com.google.zxing.NotFoundException;
import com.google.zxing.PlanarYUVLuminanceSource;
import com.google.zxing.ReaderException;
import com.google.zxing.common.HybridBinarizer;
import com.google.zxing.qrcode.QRCodeReader;

import org.chromium.build.annotations.NullMarked;
import org.chromium.build.annotations.Nullable;

/** Reads a QR code from a camera frame's brightness plane, on the device. */
@NullMarked
public final class QrDecoder {
    private QrDecoder() {}

    /** The code's text, or null if this frame has none. */
    public static @Nullable String decode(byte[] luma, int rowStride, int width, int height) {
        PlanarYUVLuminanceSource source =
                new PlanarYUVLuminanceSource(luma, rowStride, height, 0, 0, width, height, false);
        try {
            return new QRCodeReader().decode(new BinaryBitmap(new HybridBinarizer(source))).getText();
        } catch (NotFoundException e) {
            return null;
        } catch (ReaderException e) {
            return null;
        }
    }
}
