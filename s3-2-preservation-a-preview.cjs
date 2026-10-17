// S3.2 product decision A — non-executable lifecycle preview.
// This module NEVER queries, updates, exports or deletes data.
// It classifies metadata only; all real actions require a separate
// audited server-side authority, media rights review and retention policy.
'use strict';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ITEM_KIND = new Set(['actor-personal', 'partner-personal', 'shared', 'actor-device']);
const ACTION = Object.freeze({
  ERASE_ACTOR_PERSONAL: 'REVIEW_ERASURE_OF_ACTOR_PERSONAL_DATA',
  PRESERVE_PARTNER_PERSONAL: 'DO_NOT_DELETE_PARTNER_PERSONAL_DATA',
  SHARED_ELIGIBLE: 'REVIEW_SCOPED_SHARED_PRESERVATION',
  SHARED_SENSITIVE: 'BLOCK_PENDING_SENSITIVE_CONTENT_REVIEW',
  RETIRE_DEVICE: 'REVIEW_TOKEN_REVOCATION'
});
const ERROR = Object.freeze({ status: 'INVALID_OR_UNAUTHORIZED_PREVIEW', items: Object.freeze([]), executable: false });

function previewPreservationA(input = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return ERROR;
  const { actorId, partnerId, coupleId, memberIds, items } = input;
  // Client data/metadata is NEVER an authority. Membership arguments
  // are shape-checked solely to reject malformed previews; the real
  // future server operation must re-fetch identity + membership itself.
  if (![actorId, partnerId, coupleId].every(v=>typeof v==='string' && UUID.test(v))
    || actorId===partnerId
    || !Array.isArray(memberIds) || memberIds.length!==2
    || new Set(memberIds).size!==2
    || !memberIds.includes(actorId) || !memberIds.includes(partnerId)
    || !Array.isArray(items) || items.length>500) return ERROR;
  const seen = new Set();
  const entries = [];
  for (const item of items) {
    if (!item || typeof item!=='object'
      || typeof item.id!=='string' || !UUID.test(item.id) || seen.has(item.id)
      || item.coupleId!==coupleId || !ITEM_KIND.has(item.kind)) return ERROR;
    seen.add(item.id);
    // Explicit owner assertions are part of the preview input only.
    // Never infer that both partners consent merely from "shared".
    if (item.kind==='actor-personal' || item.kind==='actor-device') {
      if (item.subjectId!==actorId) return ERROR;
      entries.push({ id:item.id, proposedAction:item.kind==='actor-device'
        ? ACTION.RETIRE_DEVICE : ACTION.ERASE_ACTOR_PERSONAL });
    } else if (item.kind==='partner-personal') {
      if (item.subjectId!==partnerId) return ERROR;
      entries.push({ id:item.id, proposedAction:ACTION.PRESERVE_PARTNER_PERSONAL });
    } else {
      if (item.subjectId!==null || typeof item.rightsReviewed!=='boolean'
        || typeof item.sensitive!=='boolean') return ERROR;
      entries.push({ id:item.id, proposedAction:item.sensitive || !item.rightsReviewed
        ? ACTION.SHARED_SENSITIVE : ACTION.SHARED_ELIGIBLE });
    }
  }
  return Object.freeze({
    status: 'NON_EXECUTABLE_REVIEW_REQUIRED',
    productDecision: 'A',
    executable: false,
    // Deliberately no actor names, couple data, credentials, tokens or payloads.
    items: Object.freeze(entries.map(x=>Object.freeze(x)))
  });
}
module.exports = Object.freeze({previewPreservationA, ACTION});
