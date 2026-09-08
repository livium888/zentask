import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "app.zentask.capture",
  appName: "ZenTask",
  webDir: "dist",
  android: {
    // The review queue is the whole product; never let the WebView bounce.
    allowMixedContent: false,
  },
};

export default config;
