// What PostHog session replay actually records with the app's settings.
//
// Unit tests can only check the options passed in. This runs the real
// posthog-js in Chromium against a stand-in PostHog host that turns replay on
// the way the project's remote config does, then reads the recording it
// uploads. It records twice: once without the app's replay options, to prove
// the check can see page text at all, and once with them, which must not.
//
//   npm run check:replay      (needs Playwright's Chromium; no keys, no network)
import http from "node:http";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import zlib from "node:zlib";
import { chromium } from "playwright";
import { replayOptions, withoutQuery } from "../lib/analytics/scrub.ts";

const DIST = fileURLToPath(new URL("../node_modules/posthog-js/dist/", import.meta.url));
const PRIVATE = ["ACME SECRET VENDOR", "INV-SECRET-41", "98,765.43", "11,222.33"];

const remoteConfig = {
  analytics: { endpoint: "/i/v0/e/" },
  sessionRecording: {
    endpoint: "/s/", recorderVersion: "v2", masking: { maskAllInputs: true }, version: 1,
    scriptConfig: { script: "posthog-recorder" }, eventTriggers: [], urlTriggers: [], urlBlocklist: [],
  },
  supportedCompression: [],
  hasFeatureFlags: false,
};

const page = `<!doctype html><title>replay</title><script src="/static/array.full.js"></script>
<h1>ACME SECRET VENDOR</h1><p>Invoice INV-SECRET-41 for 98,765.43</p>`;

/** Snapshot data is gzip bytes held in a latin1 string (PostHog's cv 2024-10). */
function readable(upload) {
  const out = [upload];
  const walk = (v) => {
    if (typeof v === "string" && v.charCodeAt(0) === 0x1f && v.charCodeAt(1) === 0x8b) {
      try { out.push(zlib.gunzipSync(Buffer.from(v, "latin1")).toString("utf8")); } catch {}
    } else if (v && typeof v === "object") for (const x of Object.values(v)) walk(x);
  };
  try { walk(JSON.parse(upload)); } catch {}
  return out.join("\n");
}

async function record(withAppOptions) {
  const uploads = [];
  const server = http.createServer((req, res) => {
    const path = new URL(req.url, "http://localhost").pathname;
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      if (path.startsWith("/s/")) uploads.push(Buffer.concat(chunks).toString("utf8"));
      if (path.startsWith("/static/")) {
        res.writeHead(200, { "content-type": "application/javascript" });
        return res.end(readFileSync(DIST + path.split("/").pop()));
      }
      const json = path.includes("/config") || path.startsWith("/flags");
      res.writeHead(200, { "content-type": json ? "application/json" : "text/html" });
      res.end(json ? JSON.stringify(remoteConfig) : path === "/" ? page : "{}");
    });
  });
  await new Promise((resolve) => server.listen(0, resolve));
  const origin = `http://localhost:${server.address().port}`;

  const browser = await chromium.launch();
  const tab = await browser.newPage();
  await tab.goto(origin + "/");
  // The functions go in as source, so the page runs the same code the app ships.
  const options = withAppOptions
    ? `Object.assign(${JSON.stringify(replayOptions)}, {
         maskCapturedNetworkRequestFn: ({ ${replayOptions.maskCapturedNetworkRequestFn.toString()} }).maskCapturedNetworkRequestFn,
       })`
    : "{}";
  await tab.evaluate(`window.withoutQuery = ${withoutQuery.toString()};
    posthog.init("phc_check", { api_host: "${origin}", disable_compression: true,
      opt_out_useragent_filter: true, capture_pageview: false, session_recording: ${options} });
    posthog.startSessionRecording(true);`);
  await tab.waitForTimeout(2000);
  await tab.evaluate(() => { document.querySelector("p").textContent = "Updated total 11,222.33"; });
  await tab.waitForTimeout(3000);
  await tab.goto("about:blank");
  await new Promise((resolve) => setTimeout(resolve, 2000));
  await browser.close();
  server.close();

  const recorded = uploads.map(readable).join("\n");
  return { uploads: uploads.length, leaked: PRIVATE.filter((text) => recorded.includes(text)) };
}

const baseline = await record(false);
const app = await record(true);
console.log("without the app's options:", baseline);
console.log("with the app's options:   ", app);

if (!baseline.uploads || !baseline.leaked.length) {
  console.error("The check could not see page text even unmasked, so it proves nothing. Fix the check.");
  process.exit(2);
}
if (!app.uploads || app.leaked.length) {
  console.error(app.uploads ? `Replay recorded page text: ${app.leaked.join(", ")}` : "Nothing was recorded.");
  process.exit(1);
}
console.log("Replay masks page text.");
