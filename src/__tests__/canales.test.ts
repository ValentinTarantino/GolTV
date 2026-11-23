/**
 * @jest-environment node
 */
import {
  canalRelayUrl,
  channelId,
  extractDashSource,
  extractStreamUrl,
  neutralizeDrmBoxes,
  openCanalUrl,
  resolveRepresentationIds,
  rewriteCanalManifest,
  rewriteCanalPlaylist,
  sealCanalUrl,
} from "@/lib/streams";

describe("canales source", () => {
  beforeEach(() => {
    process.env.CANALES_STREAM_HOSTS = "trapemn.tv,emitiendoenvivo.com";
    process.env.CANALES_PROXY_SECRET = "test-secret";
  });

  describe("sealed relay tokens", () => {
    it("round trips an upstream URL", () => {
      const url = "https://cdn-zapster-ros.trapemn.tv:1936/zapster-hls/ESPN1.stream/playlist.m3u8";
      expect(openCanalUrl(sealCanalUrl(url))).toBe(url);
    });

    it("rejects tampered tokens", () => {
      const token = sealCanalUrl("https://cdn-zapster-ros.trapemn.tv/live/a.m3u8");
      expect(openCanalUrl(`${token.slice(0, -4)}AAAA`)).toBeNull();
    });

    it("rejects empty tokens", () => {
      expect(openCanalUrl("")).toBeNull();
      expect(openCanalUrl("abc")).toBeNull();
    });

    it("builds a relay URL that never carries the upstream host", () => {
      const relay = canalRelayUrl("https://cdn-zapster-ros.trapemn.tv:1936/live/a.m3u8");
      expect(relay.startsWith("/api/canales/stream?t=")).toBe(true);
      expect(relay).not.toContain("trapemn");
    });
  });

  describe("rewriteCanalPlaylist", () => {
    it("sends every segment through the relay", () => {
      const playlist = [
        "#EXTM3U",
        '#EXT-X-MEDIA:TYPE=AUDIO,URI="audio/stream.m3u8"',
        "chunk-1.ts",
        "",
      ].join("\n");
      const rewritten = rewriteCanalPlaylist(
        playlist,
        new URL("https://cdn-zapster-ros.trapemn.tv:1936/live/x.m3u8")
      );

      expect(rewritten).not.toContain("trapemn.tv");
      expect(rewritten).toContain("/api/canales/stream?t=");
      expect(rewritten.match(/\/api\/canales\/stream\?t=/g)?.length).toBe(2);
    });
  });

  describe("resolveRepresentationIds", () => {
    it("fills the representation placeholder of the segment templates", () => {
      const manifest = [
        "<MPD>",
        '<AdaptationSet mimeType="video/mp4">',
        '<Representation id="avc1_379968=15" bandwidth="379968">',
        '<SegmentTemplate initialization="ESPN2HD-$RepresentationID$-scale=30000-init.mp4" media="ESPN2HD-$RepresentationID$-$Time$.mp4"/>',
        "</Representation>",
        "</AdaptationSet>",
        "</MPD>",
      ].join("\n");

      const resolved = resolveRepresentationIds(manifest);
      expect(resolved).toContain("ESPN2HD-avc1_379968=15-scale=30000-init.mp4");
      expect(resolved).not.toContain("$RepresentationID$");
    });
  });

  describe("rewriteCanalManifest", () => {
    it("sends base url, init and media through the relay and drops the DRM", () => {
      const manifest = [
        "<MPD>",
        "<BaseURL>https://dish-arg.akamaized.net/Content/DASH/Live/</BaseURL>",
        '<AdaptationSet mimeType="video/mp4"><Representation id="avc1_379968=15"/>',
        '<SegmentTemplate initialization="ESPN2HD-init.mp4" media="ESPN2HD-$Time$.mp4"/>',
        '<ContentProtection schemeIdUri="urn:uuid:edef8ba9-79d6-4ace-a3c8-27dcd51d21ed" value="Widevine"/>',
        "</AdaptationSet>",
        "</MPD>",
      ].join("\n");
      const upstream = new URL(
        "https://dish-arg.akamaized.net/Content/DASH/Live/channel(pxsports)/variant.mpd"
      );
      const rewritten = rewriteCanalManifest(manifest, upstream);

      expect(rewritten).not.toContain("akamaized.net");
      expect(rewritten).not.toContain("ContentProtection");
      const tokens = [...rewritten.matchAll(/\/api\/canales\/stream\?t=([A-Za-z0-9_-]+)/g)].map(
        (match) => match[1]
      );
      expect(tokens).toHaveLength(3);
    });
  });

  describe("extractStreamUrl", () => {
    it("finds the playlist of a player document", () => {
      const player = '<video src="https://cdn-zapster-ros.trapemn.tv:1936/zapster-hls/ESPN1.stream/playlist.m3u8"></video>';
      expect(extractStreamUrl(player)).toBe(
        "https://cdn-zapster-ros.trapemn.tv:1936/zapster-hls/ESPN1.stream/playlist.m3u8"
      );
    });

    it("unwraps a playlist published behind a proxy parameter", () => {
      const player = 'https://proxy.example/?url=https%3A%2F%2Fcdn.example.tv%2Flive%2Fx.m3u8';
      expect(extractStreamUrl(player)).toBe("https://cdn.example.tv/live/x.m3u8");
    });

    it("returns null when there is no playlist", () => {
      expect(extractStreamUrl("<div>no stream here</div>")).toBeNull();
    });
  });

  describe("extractDashSource", () => {
    it("reads the manifest and the ClearKey of a dash player", () => {
      const player = [
        'const manifestUri = "https://dish-arg.akamaized.net/Content/DASH/Live/channel(pxsports)/variant.mpd";',
        "const CLEAR_KEYS = {",
        '  "7a3331860220a10a7e8b16c137c61765": "e9ab4d4a676be421e88c6e0127c6e087"',
        "};",
      ].join("\n");

      const source = extractDashSource(player);
      expect(source?.kind).toBe("dash");
      expect(source?.url).toContain("akamaized.net");
      expect(source?.clearKey?.kid).toBe("ejMxhgIgoQp-ixbBN8YXZQ");
      expect(source?.clearKey?.key).toBe("6atNSmdr5CHojG4BJ8bghw");
    });

    it("returns null without a manifest", () => {
      expect(extractDashSource("<div>nothing</div>")).toBeNull();
    });
  });

  describe("neutralizeDrmBoxes", () => {
    it("renames the encryption boxes so the media reads as clear", () => {
      const buffer = Buffer.from("....pssh....sinf....senc....avc1", "latin1");
      const clean = neutralizeDrmBoxes(buffer).toString("latin1");
      expect(clean).not.toContain("pssh");
      expect(clean).not.toContain("sinf");
      expect(clean).not.toContain("senc");
      expect(clean).toContain("free");
      expect(clean).toContain("avc1");
    });
  });

  describe("channel ids", () => {
    it("are opaque and stable", () => {
      const url = "https://canalesenvivodeargentina.blogspot.com/2026/10/espn-en-vivo.html";
      const id = channelId(url);
      expect(id).toMatch(/^can_[a-f0-9]{16}$/);
      expect(id).toBe(channelId(url));
      expect(id).not.toContain("espn");
    });
  });
});
