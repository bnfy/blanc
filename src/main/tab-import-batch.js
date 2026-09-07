// Pure helpers for F39 quiet-tab batch insertion and group resolution.
const crypto = require('node:crypto');
const { normalizeGroupName } = require('./tab-import-apply');

function computeBatchInsertAt(tabOrder, activeTabId) {
  if (!Array.isArray(tabOrder) || !tabOrder.length) return 0;
  if (!activeTabId) return tabOrder.length;
  const index = tabOrder.indexOf(activeTabId);
  return index === -1 ? tabOrder.length : index + 1;
}

function reorderTabOrderForBatch(tabOrder, createdIds, insertAt) {
  const order = [...tabOrder];
  for (const id of createdIds) {
    const index = order.indexOf(id);
    if (index !== -1) order.splice(index, 1);
  }
  const at = Number.isInteger(insertAt)
    ? Math.max(0, Math.min(insertAt, order.length))
    : order.length;
  order.splice(at, 0, ...createdIds);
  return order;
}

function resolveBatchGroupId(groups, groupName, createdGroupIds, randomId = () => crypto.randomUUID()) {
  const name = normalizeGroupName(groupName);
  if (!name) return null;
  const existing = groups.find((group) => group.name === name);
  if (existing) return existing.id;
  const id = String(randomId() ?? '');
  if (!id) return null;
  groups.push({ id, name, collapsed: false });
  createdGroupIds.push(id);
  return id;
}

module.exports = {
  computeBatchInsertAt,
  reorderTabOrderForBatch,
  resolveBatchGroupId,
};
