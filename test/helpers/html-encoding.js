function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character]);
}

// JSON string escaping alone does not prevent an HTML parser from seeing a
// closing script tag. Preserve the value while removing literal tag starts.
function scriptJson(value) {
  return JSON.stringify(value).replace(/</g, '\\u003c');
}

module.exports = { escapeHtml, scriptJson };
