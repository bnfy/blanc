// Copyright 2026 Bananify Creative. MIT; see LICENSE.

package org.chromium.blanc.sync;

import android.Manifest;
import android.app.Activity;
import android.app.Dialog;
import android.content.Context;
import android.content.pm.PackageManager;
import android.graphics.ImageFormat;
import android.graphics.SurfaceTexture;
import android.hardware.camera2.CameraAccessException;
import android.hardware.camera2.CameraCaptureSession;
import android.hardware.camera2.CameraCharacteristics;
import android.hardware.camera2.CameraDevice;
import android.hardware.camera2.CameraManager;
import android.hardware.camera2.CaptureRequest;
import android.media.Image;
import android.media.ImageReader;
import android.os.Handler;
import android.os.HandlerThread;
import android.view.Gravity;
import android.view.Surface;
import android.view.TextureView;
import android.widget.Button;
import android.widget.FrameLayout;

import org.chromium.base.Callback;
import org.chromium.blanc.island.R;
import org.chromium.build.annotations.NullMarked;
import org.chromium.build.annotations.Nullable;

import java.nio.ByteBuffer;
import java.util.Arrays;

/**
 * Pair with your Blanc, Blanc for iPhone's PairScanner: asks for the camera, then reads frames on
 * the device until one holds a Blanc pairing link. Anything else is ignored; no frame leaves here.
 */
@NullMarked
public final class PairScanner implements SyncSheet.Scanner {
    private static final int WIDTH = 1280;
    private static final int HEIGHT = 720;

    /** Asks Android for a permission through the window, which owns the result. */
    public interface Permissions {
        void request(String permission, Callback<Boolean> done);
    }

    /** Where a press of the button goes. */
    public enum Route { SCANNER, CODE_FIELD }

    /** Pure so it can be tested: no camera or a refusal leads to the code field. */
    public static Route route(boolean hasCamera, boolean allowed) {
        return hasCamera && allowed ? Route.SCANNER : Route.CODE_FIELD;
    }

    /** What a frame's text means: a code to join with, or null to keep looking. */
    public static @Nullable String match(@Nullable String text) {
        return text == null ? null : PairLink.code(text);
    }

    private final Activity mActivity;
    private final Permissions mPermissions;

    public PairScanner(Activity activity, Permissions permissions) {
        mActivity = activity;
        mPermissions = permissions;
    }

