/**
 * @jest-environment node
 */
import { GET, POST } from "@/app/api/viewers/route";

function makeGetRequest(url: string) {
  return new Request(url);
}

function makePostRequest(body: unknown) {
  return new Request("http://localhost/api/viewers", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("/api/viewers", () => {
  describe("GET", () => {
    it("returns 400 when matchId is missing", async () => {
      const res = await GET(makeGetRequest("http://localhost/api/viewers"));
      expect(res.status).toBe(400);
    });

    it("returns 0 viewers for a match nobody watches", async () => {
      const res = await GET(makeGetRequest("http://localhost/api/viewers?matchId=900001"));
      const data = await res.json();
      expect(res.status).toBe(200);
      expect(data.count).toBe(0);
    });
  });

  describe("POST", () => {
    it("returns 400 when body is empty", async () => {
      const res = await POST(makePostRequest({}));
      expect(res.status).toBe(400);
    });

    it("returns 400 for invalid matchId", async () => {
      const res = await POST(
        makePostRequest({ matchId: "abc", viewerId: "viewer-123" })
      );
      expect(res.status).toBe(400);
    });

    it("returns 400 for invalid viewerId", async () => {
      const res = await POST(
        makePostRequest({ matchId: "900002", viewerId: "bad id!" })
      );
      expect(res.status).toBe(400);
    });

    it("counts distinct viewers of the same match", async () => {
      const first = await POST(
        makePostRequest({ matchId: "900003", viewerId: "viewer-aaaa" })
      );
      const firstData = await first.json();
      expect(firstData.count).toBe(1);

      const second = await POST(
        makePostRequest({ matchId: "900003", viewerId: "viewer-bbbb" })
      );
      const secondData = await second.json();
      expect(secondData.count).toBe(2);
    });

    it("heartbeat from the same viewer does not double count", async () => {
      const body = { matchId: "900004", viewerId: "viewer-cccc" };
      await POST(makePostRequest(body));
      const again = await POST(makePostRequest(body));
      const data = await again.json();
      expect(data.count).toBe(1);
    });

    it("does not count viewers from other matches", async () => {
      await POST(makePostRequest({ matchId: "900005", viewerId: "viewer-dddd" }));
      const res = await GET(makeGetRequest("http://localhost/api/viewers?matchId=900006"));
      const data = await res.json();
      expect(data.count).toBe(0);
    });

    it("action leave removes the viewer immediately", async () => {
      await POST(makePostRequest({ matchId: "900007", viewerId: "viewer-eeee" }));
      const res = await POST(
        makePostRequest({ matchId: "900007", viewerId: "viewer-eeee", action: "leave" })
      );
      const data = await res.json();
      expect(res.status).toBe(200);
      expect(data.count).toBe(0);
    });

    it("GET after leave returns 0", async () => {
      await POST(makePostRequest({ matchId: "900008", viewerId: "viewer-ffff" }));
      await POST(
        makePostRequest({ matchId: "900008", viewerId: "viewer-ffff", action: "leave" })
      );
      const res = await GET(makeGetRequest("http://localhost/api/viewers?matchId=900008"));
      const data = await res.json();
      expect(data.count).toBe(0);
    });

    it("leave of an unknown viewer does not break and keeps others", async () => {
      await POST(makePostRequest({ matchId: "900009", viewerId: "viewer-gggg" }));
      const res = await POST(
        makePostRequest({ matchId: "900009", viewerId: "viewer-hhhh", action: "leave" })
      );
      const data = await res.json();
      expect(res.status).toBe(200);
      expect(data.count).toBe(1);
    });

    it("returns 400 for an invalid action", async () => {
      const res = await POST(
        makePostRequest({ matchId: "900010", viewerId: "viewer-iiii", action: "bye" })
      );
      expect(res.status).toBe(400);
    });
  });
});
