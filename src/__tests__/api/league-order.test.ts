/** @jest-environment node */
import { NextRequest } from "next/server";
import { GET, POST } from "@/app/api/admin/league-order/route";
import { ADMIN_SESSION_COOKIE, createAdminSessionValue } from "@/lib/admin-session";
import { loadLeagueOrder, saveLeagueOrder } from "@/lib/league-order";

jest.mock("@/lib/mongo", () => ({
  getDb: jest.fn().mockResolvedValue(null),
}));

jest.mock("@/lib/league-order", () => ({
  loadLeagueOrder: jest.fn().mockResolvedValue([]),
  saveLeagueOrder: jest.fn(),
}));

function request(method: "GET" | "POST", body?: unknown, session?: string) {
  return new NextRequest("http://localhost/api/admin/league-order", {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(session ? { cookie: `${ADMIN_SESSION_COOKIE}=${session}` } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

describe("/api/admin/league-order", () => {
  const previousSecret = process.env.ADMIN_SECRET;

  beforeAll(() => {
    process.env.ADMIN_SECRET = "test-secret";
  });

  afterAll(() => {
    if (previousSecret === undefined) delete process.env.ADMIN_SECRET;
    else process.env.ADMIN_SECRET = previousSecret;
  });

  beforeEach(() => {
    jest.clearAllMocks();
    (loadLeagueOrder as jest.Mock).mockResolvedValue([]);
    (saveLeagueOrder as jest.Mock).mockImplementation(async (value: unknown) => ({
      order: value, persisted: false,
    }));
  });

  it("rejects a visitor without a signed session", async () => {
    expect((await GET(request("GET"))).status).toBe(401);
    expect((await POST(request("POST", { order: [332] }))).status).toBe(401);
    expect(saveLeagueOrder).not.toHaveBeenCalled();
  });

  it("rejects a forged session value", async () => {
    expect((await POST(request("POST", { order: [332] }, "9999999999999.forged"))).status).toBe(401);
    expect(saveLeagueOrder).not.toHaveBeenCalled();
  });

  it("returns the stored order to the admin", async () => {
    (loadLeagueOrder as jest.Mock).mockResolvedValue([267, 265]);
    const res = await GET(request("GET", undefined, createAdminSessionValue() ?? ""));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ order: [267, 265] });
  });

  it("rejects a payload without an order array", async () => {
    const session = createAdminSessionValue() ?? "";
    expect((await POST(request("POST", { order: "332" }, session))).status).toBe(400);
    expect((await POST(request("POST", {}, session))).status).toBe(400);
    expect(saveLeagueOrder).not.toHaveBeenCalled();
  });

  it("saves the order for the admin", async () => {
    const res = await POST(request("POST", { order: [332, 129] }, createAdminSessionValue() ?? ""));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      success: true, order: [332, 129], persisted: false,
    });
    expect(saveLeagueOrder).toHaveBeenCalledWith([332, 129]);
  });

  it("accepts an empty list as back to the natural order", async () => {
    const res = await POST(request("POST", { order: [] }, createAdminSessionValue() ?? ""));
    expect(res.status).toBe(200);
    expect(saveLeagueOrder).toHaveBeenCalledWith([]);
  });
});
