// US · Ti Penso — Scriptable widget. No native app/Xcode project required.
const SUPABASE = "https://iiakdfsxpywdkxravqjh.supabase.co";
const APP_URL = "https://usfinal.vercel.app/";
const STATE_KEY = "US_WIDGET_STATE_TOKEN";
const THINK_KEY = "US_WIDGET_THINK_TOKEN";
const DEVICE_KEY = "US_WIDGET_DEVICE_HASH";
const SENT_FILE = "us-ti-penso-state.json";
const ACTION_URL = "scriptable:///run/US-Ti-Penso?action=send";

const fm = FileManager.local();
const sentPath = fm.joinPath(fm.documentsDirectory(), SENT_FILE);
let credentialRejectedThisRun = false;

function randomDeviceHash() {
  return (UUID.string().replace(/-/g, "") + UUID.string().replace(/-/g, "")).toLowerCase();
}

async function postJson(url, body, token) {
  const req = new Request(url);
  req.method = "POST";
  req.headers = { "Content-Type": "application/json", "Cache-Control": "no-store" };
  if (token) req.headers["x-us-widget-token"] = token;
  req.body = JSON.stringify(body);
  req.timeoutInterval = 20;
  const value = await req.loadJSON();
  const status = req.response ? req.response.statusCode : 0;
  if (status < 200 || status >= 300) {
    const error = new Error(value && value.error ? value.error : "request_failed");
    error.status = status;
    throw error;
  }
  return value;
}

function clearCredentials() {
  [STATE_KEY, THINK_KEY].forEach((key) => { if (Keychain.contains(key)) Keychain.remove(key); });
}

function hasWidgetCredentials() {
  return Keychain.contains(STATE_KEY) && Keychain.contains(THINK_KEY) && Keychain.contains(DEVICE_KEY);
}

function purgeCachedPrivateData() {
  const local = readLocalState();
  writeLocalState(mergeLocalState(local, { partnerName: "", pendingActionId: "", pendingActionCreatedAt: "" }));
}

function handleCredentialFailure(error) {
  if (!error || error.status !== 401) return false;
  clearCredentials();
  purgeCachedPrivateData();
  credentialRejectedThisRun = true;
  return true;
}

async function provisionIfNeeded(allowPrompt) {
  if (hasWidgetCredentials()) {
    try { return await loadState(Keychain.get(STATE_KEY)); }
    catch (error) {
      if (!handleCredentialFailure(error)) throw error;
    }
  }
  purgeCachedPrivateData();
  if (!allowPrompt) throw new Error("setup_required");
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
  const pair = await postJson(`${SUPABASE}/functions/v1/widget-scriptable-setup`, {
    operation: "exchange", setupCode, deviceIdHash
  });
  if (!pair || !/^[A-Za-z0-9_-]{43}$/.test(pair.stateToken || "") || !/^[A-Za-z0-9_-]{43}$/.test(pair.thinkToken || "")) {
    throw new Error("invalid_credential_bundle");
  }
  Keychain.set(STATE_KEY, pair.stateToken);
  Keychain.set(THINK_KEY, pair.thinkToken);
  // Validate the read credential before presenting this widget as configured.
  const state = await loadState(pair.stateToken);
  const done = new Alert();
  done.title = "US collegato";
  done.message = "Entrambi i widget sono pronti. Questo codice monouso non è più valido.";
  done.addAction("Continua");
  await done.presentAlert();
  return state;
}

async function loadState(token) {
  const req = new Request(`${SUPABASE}/functions/v1/us-widget-state`);
  req.method = "GET";
  req.headers = { "x-us-widget-token": token, "Cache-Control": "no-store" };
  req.timeoutInterval = 20;
  const data = await req.loadJSON();
  const status = req.response ? req.response.statusCode : 0;
  if (status < 200 || status >= 300) {
    const error = new Error(data && data.error ? data.error : "state_unavailable");
    error.status = status;
    throw error;
  }
  credentialRejectedThisRun = false;
  return data;
}

function readLocalState() {
  try {
    if (!fm.fileExists(sentPath)) return {};
    return JSON.parse(fm.readString(sentPath)) || {};
  } catch (_) { return {}; }
}

function writeLocalState(next) {
  // Only idempotency metadata and timestamps; credentials are Keychain-only.
  fm.writeString(sentPath, JSON.stringify(next));
}

function mergeLocalState(current, changes) {
  const merged = Object.assign({}, current || {});
  Object.keys(changes).forEach((key) => { merged[key] = changes[key]; });
  return merged;
}

function pendingActionId() {
  const current = readLocalState();
  const createdAt = Date.parse(current.pendingActionCreatedAt || "");
  if (current.pendingActionId && Number.isFinite(createdAt) && Date.now() - createdAt < 24 * 60 * 60 * 1000) {
    return current.pendingActionId;
  }
  const actionId = newActionId();
  writeLocalState(mergeLocalState(current, { pendingActionId: actionId, pendingActionCreatedAt: new Date().toISOString() }));
  return actionId;
}

function newActionId() {
  return UUID.string().toLowerCase();
}

async function notify(title, body) {
  try {
    const notification = new Notification();
    notification.title = title;
    notification.body = body;
    notification.sound = "default";
    notification.setTriggerDate(new Date(Date.now() + 1000));
    await notification.schedule();
  } catch (_) {
    const alert = new Alert();
    alert.title = title;
    alert.message = body;
    alert.addAction("OK");
    await alert.presentAlert();
  }
}