    @Override
    public void scan(Callback<@Nullable String> done) {
        boolean hasCamera = mActivity.getPackageManager().hasSystemFeature(PackageManager.FEATURE_CAMERA_ANY);
        if (!hasCamera) {
            done.onResult(null);
            return;
        }
        if (mActivity.checkSelfPermission(Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED) {
            open(done);
            return;
        }
        mPermissions.request(Manifest.permission.CAMERA, allowed -> {
            if (route(true, allowed) == Route.SCANNER) open(done);
            else done.onResult(null);
        });
    }

    private void open(Callback<@Nullable String> done) {
        new Session(mActivity, done).start();
    }

    /** One scan: a preview, a reader on its own thread, and a way out. */
    private static final class Session {
        private final Activity mActivity;
        private final Callback<@Nullable String> mDone;
        private final Dialog mDialog;
        private final TextureView mPreview;
        private final HandlerThread mThread = new HandlerThread("BlancPairScanner");
        private @Nullable Handler mHandler;
        private @Nullable CameraDevice mCamera;
        private @Nullable ImageReader mReader;
        private boolean mFinished;

        Session(Activity activity, Callback<@Nullable String> done) {
            mActivity = activity;
            mDone = done;
            mDialog = new Dialog(activity, android.R.style.Theme_DeviceDefault_NoActionBar_Fullscreen);
            FrameLayout frame = new FrameLayout(activity);
            mPreview = new TextureView(activity);
            frame.addView(mPreview);
            Button type = new Button(activity);
            type.setText(R.string.blanc_ios_settings_enter_code);
            type.setAllCaps(false);
            type.setOnClickListener(v -> finish(null));
            frame.addView(type, new FrameLayout.LayoutParams(
                    FrameLayout.LayoutParams.WRAP_CONTENT, FrameLayout.LayoutParams.WRAP_CONTENT,
                    Gravity.BOTTOM | Gravity.CENTER_HORIZONTAL));
            mDialog.setContentView(frame);
            mDialog.setOnCancelListener(d -> finish(null));
        }

        void start() {
            mDialog.show();
            mThread.start();
            mHandler = new Handler(mThread.getLooper());
            if (mPreview.isAvailable()) {
                openCamera();
                return;
            }
            mPreview.setSurfaceTextureListener(new TextureView.SurfaceTextureListener() {
                @Override
                public void onSurfaceTextureAvailable(SurfaceTexture s, int w, int h) {
                    openCamera();
                }

                @Override public void onSurfaceTextureSizeChanged(SurfaceTexture s, int w, int h) {}

                @Override
                public boolean onSurfaceTextureDestroyed(SurfaceTexture s) {
                    return true;
                }

                @Override public void onSurfaceTextureUpdated(SurfaceTexture s) {}
            });
        }

        private void openCamera() {
            CameraManager manager = (CameraManager) mActivity.getSystemService(Context.CAMERA_SERVICE);
            try {
                String back = null;
                for (String id : manager.getCameraIdList()) {
                    Integer facing = manager.getCameraCharacteristics(id).get(CameraCharacteristics.LENS_FACING);
                    if (back == null || (facing != null && facing == CameraCharacteristics.LENS_FACING_BACK)) back = id;
                }
                if (back == null) {
                    finish(null);
                    return;
                }
                manager.openCamera(back, new CameraDevice.StateCallback() {
                    @Override
                    public void onOpened(CameraDevice camera) {
                        mCamera = camera;
                        capture(camera);
                    }

                    @Override
                    public void onDisconnected(CameraDevice camera) {
                        finish(null);
                    }

                    @Override
                    public void onError(CameraDevice camera, int error) {
                        finish(null);
                    }
                }, mHandler);
            } catch (CameraAccessException | SecurityException e) {
                finish(null);
            }
        }

        private void capture(CameraDevice camera) {
            ImageReader reader = ImageReader.newInstance(WIDTH, HEIGHT, ImageFormat.YUV_420_888, 2);
            mReader = reader;
            reader.setOnImageAvailableListener(this::frame, mHandler);
            SurfaceTexture texture = mPreview.getSurfaceTexture();
            if (texture == null) {
                finish(null);
                return;
            }
            texture.setDefaultBufferSize(WIDTH, HEIGHT);
            Surface preview = new Surface(texture);
            try {
                CaptureRequest.Builder request = camera.createCaptureRequest(CameraDevice.TEMPLATE_PREVIEW);
                request.addTarget(preview);
                request.addTarget(reader.getSurface());
                camera.createCaptureSession(Arrays.asList(preview, reader.getSurface()),
                        new CameraCaptureSession.StateCallback() {
                            @Override
                            public void onConfigured(CameraCaptureSession session) {
                                try {
                                    session.setRepeatingRequest(request.build(), null, mHandler);
                                } catch (CameraAccessException | IllegalStateException e) {
                                    finish(null);
                                }
                            }

                            @Override
                            public void onConfigureFailed(CameraCaptureSession session) {
                                finish(null);
                            }
                        }, mHandler);
            } catch (CameraAccessException | IllegalStateException e) {
                finish(null);
            }
        }

        private void frame(ImageReader reader) {
            try (Image image = reader.acquireLatestImage()) {
                if (image == null) return;
                Image.Plane plane = image.getPlanes()[0];
                ByteBuffer buffer = plane.getBuffer();
                byte[] luma = new byte[buffer.remaining()];
                buffer.get(luma);
                String code = match(QrDecoder.decode(luma, plane.getRowStride(), image.getWidth(), image.getHeight()));
                if (code != null) finish(code);
            } catch (IllegalStateException e) {
                // The reader closed under us: the scan is over.
            }
        }

        private void finish(@Nullable String code) {
            mActivity.runOnUiThread(() -> {
                if (mFinished) return;
                mFinished = true;
                if (mCamera != null) mCamera.close();
                if (mReader != null) mReader.close();
                mThread.quitSafely();
                mDialog.dismiss();
                mDone.onResult(code);
            });
        }
    }
}
