import "@testing-library/jest-dom";

// Mock @upstash/redis to avoid ESM import issues in tests
jest.mock("@upstash/redis", () => ({
  Redis: jest.fn().mockImplementation(() => ({
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue("OK"),
    del: jest.fn().mockResolvedValue(1),
    incr: jest.fn().mockResolvedValue(1),
    pexpire: jest.fn().mockResolvedValue(1),
  })),
}));

// Mock @upstash/ratelimit
jest.mock("@upstash/ratelimit", () => ({
  Ratelimit: {
    slidingWindow: jest.fn().mockReturnValue({
      limit: jest.fn().mockResolvedValue({
        success: true,
        limit: 60,
        remaining: 59,
        reset: Date.now() + 60000,
      }),
    }),
  },
}));