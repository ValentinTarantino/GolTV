import { patchHtml, patchJs, resolveUpstream } from "@/lib/player4-proxy";
import { PLAYER4_PREFIX } from "@/lib/player-two-source";

// The proxy rewrites provider URLs read from env; tests use fake hosts only.
const STATICS = "https://statics.example.test";
const API = "https://api.example.test";
const PLAYER = "https://player.example.test";

describe("player4-proxy", () => {
  beforeEach(() => {
    process.env.PLAYER_TWO_STATICS_URL = STATICS;
    process.env.PLAYER_TWO_API_BASE = API;
    process.env.PLAYER_TWO_PLAYER_URL = PLAYER;
    process.env.PLAYER_TWO_REFERER = "https://embedder.example.test/";
  });

  describe("resolveUpstream", () => {
    it("routes the player page and /js assets to the player origin", () => {
      expect(resolveUpstream(["es", "player.html"], PLAYER)).toBe(`${PLAYER}/es/player.html`);
      expect(resolveUpstream(["js", "mtg.js"], PLAYER)).toBe(`${PLAYER}/js/mtg.js`);
    });

    it("routes _s to the statics origin without the prefix segment", () => {
      expect(resolveUpstream(["_s", "statics", "app.js"], PLAYER)).toBe(`${STATICS}/statics/app.js`);
      expect(resolveUpstream(["_s", "img", "player", "x.svg"], PLAYER)).toBe(`${STATICS}/img/player/x.svg`);
    });

    it("routes api and signed sfver paths to the API origin", () => {
      expect(resolveUpstream(["api", "match", "live"], PLAYER)).toBe(`${API}/api/match/live`);
      expect(resolveUpstream(["api-cf", "common", "timesync"], PLAYER)).toBe(
        `${API}/api-cf/common/timesync`
      );
      expect(resolveUpstream(["sfverAb12Cd", "api", "match", "live"], PLAYER)).toBe(
        `${API}/sfverAb12Cd/api/match/live`
      );
    });

    it("returns null when the owning origin is not configured", () => {
      delete process.env.PLAYER_TWO_STATICS_URL;
      expect(resolveUpstream(["_s", "statics", "app.js"], PLAYER)).toBeNull();
      expect(resolveUpstream(["api", "common", "params"], PLAYER)).toBe(`${API}/api/common/params`);
      expect(resolveUpstream(["es", "player.html"], "")).toBeNull();
    });
  });

  describe("patchHtml", () => {
    it("moves the browser API base under the proxy", () => {
      const html = '{"c$config":{APP_ENV:"production",API_URL_BROWSER:h,SERVER_DA_API:m}}' +
        ',config:{API_URL_BROWSER:h,SERVER_DA_API:m}';
      const out = patchHtml(html);
      expect(out).toContain('API_URL_BROWSER:"\\u002Fp4\\u002F",');
      expect(out).not.toContain("API_URL_BROWSER:h,");
      expect(out).toContain('APP_ENV:"production",API_URL_BROWSER:"\\u002Fp4\\u002F"');
    });

    it("reprefixes root-relative scripts and statics URLs (raw and escaped)", () => {
      const html = [
        '<script src="/js/mtg.js?v=2"></script>',
        `<link href="${STATICS}/statics/css/a.css" rel="stylesheet">`,
        'v.cdnURL="https:\\u002F\\u002Fstatics.example.test\\u002Fstatics\\u002F";',
      ].join("");
      const out = patchHtml(html);
      expect(out).toContain(`src="${PLAYER4_PREFIX}/js/mtg.js?v=2"`);
      expect(out).toContain(`href="${PLAYER4_PREFIX}/_s/statics/css/a.css"`);
      expect(out).toContain(`"${PLAYER4_PREFIX}/_s\\u002Fstatics\\u002F"`);
      expect(out).not.toContain(STATICS);
    });
  });

  describe("patchJs", () => {
    it("neutralizes judgeValid and the frame trap guard", () => {
      const js =
        "var a={'judgeValid':function(){if(!ok)show();};" +
        "try{return self===top||top.location['href'],!0x1;}catch(ej){return!0x0;}}";
      const out = patchJs(js);
      expect(out).toContain("'judgeValid':function(){return;");
      expect(out).toContain("['href'],!0x0;}catch(ej){return!0x0;}");
      expect(out).not.toContain("!0x1;}catch(ej)");
    });

    it("reprefixes provider-hosted bundle URLs", () => {
      const js = `__webpack_require__.p="${STATICS}/statics/";fetch("https:\\u002F\\u002F${STATICS.replace("https://", "")}/x");`;
      const out = patchJs(js);
      expect(out).toContain(`__webpack_require__.p="${PLAYER4_PREFIX}/_s/statics/"`);
      expect(out).toContain('fetch("/p4/_s/x")');
      expect(out).not.toContain(STATICS);
    });
  });
});
