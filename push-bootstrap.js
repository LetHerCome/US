(() => {
  if (window.__usPushBootstrapInstalled) return;
  window.__usPushBootstrapInstalled = true;

  let started = false;
  let plugin = null;

  function getPlugin() {
    const cap = window.Capacitor;
    if (!cap || typeof cap.isNativePlatform !== 'function' || !cap.isNativePlatform() || typeof cap.registerPlugin !== 'function') return null;
    if (!plugin) plugin = cap.registerPlugin('PushNotifications');
    return plugin;
  }

  async function registerToken(value) {
    if (!value || typeof sb === 'undefined' || !window.usProfile) return;
    const { error } = await sb.rpc('register_push_token', {
      push_token: value,
      push_platform: 'android'
    });
    if (error) console.warn('[US Push] token sync failed', error);
    else console.info('[US Push] token registrato');
  }

  async function setup() {
    if (started || !window.usProfile || typeof sb === 'undefined') return;
    const push = getPlugin();
    if (!push) return;
    started = true;
    try {
      await push.addListener('registration', token => registerToken(token?.value || ''));
      await push.addListener('registrationError', error => console.warn('[US Push] registration error', error));
      await push.addListener('pushNotificationActionPerformed', event => {
        const page = event?.notification?.data?.page;
        if (typeof go === 'function') go(page && ['home','today','moments','bond','think','quiz'].includes(page) ? page : 'think');
      });

      let permission = await push.checkPermissions();
      if (permission?.receive === 'prompt' || permission?.receive === 'prompt-with-rationale') {
        permission = await push.requestPermissions();
      }
      if (permission?.receive !== 'granted') {
        console.info('[US Push] permesso notifiche non concesso');
        return;
      }

      try {
        await push.createChannel({
          id: 'us_private',
          name: 'US.',
          description: 'Notifiche private di US.',
          importance: 4,
          visibility: 1,
          vibration: true
        });
      } catch (_) {}

      await push.register();
    } catch (error) {
      started = false;
      console.warn('[US Push] setup non disponibile', error);
    }
  }

  const timer = setInterval(() => {
    if (window.usProfile) setup();
    if (started) clearInterval(timer);
  }, 750);

  window.addEventListener('focus', setup);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) setup(); });
})();
