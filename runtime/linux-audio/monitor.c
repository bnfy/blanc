/* Blanc computer-audio bridge. MIT; libpulse retains its own license.
 * Captures only the current output's monitor, never a microphone. PCM is
 * streamed to the parent, never written to a file. No shell commands. */
#include <pulse/pulseaudio.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>

static pa_mainloop *loop;
static pa_context *context;
static pa_stream *stream;
static char *output_name;
static int connecting = 0;

static void fail(void) { fprintf(stderr, "ERROR audio-monitor\n"); pa_mainloop_quit(loop, 1); }
static void read_audio(pa_stream *s, size_t length, void *unused) {
  (void)length; (void)unused;
  const void *data; size_t count;
  if (pa_stream_peek(s, &data, &count) < 0) { fail(); return; }
  if (data && count && fwrite(data, 1, count, stdout) != count) { fail(); return; }
  if (!data && count) {
    static const unsigned char silence[4096] = {0};
    for (size_t left = count; left;) {
      size_t n = left < sizeof(silence) ? left : sizeof(silence);
      if (fwrite(silence, 1, n, stdout) != n) { fail(); return; }
      left -= n;
    }
  }
  if (count) { fflush(stdout); pa_stream_drop(s); }
}
static void stream_state(pa_stream *s, void *unused) {
  (void)unused;
  switch (pa_stream_get_state(s)) {
    case PA_STREAM_READY: fprintf(stderr, "READY\n"); break;
    case PA_STREAM_FAILED: case PA_STREAM_TERMINATED: fail(); break;
    default: break;
  }
}
static void sink_info(pa_context *c, const pa_sink_info *info, int eol, void *unused) {
  (void)c; (void)unused;
  if (eol < 0 || (!info && !stream)) { fail(); return; }
  if (eol || stream) return;
  if (!info->monitor_source_name || info->monitor_source == PA_INVALID_INDEX) { fail(); return; }
  const pa_sample_spec spec = { PA_SAMPLE_FLOAT32LE, 48000, 2 };
  pa_buffer_attr attr = { .maxlength = 192000, .tlength = (uint32_t)-1,
    .prebuf = (uint32_t)-1, .minreq = (uint32_t)-1, .fragsize = 3840 };
  stream = pa_stream_new(context, "Blanc computer audio", &spec, NULL);
  if (!stream) { fail(); return; }
  pa_stream_set_read_callback(stream, read_audio, NULL);
  pa_stream_set_state_callback(stream, stream_state, NULL);
  if (pa_stream_connect_record(stream, info->monitor_source_name, &attr,
      PA_STREAM_DONT_MOVE | PA_STREAM_ADJUST_LATENCY) < 0) fail();
}
static void server_info(pa_context *c, const pa_server_info *info, void *unused) {
  (void)unused;
  if (!info || !info->default_sink_name) { fail(); return; }
  if (output_name && strcmp(output_name, info->default_sink_name)) {
    /* Restart with fresh consent instead of silently changing the source. */
    fprintf(stderr, "ERROR output-changed\n"); pa_mainloop_quit(loop, 1); return;
  }
  if (!connecting) {
    connecting = 1;
    output_name = strdup(info->default_sink_name);
    if (!output_name) { fail(); return; }
    pa_operation *op = pa_context_get_sink_info_by_name(c, output_name, sink_info, NULL);
    if (op) pa_operation_unref(op); else fail();
  }
}
static void subscribed(pa_context *c, pa_subscription_event_type_t event, uint32_t index, void *unused) {
  (void)index; (void)unused;
  if ((event & PA_SUBSCRIPTION_EVENT_FACILITY_MASK) == PA_SUBSCRIPTION_EVENT_SERVER) {
    pa_operation *op = pa_context_get_server_info(c, server_info, NULL);
    if (op) pa_operation_unref(op); else fail();
  }
}
static void context_state(pa_context *c, void *unused) {
  (void)unused;
  switch (pa_context_get_state(c)) {
    case PA_CONTEXT_READY: {
      pa_context_set_subscribe_callback(c, subscribed, NULL);
      pa_operation *op = pa_context_subscribe(c, PA_SUBSCRIPTION_MASK_SERVER, NULL, NULL);
      if (op) pa_operation_unref(op);
      op = pa_context_get_server_info(c, server_info, NULL);
      if (op) pa_operation_unref(op); else fail();
      break;
    }
    case PA_CONTEXT_FAILED: case PA_CONTEXT_TERMINATED: fail(); break;
    default: break;
  }
}
int main(void) {
  if (isatty(STDOUT_FILENO)) { fprintf(stderr, "Audio output requires a pipe.\n"); return 2; }
  loop = pa_mainloop_new();
  if (!loop) return 1;
  context = pa_context_new(pa_mainloop_get_api(loop), "Blanc screen sharing");
  if (!context) { pa_mainloop_free(loop); return 1; }
  pa_context_set_state_callback(context, context_state, NULL);
  if (pa_context_connect(context, NULL, PA_CONTEXT_NOAUTOSPAWN, NULL) < 0) return 1;
  int result = 1;
  pa_mainloop_run(loop, &result);
  if (stream) { pa_stream_disconnect(stream); pa_stream_unref(stream); }
  pa_context_disconnect(context); pa_context_unref(context);
  pa_mainloop_free(loop); free(output_name);
  return result;
}
