/**
 * @jest-environment node
 */
import { GET, POST } from "@/app/api/chat/route";

function makeGetRequest(url: string) {
  return new Request(url);
}

function makePostRequest(body: unknown) {
  return new Request("http://localhost/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("/api/chat", () => {
  describe("GET", () => {
    it("returns 400 when matchId is missing", async () => {
      const req = makeGetRequest("http://localhost/api/chat");
      const res = await GET(req);
      expect(res.status).toBe(400);
    });

    it("returns empty messages for new match", async () => {
      const req = makeGetRequest("http://localhost/api/chat?matchId=12345");
      const res = await GET(req);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(Array.isArray(data.messages)).toBe(true);
    });

    it("returns messages after POST", async () => {
      const postReq = makePostRequest({ matchId: "11111", nick: "TestUser", text: "Hello!" });
      await POST(postReq);

      const getReq = makeGetRequest("http://localhost/api/chat?matchId=11111");
      const res = await GET(getReq);
      const data = await res.json();

      expect(data.messages.length).toBe(1);
      expect(data.messages[0].text).toBe("Hello!");
      expect(data.messages[0].nick).toBe("TestUser");
    });

    it("respects offset parameter", async () => {
      const postReq = makePostRequest({ matchId: "22222", nick: "User1", text: "Msg 1" });
      await POST(postReq);

      const futureOffset = Date.now() + 1000000;
      const getReq = makeGetRequest(`http://localhost/api/chat?matchId=22222&offset=${futureOffset}`);
      const res = await GET(getReq);
      const data = await res.json();

      expect(data.messages).toHaveLength(0);
    });
  });

  describe("POST", () => {
    it("returns 400 when fields are missing", async () => {
      const req = makePostRequest({});
      const res = await POST(req);
      expect(res.status).toBe(400);
    });

    it("returns 400 when matchId is missing", async () => {
      const req = makePostRequest({ nick: "User", text: "Hi" });
      const res = await POST(req);
      expect(res.status).toBe(400);
    });

    it("returns 400 for invalid nick", async () => {
      const req = makePostRequest({ matchId: "123", nick: "", text: "Hi" });
      const res = await POST(req);
      expect(res.status).toBe(400);
    });

    it("returns 400 for invalid message", async () => {
      const req = makePostRequest({ matchId: "123", nick: "User", text: "" });
      const res = await POST(req);
      expect(res.status).toBe(400);
    });

    it("sanitizes HTML tags in messages", async () => {
      const req = makePostRequest({ matchId: "33333", nick: "Hacker", text: "<script>alert('xss')</script>Goool!" });
      const res = await POST(req);
      expect(res.status).toBe(200);

      const getReq = makeGetRequest("http://localhost/api/chat?matchId=33333");
      const getRes = await GET(getReq);
      const data = await getRes.json();

      expect(data.messages[0].text).not.toContain("<script>");
      expect(data.messages[0].text).toContain("Goool!");
    });

    it("returns 400 for invalid matchId format", async () => {
      const req = makePostRequest({ matchId: "abc", nick: "User", text: "Hi" });
      const res = await POST(req);
      expect(res.status).toBe(400);
    });

    it("returns 400 for invalid JSON body", async () => {
      const req = new Request("http://localhost/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "not json",
      });
      const res = await POST(req);
      expect(res.status).toBe(400);
    });
  });
});
