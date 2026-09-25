// US · Noi — Scriptable relationship/photo widget. No private media beyond the canonical Home photo.
const SUPABASE = "https://iiakdfsxpywdkxravqjh.supabase.co";
const APP_URL = "https://usfinal.vercel.app/";
const STATE_KEY = "US_WIDGET_STATE_TOKEN";
const THINK_KEY = "US_WIDGET_THINK_TOKEN";
const DEVICE_KEY = "US_WIDGET_DEVICE_HASH";
const CACHE_DIR = "US-Noi";
const STATE_FILE = "state.json";
const PHOTO_FILE = "home-photo.jpg";
const fm = FileManager.local();
const cacheDir = fm.joinPath(fm.documentsDirectory(), CACHE_DIR);
if (!fm.fileExists(cacheDir)) fm.createDirectory(cacheDir, true);
const statePath = fm.joinPath(cacheDir, STATE_FILE);
const photoPath = fm.joinPath(cacheDir, PHOTO_FILE);
let credentialRejectedThisRun = false;

function randomDeviceHash() {
  return (UUID.string().replace(/-/g, "") + UUID.string().replace(/-/g, "")).toLowerCase();
}

async function exchangeSetupCode() {
  const alert = new Alert();
  alert.title = "Configura US · Scriptable";
  alert.message = "In US apri Impostazioni → Widget US → Configura Scriptable. Incolla qui il codice monouso (scade dopo 10 minuti).";
  alert.addTextField("Codice monouso", "");
  alert.addAction("Collega widget");
  alert.addCancelAction("Annulla");
  if (await alert.presentAlert() === -1) throw new Error("setup_cancelled");
  const setupCode = alert.textFieldValue(0).trim();
  if (!/^[A-Za-z0-9_-]{43}$/.test(setupCode)) throw new Error("invalid_setup_code");
  const deviceIdHash = Keychain.contains(DEVICE_KEY) ? Keychain.get(DEVICE_KEY) : randomDeviceHash();
  if (!/^[a-f0-9]{64}$/.test(deviceIdHash || "")) throw new Error("invalid_device");
  Keychain.set(DEVICE_KEY, deviceIdHash);
  const req = new Request(`${SUPABASE}/functions/v1/widget-scriptable-setup`);
  req.method = "POST";
  req.headers = { "Content-Type": "application/json", "Cache-Control": "no-store" };
  req.body = JSON.stringify({ operation: "exchange", setupCode, deviceIdHash });
  req.timeoutInterval = 20;
  const pair = await req.loadJSON();
  const status = req.response ? req.response.statusCode : 0;
  if (status < 200 || status >= 300) throw new Error(pair && pair.error ? pair.error : "setup_exchange_failed");
  if (!pair || !/^[A-Za-z0-9_-]{43}$/.test(pair.stateToken || "") || !/^[A-Za-z0-9_-]{43}$/.test(pair.thinkToken || "")) {
    throw new Error("invalid_credential_bundle");
  }
  Keychain.set(STATE_KEY, pair.stateToken);
  Keychain.set(THINK_KEY, pair.thinkToken);
}

function clearCredentials() {
  [STATE_KEY, THINK_KEY].forEach((key) => { if (Keychain.contains(key)) Keychain.remove(key); });
}

function hasWidgetCredentials() {
  return Keychain.contains(STATE_KEY) && Keychain.contains(THINK_KEY) && Keychain.contains(DEVICE_KEY);
}

function purgeCachedPrivateData() {
  [statePath, photoPath].forEach((path) => {
    try { if (fm.fileExists(path)) fm.remove(path); } catch (_) {}
  });
}

function handleCredentialFailure(error) {
  if (!error || error.status !== 401) return false;
  clearCredentials();
  purgeCachedPrivateData();
  credentialRejectedThisRun = true;
  return true;
}

async function ensureCredentials(allowPrompt) {
  if (hasWidgetCredentials()) {
    try { return await requestState(); }
    catch (error) {
      if (!handleCredentialFailure(error)) throw error;
    }
  }
  purgeCachedPrivateData();
  if (!allowPrompt) throw new Error("setup_required");
  await exchangeSetupCode();
  const state = await requestState();
  const done = new Alert();
  done.title = "US collegato";
  done.message = "Entrambi i widget sono pronti. Questo codice monouso non è più valido.";
  done.addAction("Continua");
  await done.presentAlert();
  return state;
}

async function requestState() {
  const req = new Request(`${SUPABASE}/functions/v1/us-widget-state`);
  req.method = "GET";
  req.headers = { "x-us-widget-token": Keychain.get(STATE_KEY), "Cache-Control": "no-store" };
  req.timeoutInterval = 20;
  const response = await req.loadJSON();
  const status = req.response ? req.response.statusCode : 0;
  if (status < 200 || status >= 300) {
    const error = new Error(response && response.error ? response.error : "state_unavailable");
    error.status = status;
    throw error;
  }
  credentialRejectedThisRun = false;
  return response;
}

