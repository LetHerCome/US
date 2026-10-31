package com.usapp.widget;

import java.net.URI;

/**
 * Where a widget may send its device token: the Edge functions of the US
 * build that issued it (production or staging), given by the app with the
 * credential. Only the two US projects over https; anything else is refused,
 * so a token can never be sent to another server. Pure Java: JVM-tested.
 */
final class UsWidgetEndpoints {
    static final String PRODUCTION = "https://iiakdfsxpywdkxravqjh.supabase.co/functions/v1";
    private static final String[] PROJECTS = { "iiakdfsxpywdkxravqjh", "dugmhngrfkuieeletatb" };

    private UsWidgetEndpoints() {}

    /** The normalised Edge address, or "" when it is not one of the two US projects. */
    static String functionsBase(String url) {
        if (url == null) return "";
        try {
            URI uri = new URI(url.trim());
            String path = uri.getRawPath() == null ? "" : uri.getRawPath().replaceAll("/+$", "");
            if (!"https".equals(uri.getScheme()) || uri.getRawUserInfo() != null || uri.getPort() != -1
                || uri.getRawQuery() != null || uri.getRawFragment() != null || !"/functions/v1".equals(path)) return "";
            for (String project : PROJECTS) {
                String host = project + ".supabase.co";
                if (host.equals(uri.getHost())) return "https://" + host + "/functions/v1";
            }
        } catch (Exception ignored) {}
        return "";
    }

    /** Ti penso: credentials stored before the address existed came from production. */
    static String thinkSend(String functionsBase) {
        String base = functionsBase(functionsBase);
        return (base.isEmpty() ? PRODUCTION : base) + "/widget-think-send";
    }
}
