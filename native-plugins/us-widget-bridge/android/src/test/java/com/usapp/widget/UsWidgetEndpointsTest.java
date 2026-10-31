package com.usapp.widget;

import static org.junit.Assert.assertEquals;

import org.junit.Test;

/** The Edge address a widget token may be sent to: only the two US projects. */
public class UsWidgetEndpointsTest {
    @Test
    public void onlyTheTwoUsProjectsOverHttps() {
        assertEquals("https://iiakdfsxpywdkxravqjh.supabase.co/functions/v1",
            UsWidgetEndpoints.functionsBase("https://iiakdfsxpywdkxravqjh.supabase.co/functions/v1/"));
        assertEquals("https://dugmhngrfkuieeletatb.supabase.co/functions/v1",
            UsWidgetEndpoints.functionsBase("https://dugmhngrfkuieeletatb.supabase.co/functions/v1"));
        assertEquals("", UsWidgetEndpoints.functionsBase("http://dugmhngrfkuieeletatb.supabase.co/functions/v1"));
        assertEquals("", UsWidgetEndpoints.functionsBase("https://evil.example/functions/v1"));
        assertEquals("", UsWidgetEndpoints.functionsBase("https://dugmhngrfkuieeletatb.supabase.co.evil.example/functions/v1"));
        assertEquals("", UsWidgetEndpoints.functionsBase("https://user@dugmhngrfkuieeletatb.supabase.co/functions/v1"));
        assertEquals("", UsWidgetEndpoints.functionsBase("https://dugmhngrfkuieeletatb.supabase.co:444/functions/v1"));
        assertEquals("", UsWidgetEndpoints.functionsBase("https://dugmhngrfkuieeletatb.supabase.co/rest/v1"));
        assertEquals("", UsWidgetEndpoints.functionsBase(null));
    }

    @Test
    public void tiPensoWithoutAnAddressKeepsGoingToProduction() {
        // Credentials stored before 31/10/2026 carry no address: they were issued by production.
        assertEquals("https://iiakdfsxpywdkxravqjh.supabase.co/functions/v1/widget-think-send", UsWidgetEndpoints.thinkSend(""));
        assertEquals("https://dugmhngrfkuieeletatb.supabase.co/functions/v1/widget-think-send",
            UsWidgetEndpoints.thinkSend("https://dugmhngrfkuieeletatb.supabase.co/functions/v1"));
        assertEquals("an address that is not ours never gets the token",
            "https://iiakdfsxpywdkxravqjh.supabase.co/functions/v1/widget-think-send", UsWidgetEndpoints.thinkSend("https://evil.example/functions/v1"));
    }
}
