/**
 * @jest-environment node
 */
import { createCipheriv, randomBytes } from "node:crypto";
import {
  decodePostPlayer,
  decryptAesPayload,
  extractStreamUrl,
  isLpfStreamHost,
  openLpfUrl,
  rewriteLpfPlaylist,
  sealLpfUrl,
} from "@/lib/lpf-play";
import { GET as listChannels } from "@/app/api/lpf/route";
import { GET as resolveChannel } from "@/app/api/lpf/[id]/route";

const b64url = (buffer: Buffer): string => buffer.toString("base64url");

/** Builds the `div.aes-v` + key-material script the source publishes. */
function buildEncryptedDocument(plain: string): string {
  const key = randomBytes(32);
  const mask = randomBytes(7);
  const masked = [...key].map((byte, index) => byte ^ mask[index % mask.length]);
  const iv = randomBytes(12);

  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const cipherText = Buffer.concat([cipher.update(plain, "utf8"), cipher.final(), cipher.getAuthTag()]);

  return [
    "<!DOCTYPE html><html><body>",
    `<div class="aes-v" data-iv="${b64url(iv)}" data-ct="${b64url(cipherText)}"></div>`,
    "<script>",
    `var _m = [${[...mask].join(",")}];`,
    `var _rk = new Uint8Array([${masked.join(",")}]).map(function (b, i) { return b ^ _m[i % _m.length]; });`,
    "</script>",
    "</body></html>",
  ].join("\n");
}

/** Wraps an encrypted document in the post's `unescape('%3C…')` payload. */
function buildPostHtml(document: string, options: { hashCfg?: boolean } = {}): string {
  const cfg = b64url(Buffer.from(document, "utf8"));
  const src = options.hashCfg
    ? `https://player.example/#embed=1&cfg=${cfg}`
    : `https://player.example/?cfg=${cfg}&embed=1`;
  const payload = `<html><body><iframe src="${src}" width="640" height="360"></iframe></body></html>`;
  return `<html><body><div class="post-body"><script language="javascript">document.write(unescape('${encodeURIComponent(
    payload
  )}'))</script></div></body></html>`;
}

const PLAYER_HTML = `<html><body><video id="flow" src="https://teleapp.example/api/proxy?url=https://media.example:443/lpf/13.m3u8"></video></body></html>`;

/**
 * The real posts hand over `cfg` as standard base64 with some characters left
 * percent-encoded (`%2B` instead of `+`), which used to truncate the payload.
 */
function percentEncodedCfg(document: string): string {
  for (let pad = 0; pad < 8; pad += 1) {
    const candidate = Buffer.from(" ".repeat(pad) + document, "utf8").toString("base64");
    if (candidate.includes("+")) return encodeURIComponent(candidate);
  }
  throw new Error("could not build a base64 payload containing '+'");
}

describe("decryptAesPayload", () => {
  it("unmasks the key and decrypts the GCM payload", () => {
    const document = buildEncryptedDocument(PLAYER_HTML);
    expect(decryptAesPayload(document)).toBe(PLAYER_HTML);
  });

  it("returns null when the auth tag does not match", () => {
    const document = buildEncryptedDocument(PLAYER_HTML).replace(/data-ct="([A-Za-z0-9_-])/, (_m, first: string) =>
      `data-ct="${first === "A" ? "B" : "A"}`
    );
    expect(decryptAesPayload(document)).toBeNull();
  });

  it("returns null without key material", () => {
    expect(decryptAesPayload('<div class="aes-v" data-iv="AAAAAAAAAAAAAAAA" data-ct="AAAA"></div>')).toBeNull();
  });
});

describe("decodePostPlayer", () => {
  it("unwraps the unescape payload and the cfg parameter", () => {
    const document = buildEncryptedDocument(PLAYER_HTML);
    expect(decodePostPlayer(buildPostHtml(document))).toBe(PLAYER_HTML);
  });

  it("also reads cfg from a hash fragment", () => {
    const document = buildEncryptedDocument(PLAYER_HTML);
    expect(decodePostPlayer(buildPostHtml(document, { hashCfg: true }))).toBe(PLAYER_HTML);
  });

  it("survives a cfg whose '+' characters stayed percent-encoded", () => {
    const cfg = percentEncodedCfg(buildEncryptedDocument(PLAYER_HTML));
    const payload = `<html><body><iframe src="https://player.example/?cfg=${cfg}&embed=1"></iframe></body></html>`;
    const post = `<html><body><div class="post-body"><script>document.write(unescape('${encodeURIComponent(
      payload
    )}'))</script></div></body></html>`;

    expect(decodePostPlayer(post)).toBe(PLAYER_HTML);
  });

  it("returns null for a post without a payload", () => {
    expect(decodePostPlayer("<html><body><div class='post-body'>nothing</div></body></html>")).toBeNull();
  });
});