async function sendThink() {
  try {
    if (!Keychain.contains(THINK_KEY)) throw new Error("credential_missing");
    const actionId = pendingActionId();
    const result = await postJson(`${SUPABASE}/functions/v1/widget-think-send`, { actionId }, Keychain.get(THINK_KEY));
    if (!result || result.sent !== true) throw new Error("send_not_confirmed");
    const sentAt = new Date().toISOString();
    writeLocalState(mergeLocalState(readLocalState(), { lastSentAt: sentAt, pendingActionId: "", pendingActionCreatedAt: "" }));
    await notify("Ti penso inviato", "Un piccolo segnale è arrivato alla tua persona ♡");
  } catch (error) {
    handleCredentialFailure(error);
    await notify("Ti penso non inviato", "Controlla la connessione o riapri US per riprovare. Nessun invio è stato confermato.");
  }
}

function background() {
  const gradient = new LinearGradient();
  gradient.colors = [new Color("#080609"), new Color("#210B25"), new Color("#121016")];
  gradient.locations = [0, 0.62, 1];
  gradient.startPoint = new Point(0, 0);
  gradient.endPoint = new Point(1, 1);
  return gradient;
}

function addHeart(stack, size) {
  const symbol = SFSymbol.named("heart.fill");
  const image = stack.addImage(symbol.image);
  image.imageSize = new Size(size, size);
  image.tintColor = new Color("#F2DCE7");
  image.centerAlignImage();
}

function buildSmall(state) {
  const widget = new ListWidget();
  widget.backgroundGradient = background();
  widget.url = ACTION_URL;
  widget.setPadding(15, 12, 13, 12);
  const center = widget.addStack();
  center.layoutVertically();
  center.centerAlignContent();
  center.addSpacer();
  addHeart(center, 42);
  center.addSpacer(9);
  const title = center.addText("Ti penso");
  title.font = Font.semiboldSystemFont(16);
  title.textColor = new Color("#FFF8FB");
  title.centerAlignText();
  const partnerName = state && state.user && state.user.partnerName ? state.user.partnerName : "la tua persona";
  const recipient = center.addText(`per ${partnerName}`);
  recipient.font = Font.systemFont(10);
  recipient.textColor = new Color("#C7B8C3");
  recipient.lineLimit = 1;
  recipient.centerAlignText();
  center.addSpacer();
  widget.refreshAfterDate = new Date(Date.now() + 4 * 60 * 60 * 1000);
  return widget;
}

function buildMedium(state) {
  const widget = new ListWidget();
  widget.backgroundGradient = background();
  widget.setPadding(14, 15, 14, 15);
  widget.spacing = 8;
  const row = widget.addStack();
  row.layoutHorizontally();
  row.centerAlignContent();

  const info = row.addStack();
  info.layoutVertically();
  info.url = APP_URL;
  info.addSpacer();
  const brand = info.addText("US");
  brand.font = Font.semiboldSystemFont(11);
  brand.textColor = new Color("#C9B9C6");
  info.addSpacer(8);
  const title = info.addText("Un piccolo segnale");
  title.font = Font.semiboldSystemFont(16);
  title.textColor = new Color("#FFF8FB");
  title.lineLimit = 2;
  const partnerName = state && state.user && state.user.partnerName ? state.user.partnerName : "la tua persona";
  const subtitle = info.addText(`per ${partnerName}`);
  subtitle.font = Font.systemFont(11);
  subtitle.textColor = new Color("#C7B8C3");
  info.addSpacer();

  row.addSpacer();
  const action = row.addStack();
  action.layoutVertically();
  action.centerAlignContent();
  action.url = ACTION_URL;
  action.addSpacer();
  addHeart(action, 39);
  action.addSpacer(6);
  const label = action.addText("TI PENSO");
  label.font = Font.semiboldSystemFont(9);
  label.textColor = new Color("#F2DCE7");
  label.centerAlignText();
  action.addSpacer();
  widget.refreshAfterDate = new Date(Date.now() + 4 * 60 * 60 * 1000);
  return widget;
}

async function main() {
  if (args.queryParameters.action === "send") {
    await sendThink();
    Script.complete();
    return;
  }
  let state = { user: { partnerName: String(readLocalState().partnerName || "") } };
  try {
    const latest = await provisionIfNeeded(!config.runsInWidget);
    const partnerName = latest && latest.user && latest.user.partnerName ? String(latest.user.partnerName).slice(0, 80) : "";
    state = { user: { partnerName } };
    writeLocalState(mergeLocalState(readLocalState(), { partnerName }));
  } catch (error) {
    if (credentialRejectedThisRun || handleCredentialFailure(error) || !hasWidgetCredentials()) {
      state = { user: { partnerName: "" } };
      credentialRejectedThisRun = false;
    }
  }
  const requestedFamily = args.queryParameters.family === "medium" ? "medium" : "small";
  const family = config.widgetFamily || requestedFamily;
  const widget = family === "medium" ? buildMedium(state) : buildSmall(state);
  if (config.runsInWidget) Script.setWidget(widget);
  else if (family === "medium") await widget.presentMedium();
  else await widget.presentSmall();
  Script.complete();
}

await main();
