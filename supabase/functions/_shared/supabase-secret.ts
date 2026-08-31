export function supabaseSecretKey() {
  const modern = Deno.env.get("SUPABASE_SECRET_KEYS");
  if (modern) {
    try {
      const parsed = JSON.parse(modern);
      if (typeof parsed?.default === "string") return parsed.default;
      const first = Object.values(parsed || {})[0];
      if (typeof first === "string") return first;
    } catch (_) {}
  }
  return Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
}
