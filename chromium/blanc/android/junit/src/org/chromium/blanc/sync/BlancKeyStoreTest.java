// Copyright 2026 Bananify Creative. MIT; see LICENSE.

package org.chromium.blanc.sync;

import static org.junit.Assert.assertArrayEquals;
import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;

import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.annotation.Config;

import org.chromium.base.test.BaseRobolectricTestRunner;

import java.security.GeneralSecurityException;
import java.util.Arrays;

import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;

@RunWith(BaseRobolectricTestRunner.class)
@Config(manifest = Config.NONE)
public class BlancKeyStoreTest {
    private static final class MemoryKeys implements BlancKeyStore.Keys {
        SecretKey mKey;
        int mCreated;

        @Override
        public SecretKey existing() {
            return mKey;
        }

        @Override
        public SecretKey create() throws GeneralSecurityException {
            KeyGenerator generator = KeyGenerator.getInstance("AES");
            generator.init(256);
            mCreated++;
            mKey = generator.generateKey();
            return mKey;
        }
    }

    private final byte[] mSecret = {1, 2, 3, 4, 5, 6, 7, 8};

    @Test
    public void protectThenUnprotectRoundTrips() {
        BlancKeyStore store = new BlancKeyStore(new MemoryKeys());
        byte[] sealed = store.protect(mSecret);
        assertNotNull(sealed);
        assertFalse(Arrays.equals(mSecret, Arrays.copyOfRange(sealed, 12, 20)));
        assertArrayEquals(mSecret, store.unprotect(sealed));
    }

    @Test
    public void aMissingKeyReturnsNullAndMakesNoNewKey() {
        MemoryKeys keys = new MemoryKeys();
        BlancKeyStore store = new BlancKeyStore(keys);
        byte[] sealed = store.protect(mSecret);
        keys.mKey = null;
        assertNull(store.unprotect(sealed));
        assertEquals(1, keys.mCreated);
    }

    @Test
    public void anotherKeysBytesReturnNull() throws GeneralSecurityException {
        MemoryKeys keys = new MemoryKeys();
        byte[] sealed = new BlancKeyStore(keys).protect(mSecret);
        keys.create();
        assertNull(new BlancKeyStore(keys).unprotect(sealed));
    }

    @Test
    public void tooFewBytesReturnNull() {
        assertNull(new BlancKeyStore(new MemoryKeys()).unprotect(new byte[12]));
    }
}
