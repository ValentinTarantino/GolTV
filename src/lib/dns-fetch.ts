export interface TextResponse {
  ok: boolean;
  status: number;
  text: string;
}

/**
 * Fetches one HTTPS document through an explicitly configured DNS resolver.
 * TLS still verifies the original hostname, so resolving an address never
 * weakens certificate validation or redirects requests to a different host.
 *
 * On runtimes without a custom DNS resolver (Cloudflare Workers) the edge's
 * own resolution is used instead — `fetch` goes through Cloudflare DNS.
 */
export async function fetchTextWithDnsServer(
  urlValue: string,
  dnsServer: string,
  headers: Record<string, string>,
): Promise<TextResponse> {
  const url = new URL(urlValue);
  if (url.protocol !== "https:") throw new Error("Only HTTPS URLs are supported");

  try {
    const [{ Resolver }, { request }] = await Promise.all([
      import("node:dns/promises"),
      import("node:https"),
    ]);

    const resolver = new Resolver();
    resolver.setServers([dnsServer]);
    const [address] = await resolver.resolve4(url.hostname);
    if (!address) throw new Error("DNS resolver returned no IPv4 address");

    return await new Promise<TextResponse>((resolve, reject) => {
      const requestHandle = request({
        protocol: "https:",
        hostname: address,
        servername: url.hostname,
        method: "GET",
        path: `${url.pathname}${url.search}`,
        headers: { ...headers, Host: url.host },
        timeout: 15_000,
      }, (response) => {
        const chunks: Buffer[] = [];
        response.on("data", (chunk: Buffer) => chunks.push(chunk));
        response.on("end", () => {
          const status = response.statusCode ?? 0;
          resolve({ ok: status >= 200 && status < 300, status, text: Buffer.concat(chunks).toString("utf8") });
        });
      });
      requestHandle.on("timeout", () => requestHandle.destroy(new Error("Request timed out")));
      requestHandle.on("error", reject);
      requestHandle.end();
    });
  } catch (error) {
    // No custom resolver available (edge runtime) or the pinned request
    // failed — retry through the platform fetch, which uses system DNS.
    const res = await fetch(urlValue, { headers });
    return { ok: res.ok, status: res.status, text: await res.text() };
  }
}
