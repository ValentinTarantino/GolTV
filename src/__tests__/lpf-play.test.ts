/**
 * @jest-environment node
 */
import {
  isLpfStreamHost,
  openLpfUrl,
  rewriteLpfPlaylist,
  sealLpfUrl,
} from "@/lib/lpf-play";

describe("sealed relay tokens", () => {
  beforeAll(() => {
    process.env.LPF_PROXY_SECRET = "test-relay-secret";
  });

  it("round-trips an https URL", () => {
    const sealed = sealLpfUrl("https://media.example/lpf/13.m3u8");
    expect(sealed).not.toContain("media.example");
    expect(openLpfUrl(sealed)).toBe("https://media.example/lpf/13.m3u8");
  });

  it("rejects a tampered token", () => {
    const sealed = sealLpfUrl("https://media.example/lpf/13.m3u8");
    const tampered = (sealed[0] === "A" ? "B" : "A") + sealed.slice(1);
    expect(openLpfUrl(tampered)).toBeNull();
  });

  it("rejects garbage and non-https payloads", () => {
    expect(openLpfUrl("nope")).toBeNull();
    expect(openLpfUrl(sealLpfUrl("http://media.example/lpf/13.m3u8"))).toBeNull();
  });
});

describe("isLpfStreamHost", () => {
  const original = process.env.LPF_STREAM_HOSTS;

  afterEach(() => {
    process.env.LPF_STREAM_HOSTS = original;
  });

  it("matches configured hosts and their subdomains only", () => {
    process.env.LPF_STREAM_HOSTS = "media.example, .cdn.example";
    expect(isLpfStreamHost(new URL("https://media.example/lpf/1.m3u8"))).toBe(true);
    expect(isLpfStreamHost(new URL("https://edge.media.example/lpf/1.m3u8"))).toBe(true);
    expect(isLpfStreamHost(new URL("https://cdn.example/lpf/1.m3u8"))).toBe(true);
    expect(isLpfStreamHost(new URL("https://notmedia.example/lpf/1.m3u8"))).toBe(false);
    expect(isLpfStreamHost(new URL("http://media.example/lpf/1.m3u8"))).toBe(false);
  });

  it("allows nothing when unset", () => {
    delete process.env.LPF_STREAM_HOSTS;
    expect(isLpfStreamHost(new URL("https://media.example/lpf/1.m3u8"))).toBe(false);
  });
});

describe("rewriteLpfPlaylist", () => {
  beforeAll(() => {
    process.env.LPF_PROXY_SECRET = "test-relay-secret";
  });

  const playlist = [
    "#EXTM3U",
    '#EXT-X-KEY:METHOD=AES-128,URI="key.bin"',
    "#EXT-X-TARGETDURATION:6",
    "#EXTINF:6.000,",
    "seg/1.ts",
    "#EXTINF:6.000,",
    "https://media.example/lpf/seg/2.ts",
    "",
  ].join("\n");

  it("seals every reference and keeps the provider host out", () => {
    const out = rewriteLpfPlaylist(playlist, new URL("https://media.example/lpf/13.m3u8"));
    expect(out).not.toContain("media.example");
    expect(out).toContain("#EXTM3U");
    expect(out).toMatch(/#EXT-X-KEY:METHOD=AES-128,URI="\/api\/lpf\/stream\?t=/);

    const targets = [...out.matchAll(/\/api\/lpf\/stream\?t=([A-Za-z0-9_-]+)/g)].map((match) =>
      openLpfUrl(match[1])
    );
    expect(targets).toEqual([
      "https://media.example/lpf/key.bin",
      "https://media.example/lpf/seg/1.ts",
      "https://media.example/lpf/seg/2.ts",
    ]);
  });
});
