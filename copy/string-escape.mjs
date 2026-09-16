// Android string resources use backslash escapes inside XML text.
export const xmlEsc = (s) => s.replace(/\\/g, '\\\\')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '\\"').replace(/'/g, "\\'");
