// Centrare le facce nelle foto (founder, 21/11/2026, grill-me D1–D13).
// When a photo is uploaded the phone finds the faces on the device (MediaPipe
// Face Detector, short range model, vendored in assets/vendor/mediapipe and
// loaded only here, never in the offline shell) and saves one point: where to
// keep the photo in view when it is cropped (moments / moment_photos
// focus_x, focus_y, 0-100). Nothing about the faces is kept.
//   - all the faces count as one group; if the group is too spread out for a
//     crop, the biggest face wins;
//   - faces smaller than 3% of the photo do not count (a face far away in a
//     landscape is not the subject);
//   - no face: 50/50, the centre, as before;
//   - where the photo is cropped (object-fit: cover) the faces sit at about
//     40% from the top, centred left to right (place()).
(function (w, d) {
  'use strict';

  const BASE = '/assets/vendor/mediapipe';
  const MIN_FACE_AREA = 0.03;
  const MAX_GROUP_SPAN = 0.7;
  const FACE_TOP = 0.4;
  const clamp01 = (v) => Math.max(0, Math.min(1, v));
  const pct = (v) => Math.round(clamp01(v) * 100);

  // Pure: the point to keep in view, from the detections of a w x h photo.
  // Returns { x, y } in 0-100.
  function focusFrom(detections, width, height) {
    const W = Number(width), H = Number(height);
    if (!(W > 0 && H > 0)) return { x: 50, y: 50 };
    const faces = (Array.isArray(detections) ? detections : [])
      .map((det) => det?.boundingBox || det)
      .filter((b) => b && b.width > 0 && b.height > 0)
      .map((b) => ({ x0: b.originX / W, y0: b.originY / H, x1: (b.originX + b.width) / W, y1: (b.originY + b.height) / H }))
      .filter((f) => (f.x1 - f.x0) * (f.y1 - f.y0) >= MIN_FACE_AREA);
    if (!faces.length) return { x: 50, y: 50 };
    let box = faces.reduce((g, f) => ({ x0: Math.min(g.x0, f.x0), y0: Math.min(g.y0, f.y0), x1: Math.max(g.x1, f.x1), y1: Math.max(g.y1, f.y1) }));
    if (box.x1 - box.x0 > MAX_GROUP_SPAN || box.y1 - box.y0 > MAX_GROUP_SPAN) {
      box = faces.reduce((a, b) => ((b.x1 - b.x0) * (b.y1 - b.y0) > (a.x1 - a.x0) * (a.y1 - a.y0) ? b : a));
    }
    return { x: pct((box.x0 + box.x1) / 2), y: pct((box.y0 + box.y1) / 2) };
  }

  // Pure: object-position (in %) that puts the point (fx, fy in 0-100) of a
  // natW x natH photo, shown with object-fit: cover in a boxW x boxH frame,
  // centred left to right and at FACE_TOP from the top, as far as the photo
  // allows. Null when there is nothing to move.
  function positionFor(fx, fy, natW, natH, boxW, boxH) {
    if (!(natW > 0 && natH > 0 && boxW > 0 && boxH > 0)) return null;
    const s = Math.max(boxW / natW, boxH / natH);
    const W = natW * s, H = natH * s;
    const along = (f, size, box, at) => (size - box < 0.5 ? 0.5 : clamp01((f * size - at * box) / (size - box)));
    const px = along(fx / 100, W, boxW, 0.5), py = along(fy / 100, H, boxH, FACE_TOP);
    return `${(px * 100).toFixed(1)}% ${(py * 100).toFixed(1)}%`;
  }

  // An <img data-us-focus="x,y"> takes its position when it has loaded.
  function place(img) {
    const m = /^(\d{1,3}),(\d{1,3})$/.exec(img?.dataset?.usFocus || '');
    if (!m || !img.naturalWidth) return;
    const pos = positionFor(+m[1], +m[2], img.naturalWidth, img.naturalHeight, img.clientWidth, img.clientHeight);
    img.style.objectPosition = pos || '';
  }
  function attr(row) {
    const x = Number(row?.focus_x), y = Number(row?.focus_y);
    return row && row.focus_x != null && Number.isFinite(x) && Number.isFinite(y) ? `${Math.round(x)},${Math.round(y)}` : '';
  }
  // Set (or clear) the point on an image already in the page.
  function apply(img, row) {
    if (!img) return;
    const v = attr(row);
    if (!v) { delete img.dataset.usFocus; img.style.objectPosition = ''; return; }
    img.dataset.usFocus = v;
    if (img.complete) place(img);
  }
  d.addEventListener('load', (e) => { if (e.target?.tagName === 'IMG' && e.target.dataset?.usFocus) place(e.target); }, true);

  // ---------------------------------------------------------------- finding the faces
  let detectorPromise = null;
  function detector() {
    if (!detectorPromise) {
      detectorPromise = (async () => {
        const { FilesetResolver, FaceDetector } = await import(`${BASE}/vision_bundle.mjs`);
        const files = await FilesetResolver.forVisionTasks(`${BASE}/wasm`);
        return FaceDetector.createFromOptions(files, {
          baseOptions: { modelAssetPath: `${BASE}/blaze_face_short_range.tflite`, delegate: 'CPU' },
          runningMode: 'IMAGE',
          minDetectionConfidence: 0.5,
        });
      })().catch((error) => { detectorPromise = null; throw error; });
    }
    return detectorPromise;
  }
  // The point for a photo (File, Blob or image URL). Null if it cannot look
  // (an old WebView, no WebAssembly): the photo then stays as it is.
  async function find(source) {
    if (typeof w.WebAssembly !== 'object' || typeof w.createImageBitmap !== 'function') return null;
    try {
      const blob = typeof source === 'string' ? await (await fetch(source)).blob() : source;
      const bitmap = await createImageBitmap(blob);
      try {
        const faces = (await detector()).detect(bitmap);
        return focusFrom(faces?.detections, bitmap.width, bitmap.height);
      } finally { bitmap.close?.(); }
    } catch (error) {
      console.warn('[US Foto] faces', error);
      return null;
    }
  }

  // Look at a photo just uploaded and save its point on the row (the author's
  // own row: moments_update_own / moment_photos_update_own).
  async function saveFor(table, id, source) {
    // app.js keeps the client in a global const (sb), not on window.
    const client = (typeof sb !== 'undefined' && sb) || w.sb;
    if (!client || !id || !source || !['moments', 'moment_photos'].includes(table)) return null;
    const focus = await find(source);
    if (!focus) return null;
    const { error } = await client.from(table).update({ focus_x: focus.x, focus_y: focus.y }).eq('id', id);
    if (error) { console.warn('[US Foto] focus save', error); return null; }
    w.dispatchEvent(new CustomEvent('us:photo-focus', { detail: { table, id, ...focus } }));
    return focus;
  }

  w.UsPhotoFocus = Object.freeze({ focusFrom, positionFor, place, apply, attr, find, saveFor, MIN_FACE_AREA, MAX_GROUP_SPAN, FACE_TOP });
})(window, document);
