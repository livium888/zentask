package app.zentask.capture;

import android.content.ClipData;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;

/**
 * Receiving something shared from another app.
 *
 * A photo taken in the camera roll, a post in a browser, a message in a chat —
 * the share sheet is the shortest path from "I should do something about this"
 * to it being on the list, and it costs the user one tap in an app they were
 * already looking at.
 *
 * A shared image arrives as a content:// URI belonging to the sending app,
 * which our OCR cannot open and which stops being readable the moment that app
 * revokes the grant. It is copied into our own cache directory first, and the
 * absolute path to that copy is what the web layer gets.
 */
@CapacitorPlugin(name = "ShareTarget")
public class ShareTargetPlugin extends Plugin {

    private String pendingText;
    private String pendingImagePath;

    @Override
    public void load() {
        // A share that launches the app cold arrives on the starting intent.
        consume(getActivity().getIntent());
    }

    @Override
    protected void handleOnNewIntent(Intent intent) {
        super.handleOnNewIntent(intent);
        // A share into an app that is already running arrives here instead.
        // MainActivity is singleTask, so this is the usual case in practice.
        if (consume(intent)) {
            notifyListeners("shareReceived", buildResult());
        }
    }

    /** What was shared, if anything. Safe to call when nothing was. */
    @PluginMethod
    public void getShared(PluginCall call) {
        call.resolve(buildResult());
    }

    /**
     * Forget the current share.
     *
     * Called once the web layer has turned it into a review, so that returning
     * to the app later does not offer the same thing a second time.
     */
    @PluginMethod
    public void clear(PluginCall call) {
        pendingText = null;
        pendingImagePath = null;
        call.resolve();
    }

    private JSObject buildResult() {
        JSObject result = new JSObject();
        result.put("text", pendingText);
        result.put("imagePath", pendingImagePath);
        return result;
    }

    /** Returns true when the intent carried something we can use. */
    private boolean consume(Intent intent) {
        if (intent == null) return false;

        String action = intent.getAction();
        if (!Intent.ACTION_SEND.equals(action) && !Intent.ACTION_SEND_MULTIPLE.equals(action)) {
            return false;
        }

        String text = intent.getStringExtra(Intent.EXTRA_TEXT);
        if (text == null) text = intent.getStringExtra(Intent.EXTRA_SUBJECT);

        Uri image = firstImage(intent);
        String copied = image == null ? null : copyIntoCache(image);

        if (text == null && copied == null) return false;

        pendingText = text;
        pendingImagePath = copied;

        // The same intent is delivered again on rotation or relaunch; clearing
        // it stops one share becoming two.
        intent.removeExtra(Intent.EXTRA_TEXT);
        intent.removeExtra(Intent.EXTRA_STREAM);
        intent.setAction(null);
        return true;
    }

    private Uri firstImage(Intent intent) {
        String type = intent.getType();
        if (type != null && !type.startsWith("image/")) return null;

        Uri single = getParcelable(intent);
        if (single != null) return single;

        ClipData clip = intent.getClipData();
        if (clip != null && clip.getItemCount() > 0) {
            // Only the first: one share is one thing to decide about, and a
            // queue of ten photos is the opposite of what this app is for.
            return clip.getItemAt(0).getUri();
        }
        return null;
    }

    @SuppressWarnings("deprecation")
    private Uri getParcelable(Intent intent) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            return intent.getParcelableExtra(Intent.EXTRA_STREAM, Uri.class);
        }
        return intent.getParcelableExtra(Intent.EXTRA_STREAM);
    }

    /** Copy a shared URI into our cache so it stays readable and OCR can open it. */
    private String copyIntoCache(Uri source) {
        File directory = new File(getContext().getCacheDir(), "shared");
        if (!directory.exists() && !directory.mkdirs()) return null;

        File destination = new File(directory, "share-" + System.currentTimeMillis() + ".jpg");

        try (InputStream in = getContext().getContentResolver().openInputStream(source);
             OutputStream out = new FileOutputStream(destination)) {
            if (in == null) return null;
            byte[] buffer = new byte[8192];
            int read;
            while ((read = in.read(buffer)) != -1) {
                out.write(buffer, 0, read);
            }
        } catch (IOException | SecurityException e) {
            // A revoked grant or a sender that has already gone away. Nothing
            // to recover: the user simply sees that nothing was captured.
            return null;
        }

        return destination.getAbsolutePath();
    }
}
