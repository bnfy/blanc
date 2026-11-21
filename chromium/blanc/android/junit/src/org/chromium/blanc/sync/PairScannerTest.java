// Copyright 2026 Bananify Creative. MIT; see LICENSE.

package org.chromium.blanc.sync;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNull;

import com.google.zxing.BarcodeFormat;
import com.google.zxing.WriterException;
import com.google.zxing.common.BitMatrix;
import com.google.zxing.qrcode.QRCodeWriter;

import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.annotation.Config;

import org.chromium.base.test.BaseRobolectricTestRunner;

import java.util.Arrays;

@RunWith(BaseRobolectricTestRunner.class)
@Config(manifest = Config.NONE)
public class PairScannerTest {
    private static final int SIZE = 400;

    // A camera's brightness plane, padded past the width as cameras do.
    private static byte[] frame(String text, int stride) throws WriterException {
        BitMatrix code = new QRCodeWriter().encode(text, BarcodeFormat.QR_CODE, SIZE, SIZE);
        byte[] luma = new byte[stride * SIZE];
        Arrays.fill(luma, (byte) 0xff);
        for (int y = 0; y < SIZE; y++) {
            for (int x = 0; x < SIZE; x++) luma[y * stride + x] = (byte) (code.get(x, y) ? 0 : 0xff);
        }
        return luma;
    }

    @Test
    public void aFrameWithAPairLinkGivesItsCode() throws WriterException {
        String text = QrDecoder.decode(frame("https://blanc.day/pair#K7MR4PX2", 448), 448, SIZE, SIZE);
        assertEquals("K7MR4PX2", PairScanner.match(text));
    }

    @Test
    public void anotherCodeIsIgnored() throws WriterException {
        String text = QrDecoder.decode(frame("https://example.org/", SIZE), SIZE, SIZE, SIZE);
        assertEquals("https://example.org/", text);
        assertNull(PairScanner.match(text));
    }

    @Test
    public void aBlankFrameHasNoCode() {
        byte[] blank = new byte[SIZE * SIZE];
        assertNull(QrDecoder.decode(blank, SIZE, SIZE, SIZE));
    }

    @Test
    public void noCameraOrARefusalLeadsToTheCodeField() {
        assertEquals(PairScanner.Route.SCANNER, PairScanner.route(true, true));
        assertEquals(PairScanner.Route.CODE_FIELD, PairScanner.route(false, true));
        assertEquals(PairScanner.Route.CODE_FIELD, PairScanner.route(true, false));
    }
}
