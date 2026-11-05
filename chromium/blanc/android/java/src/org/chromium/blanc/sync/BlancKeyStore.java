// Copyright 2026 Bananify Creative. MIT; see LICENSE.

package org.chromium.blanc.sync;

import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;

import org.chromium.build.annotations.NullMarked;
import org.chromium.build.annotations.Nullable;

import java.nio.ByteBuffer;
import java.security.GeneralSecurityException;
import java.security.KeyStore;

import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

/**
 * Wraps the sync key with a key that never leaves Android Keystore. A key made on another phone
 * can't be opened here, which is what a restored backup needs: Sync turns off and asks for a code.
 */
@NullMarked
public final class BlancKeyStore {
    static final String ALIAS = "blanc-sync-v1";
    private static final int IV_BYTES = 12;
    private static final int TAG_BITS = 128;

    /** Where the wrapping key lives. Tests use a key in memory. */
    public interface Keys {
        @Nullable SecretKey existing() throws GeneralSecurityException;

        SecretKey create() throws GeneralSecurityException;
    }

    private final Keys mKeys;

    public BlancKeyStore() {
        this(new AndroidKeys());
    }

    BlancKeyStore(Keys keys) {
        mKeys = keys;
    }

    /** The IV and ciphertext, or null if Keystore refuses. */
    public byte @Nullable [] protect(byte[] data) {
        try {
            SecretKey key = mKeys.existing();
            if (key == null) key = mKeys.create();
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.ENCRYPT_MODE, key);
            byte[] sealed = cipher.doFinal(data);
            return ByteBuffer.allocate(IV_BYTES + sealed.length)
                    .put(cipher.getIV())
                    .put(sealed)
                    .array();
        } catch (GeneralSecurityException e) {
            return null;
        }
    }

    /** The data, or null if the key is gone or the bytes aren't ours. Never makes a key. */
    public byte @Nullable [] unprotect(byte[] data) {
        if (data.length <= IV_BYTES) return null;
        try {
            SecretKey key = mKeys.existing();
            if (key == null) return null;
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(
                    Cipher.DECRYPT_MODE, key, new GCMParameterSpec(TAG_BITS, data, 0, IV_BYTES));
            return cipher.doFinal(data, IV_BYTES, data.length - IV_BYTES);
        } catch (GeneralSecurityException e) {
            return null;
        }
    }

    private static final class AndroidKeys implements Keys {
        private static final String PROVIDER = "AndroidKeyStore";

        @Override
        public @Nullable SecretKey existing() throws GeneralSecurityException {
            try {
                KeyStore store = KeyStore.getInstance(PROVIDER);
                store.load(null);
                return (SecretKey) store.getKey(ALIAS, null);
            } catch (java.io.IOException e) {
                throw new GeneralSecurityException(e);
            }
        }

        @Override
        public SecretKey create() throws GeneralSecurityException {
            KeyGenerator generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, PROVIDER);
            generator.init(
                    new KeyGenParameterSpec.Builder(
                                    ALIAS,
                                    KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
                            .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                            .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                            .setKeySize(256)
                            .build());
            return generator.generateKey();
        }
    }
}
