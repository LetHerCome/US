package com.usapp.widget;

import static org.junit.Assert.assertEquals;

import org.junit.Test;

/**
 * The Edge address a widget token may be sent to: only the US project of this
 * build. The source names production; the staging APK rewrites it for
 * US-STAGING (scripts/configure-s3-staging-qa.mjs), so the Play bundle never
 * carries the staging project.
 */
public class UsWidgetEndpointsTest {
    @Test
    public void onlyTheUsProjectOfThisBuildOverHttps() {
        assertEquals("https://iiakdfsxpywdkxravqjh.supabase.co/functions/v1",
            UsWidgetEndpoints.functionsBase("https://iiakdfsxpywdkxravqjh.supabase.co/functions/v1/"));
        assertEquals("", UsWidgetEndpoints.functionsBase("http://iiakdfsxpywdkxravqjh.supabase.co/functions/v1"));
        assertEquals("", UsWidgetEndpoints.functionsBase("https://evil.example/functions/v1"));
        assertEquals("", UsWidgetEndpoints.functionsBase("https://iiakdfsxpywdkxravqjh.supabase.co.evil.example/functions/v1"));
        assertEquals("", UsWidgetEndpoints.functionsBase("https://user@iiakdfsxpywdkxravqjh.supabase.co/functions/v1"));
        assertEquals("", UsWidgetEndpoints.functionsBase("https://iiakdfsxpywdkxravqjh.supabase.co:444/functions/v1"));
        assertEquals("", UsWidgetEndpoints.functionsBase("https://iiakdfsxpywdkxravqjh.supabase.co/rest/v1"));
        assertEquals("another Supabase project is refused",
            "", UsWidgetEndpoints.functionsBase("https://abcdefghijklmnopqrst.supabase.co/functions/v1"));
        assertEquals("", UsWidgetEndpoints.functionsBase(null));
    }

    @Test
    public void tiPensoWithoutAnAddressKeepsGoingToProduction() {
        // Credentials stored before 31/10/2026 carry no address: they were issued by production.
        assertEquals("https://iiakdfsxpywdkxravqjh.supabase.co/functions/v1/widget-think-send", UsWidgetEndpoints.thinkSend(""));
        assertEquals("https://iiakdfsxpywdkxravqjh.supabase.co/functions/v1/widget-think-send",
            UsWidgetEndpoints.thinkSend("https://iiakdfsxpywdkxravqjh.supabase.co/functions/v1"));
        assertEquals("an address that is not ours never gets the token",
            "https://iiakdfsxpywdkxravqjh.supabase.co/functions/v1/widget-think-send", UsWidgetEndpoints.thinkSend("https://evil.example/functions/v1"));
    }
}
