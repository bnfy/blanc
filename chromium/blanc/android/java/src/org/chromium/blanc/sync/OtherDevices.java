// Copyright 2026 Bananify Creative. MIT; see LICENSE.

package org.chromium.blanc.sync;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import org.chromium.base.Callback;
import org.chromium.build.annotations.NullMarked;
import org.chromium.build.annotations.Nullable;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

/**
 * What other devices show this phone: their open tabs, pages sent here and where a page can be
 * sent. The runner holds the truth; this is the copy the palette and the Start Page read.
 */
@NullMarked
public final class OtherDevices {
    /** One open tab on another device. */
    public static final class Page {
        public final String title;
        public final String url;

        Page(String title, String url) {
            this.title = title;
            this.url = url;
        }
    }

    /** Another device and its tabs. */
    public static final class Device {
        public final String name;
        public final List<Page> tabs = new ArrayList<>();

        Device(String name) {
            this.name = name;
        }
    }

    /** A page sent here. */
    public static final class Sent {
        public final String id;
        public final String url;
        public final String title;
        public final String from;
        public final long sentAt;

        Sent(String id, String url, String title, String from, long sentAt) {
            this.id = id;
            this.url = url;
            this.title = title;
            this.from = from;
            this.sentAt = sentAt;
        }
    }

    /** A device this phone can send to. */
    public static final class Target {
        public final String id;
        public final String name;

        Target(String id, String name) {
            this.id = id;
            this.name = name;
        }
    }

    private static List<Device> sDevices = new ArrayList<>();
    private static List<Sent> sSent = new ArrayList<>();
    private static List<Target> sTargets = new ArrayList<>();

    private OtherDevices() {}

    public static List<Device> devices() {
        return sDevices;
    }

    public static List<Sent> sent() {
        return sSent;
    }

    public static List<Target> targets() {
        return sTargets;
    }

    /** A device with no tabs isn't listed; only http(s) pages are offered. */
    static List<Device> parseDevices(String json) throws JSONException {
        List<Device> out = new ArrayList<>();
        JSONArray list = new JSONArray(json);
        for (int i = 0; i < list.length(); i++) {
            JSONObject item = list.getJSONObject(i);
            Device device = new Device(item.optString("name"));
            JSONArray tabs = item.optJSONArray("tabs");
            for (int t = 0; tabs != null && t < tabs.length(); t++) {
                JSONObject tab = tabs.getJSONObject(t);
                String url = tab.optString("url");
                if (web(url)) device.tabs.add(new Page(tab.optString("title"), url));
            }
            if (!device.tabs.isEmpty()) out.add(device);
        }
        return out;
    }

    static List<Sent> parseSent(String json) throws JSONException {
        List<Sent> out = new ArrayList<>();
        JSONArray list = new JSONArray(json);
        for (int i = 0; i < list.length(); i++) {
            JSONObject item = list.getJSONObject(i);
            String url = item.optString("url");
            if (web(url)) {
                out.add(new Sent(item.optString("id"), url, item.optString("title"),
                        item.optString("fromName"), item.optLong("sentAt")));
            }
        }
        return out;
    }

    static List<Target> parseTargets(String json) throws JSONException {
        List<Target> out = new ArrayList<>();
        JSONArray list = new JSONArray(json);
        for (int i = 0; i < list.length(); i++) {
            JSONObject item = list.getJSONObject(i);
            out.add(new Target(item.optString("id"), item.optString("name")));
        }
        return out;
    }

    private static boolean web(String url) {
        String lower = url.toLowerCase(Locale.ROOT);
        return lower.startsWith("https://") || lower.startsWith("http://");
    }

    /** The target named `name`, in any case, as /send reads it. */
    public static @Nullable Target target(String name) {
        for (Target target : sTargets) if (target.name.equalsIgnoreCase(name.trim())) return target;
        return null;
    }

    private static @Nullable String value(String reply) {
        try {
            JSONObject outer = new JSONObject(reply);
            return outer.optBoolean("ok") ? String.valueOf(outer.opt("value")) : null;
        } catch (JSONException e) {
            return null;
        }
    }

    /** Reads all three lists from the runner, and hands the Start Page its copy. */
    static void refresh() {
        SyncBridge.call("sync.listRemoteDevices", "[]", devices -> {
            SyncBridge.call("sync.listSentToThisDevice", "[]", sent -> {
                SyncBridge.call("sync.listSendTargets", "[]", targets -> {
                    String d = value(devices);
                    String s = value(sent);
                    String t = value(targets);
                    if (d == null || s == null || t == null) return;
                    try {
                        sDevices = parseDevices(d);
                        sSent = parseSent(s);
                        sTargets = parseTargets(t);
                        SyncBridge.setStartData(d, s);
                    } catch (JSONException e) {
                        // A reply that doesn't parse leaves the last good copy.
                    }
                });
            });
        });
    }

    /** A sent page opened or dismissed goes from this phone's list. */
    public static void hide(String id) {
        List<Sent> kept = new ArrayList<>();
        for (Sent item : sSent) if (!item.id.equals(id)) kept.add(item);
        sSent = kept;
        SyncBridge.call("sync.hideSentItem", new JSONArray().put(id).toString(), reply -> refresh());
    }

    /** Sends a page; `done` gets shipping's status: sent, unavailable, failed or invalid. */
    public static void send(String url, String title, Target to, Callback<String> done) {
        try {
            String args = new JSONArray().put(new JSONObject().put("url", url).put("title", title).put("to", to.id)).toString();
            SyncBridge.call("sync.sendTab", args, reply -> {
                try {
                    JSONObject outer = new JSONObject(reply);
                    JSONObject result = outer.optJSONObject("value");
                    done.onResult(result == null ? "failed" : result.optString("status", "failed"));
                } catch (JSONException e) {
                    done.onResult("failed");
                }
            });
        } catch (JSONException e) {
            done.onResult("failed");
        }
    }
}
