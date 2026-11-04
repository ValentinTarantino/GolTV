import { Resolver } from "node:dns/promises";
import { request } from "node:https";

export interface TextResponse {
  ok: boolean;
  status: number;
  text: string;
}

/**
 * Fetches one HTTPS document through an explicitly configured DNS resolver.
 * TLS still verifies the original hostname, so resolving an address never
 * weakens certificate validation or redirects requests to a different host.
 */
export async function fetchTextWithDnsServer(
  urlValue: string,
  dnsServer: string,
  headers: Record<string, string>,
): Promise<TextResponse> {
  const url = new URL(urlValue);
  if (url.protocol !== "https:") throw new Error("Only HTTPS URLs are supported");

  const resolver = new Resolver();
  resolver.setServers([dnsServer]);
  const [address] = await resolver.resolve4(url.hostname);
  if (!address) throw new Error("DNS resolver returned no IPv4 address");

  return new Promise((resolve, reject) => {
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
}
