package com.resultsbusiness.manager;

import static org.junit.Assert.assertEquals;

import org.junit.Test;

/** The shell's pure rules, run on the JVM: no emulator is needed to know
 *  that a save file is offered to the picker or that a script is served as
 *  a script. */
public class ShellRulesTest {

    @Test
    public void aSaveFileIsNeverHiddenByTheJsonFilter() {
        assertEquals("*/*", MainActivity.pickerType(new String[]{".json", "application/json"}));
        assertEquals("*/*", MainActivity.pickerType(new String[]{"application/json"}));
        assertEquals("*/*", MainActivity.pickerType(null));
        assertEquals("*/*", MainActivity.pickerType(new String[]{""}));
    }

    @Test
    public void anAudioPackStillAsksForAudio() {
        assertEquals("audio/*", MainActivity.pickerType(new String[]{"audio/*"}));
    }

    @Test
    public void everyGameFileIsServedAsWhatItIs() {
        assertEquals("text/html", MainActivity.mimeOf("index.html"));
        assertEquals("text/javascript", MainActivity.mimeOf("src/lower-league-data.js"));
        assertEquals("application/manifest+json", MainActivity.mimeOf("manifest.webmanifest"));
        assertEquals("image/svg+xml", MainActivity.mimeOf("assets/results-business-icon.svg"));
        assertEquals("image/png", MainActivity.mimeOf("assets/results-business-icon-512.png"));
        assertEquals("audio/mpeg", MainActivity.mimeOf("audio/crowd.MP3"));
        assertEquals("application/octet-stream", MainActivity.mimeOf("unknown.bin"));
    }

    @Test
    public void googleBritishVoicesAreToldApartByCode() {
        assertEquals("male", MainActivity.genderOf("en-gb-x-gbb-local"));
        assertEquals("male", MainActivity.genderOf("en-gb-x-rjs-network"));
        assertEquals("female", MainActivity.genderOf("en-gb-x-gba-local"));
        assertEquals("female", MainActivity.genderOf("en-GB-x-GBC-network"));
        assertEquals("", MainActivity.genderOf("English United Kingdom 1"));
    }
}
