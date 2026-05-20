/**
 * app_config.js — Global Development Configuration Constants
 * 
 * RULES FOR AGENTS:
 * - This file contains constants meant to be toggled by developers manually.
 * - This is for DEV flags, feature flags, or diagnostic settings.
 * - Do NOT store runtime user preferences here (use localStorage for that).
 */

export const APP_CONFIG = {
    // Enables the "Inspect Element" action in the media context menu, etc.
    dev_mode: true,
    // Restores the last-visited page on browser refresh (dev convenience).
    test_styles: false
};