describe("extractStreamUrl", () => {
  it("prefers the decoded url= parameter and drops the default port", () => {
    expect(extractStreamUrl(PLAYER_HTML)).toBe("https://media.example/lpf/13.m3u8");
  });

  it("accepts a bare playlist", () => {
    expect(extractStreamUrl('<source src="https://media.example/lpf/2.m3u8">')).toBe(
      "https://media.example/lpf/2.m3u8"
    );
  });

  it("ignores plain http", () => {
    expect(extractStreamUrl('<source src="http://media.example/lpf/2.m3u8">')).toBeNull();
  });
});

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

describe("LPF API routes", () => {
  const origin = "https://lpf-source-a.test";
  const postUrl = `${origin}/2026/10/lpf-play-12-en-vivo.html`;
  const olderPostUrl = `${origin}/2026/05/lpf-play-en-vivo.html`;

  beforeAll(() => {
    process.env.LPF_SOURCE_URL = origin;
    process.env.LPF_PROXY_SECRET = "test-relay-secret";

    const sitemap = `<urlset><url><loc>${origin}/sitemap.xml?page=1</loc></url><url><loc>${origin}/sitemap.xml?page=2</loc></url></urlset>`;
    const page1 = `<urlset><url><loc>${postUrl}</loc></url><url><loc>${origin}/2026/10/lpf-play-3-en-vivo.html</loc></url><url><loc>${origin}/2026/10/lpf-play-1-en-vivo.html</loc></url><url><loc>${origin}/2026/10/otro-post.html</loc></url></urlset>`;
    const page2 = `<urlset><url><loc>${olderPostUrl}</loc></url></urlset>`;
    const post = buildPostHtml(buildEncryptedDocument(PLAYER_HTML));

    global.fetch = jest.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      if (url.endsWith("/sitemap.xml")) return new Response(sitemap, { status: 200 });
      if (url.endsWith("sitemap.xml?page=1")) return new Response(page1, { status: 200 });
      if (url.endsWith("sitemap.xml?page=2")) return new Response(page2, { status: 200 });
      if (url === postUrl || url === olderPostUrl) return new Response(post, { status: 200 });
      return new Response("not found", { status: 404 });
    }) as unknown as typeof fetch;
  });

  it("lists channels without leaking the source or the provider", async () => {
    const response = await listChannels();
    const raw = await response.text();

    expect(response.status).toBe(200);
    expect(raw).not.toContain("http");
    expect(raw).not.toContain("blogspot");
    expect(raw).not.toContain(origin);
    expect(raw).not.toContain("lpf-play-12");

    const body = JSON.parse(raw) as { channels: Array<{ id: string; label: string; number: number }> };
    expect(body.channels).toHaveLength(4);
    // Unnumbered "LPF Play" leads, then 1, 3, 12 ascending.
    expect(body.channels.map((channel) => channel.label)).toEqual([
      "LPF Play",
      "LPF Play 1",
      "LPF Play 3",
      "LPF Play 12",
    ]);
    expect(body.channels[0].id).toMatch(/^lpf_[a-f0-9]{16}$/);
    expect(body.channels[3]).toEqual({
      id: expect.stringMatching(/^lpf_[a-f0-9]{16}$/),
      label: "LPF Play 12",
      number: 12,
    });
  });

  it("resolves a channel to a sealed relay URL", async () => {
    const list = await (await listChannels()).json();
    const id = (list as { channels: Array<{ id: string }> }).channels[0].id;

    const response = await resolveChannel(new Request("https://app.test/api/lpf/x"), {
      params: Promise.resolve({ id }),
    });
    const raw = await response.text();

    expect(response.status).toBe(200);
    expect(raw).not.toContain("media.example");
    expect(raw).not.toContain(origin);

    const { src } = JSON.parse(raw) as { src: string };
    expect(src.startsWith("/api/lpf/stream?t=")).toBe(true);
    expect(openLpfUrl(src.split("t=")[1])).toBe("https://media.example/lpf/13.m3u8");
  });

  it("404s for an unknown or malformed id", async () => {
    for (const id of ["lpf_0000000000000000", "../../etc/passwd", "lpf_zz"]) {
      const response = await resolveChannel(new Request("https://app.test/api/lpf/x"), {
        params: Promise.resolve({ id }),
      });
      expect(response.status).toBe(404);
    }
  });
});