function minimalState(source) {
  const user = source && source.user ? source.user : {};
  const relationship = source && source.relationship ? source.relationship : {};
  const days = Number(relationship.daysTogether);
  return {
    displayName: String(user.displayName || "US").slice(0, 80),
    partnerName: String(user.partnerName || "").slice(0, 80),
    startedOn: String(relationship.startedOn || ""),
    daysTogether: Number.isFinite(days) ? Math.max(0, Math.floor(days)) : 0
  };
}

function readCachedState() {
  try { return JSON.parse(fm.readString(statePath)); } catch (_) { return null; }
}

function writeCachedState(state) {
  // Deliberately omit signed URLs, unrelated widget state, and all credentials.
  fm.writeString(statePath, JSON.stringify(state));
}

async function refreshHomePhoto(url) {
  if (url === null) {
    try { if (fm.fileExists(photoPath)) fm.remove(photoPath); } catch (_) {}
    return;
  }
  if (typeof url !== "string" || !url) return;
  try {
    const request = new Request(url);
    request.method = "GET";
    request.timeoutInterval = 20;
    const image = await request.loadImage();
    if (image) fm.writeImage(photoPath, image);
  } catch (_) {
    // Retain the last Home image. Signed URL expiry is harmless with this cache.
  }
}

function photoOrNull() {
  try { return fm.fileExists(photoPath) ? fm.readImage(photoPath) : null; } catch (_) { return null; }
}

function noPhotoGradient() {
  const gradient = new LinearGradient();
  gradient.colors = [new Color("#080609"), new Color("#210B25"), new Color("#121016")];
  gradient.locations = [0, 0.62, 1];
  gradient.startPoint = new Point(0, 0);
  gradient.endPoint = new Point(1, 1);
  return gradient;
}

function addOverlay(widget, state, small) {
  widget.setPadding(small ? 13 : 16, small ? 13 : 18, small ? 12 : 15, small ? 13 : 18);
  const content = widget.addStack();
  content.layoutVertically();
  content.addSpacer();
  const label = content.addStack();
  label.layoutVertically();
  label.backgroundColor = new Color("#080609", 0.36);
  label.cornerRadius = 13;
  label.setPadding(small ? 9 : 11, small ? 10 : 13, small ? 9 : 11, small ? 10 : 13);

  const days = label.addText(String(state.daysTogether));
  days.font = Font.boldSystemFont(small ? 31 : 40);
  days.textColor = new Color("#FFF8FB");
  days.minimumScaleFactor = 0.7;
  const caption = label.addText("giorni insieme");
  caption.font = Font.mediumSystemFont(small ? 10 : 12);
  caption.textColor = new Color("#F1E9EF");
  caption.minimumScaleFactor = 0.8;
  caption.lineLimit = 1;

  const names = [state.displayName, state.partnerName].filter(Boolean).join(" ♡ ");
  const footer = label.addText(names || "US");
  footer.font = Font.mediumSystemFont(small ? 9 : 10);
  footer.textColor = new Color("#E7DCE5");
  footer.minimumScaleFactor = 0.7;
  footer.lineLimit = 1;
  content.addSpacer(1);
}

function makeWidget(state, family) {
  const widget = new ListWidget();
  const image = photoOrNull();
  if (image) widget.backgroundImage = image;
  else widget.backgroundGradient = noPhotoGradient();
  widget.url = APP_URL;
  addOverlay(widget, state, family === "small");
  widget.refreshAfterDate = new Date(Date.now() + 6 * 60 * 60 * 1000);
  return widget;
}

async function main() {
  let state = readCachedState() || { displayName: "US", partnerName: "", startedOn: "", daysTogether: 0 };
  try {
    const response = await ensureCredentials(!config.runsInWidget);
    state = minimalState(response);
    writeCachedState(state);
    await refreshHomePhoto(response.homePhotoUrl);
  } catch (error) {
    if (credentialRejectedThisRun || handleCredentialFailure(error) || !hasWidgetCredentials()) {
      state = { displayName: "US", partnerName: "", startedOn: "", daysTogether: 0 };
      credentialRejectedThisRun = false;
    }
    // Network and server errors retain the last known state/photo for offline use.
  }
  const requestedFamily = args.queryParameters.family === "small" ? "small" : "medium";
  const family = config.widgetFamily || requestedFamily;
  const widget = makeWidget(state, family);
  if (config.runsInWidget) Script.setWidget(widget);
  else if (family === "small") await widget.presentSmall();
  else await widget.presentMedium();
  Script.complete();
}

await main();
