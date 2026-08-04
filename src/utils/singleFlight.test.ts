import { describe, it, expect, vi } from "vitest";
import { createSingleFlight } from "./singleFlight";

const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

describe("createSingleFlight", () => {
  it("shares one in-flight promise for the same key", async () => {
    const flight = createSingleFlight<string>();
    const d = deferred<string>();
    const fn = vi.fn(() => d.promise);

    const a = flight("k", fn);
    const b = flight("k", fn);

    expect(fn).toHaveBeenCalledTimes(1);
    d.resolve("done");
    await expect(a).resolves.toBe("done");
    await expect(b).resolves.toBe("done");
  });

  it("does not share across different keys", () => {
    const flight = createSingleFlight<string>();
    const fn = vi.fn(() => Promise.resolve("x"));
    flight("a", fn);
    flight("b", fn);
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("clears the slot after settle so later calls re-run", async () => {
    const flight = createSingleFlight<string>();
    const fn = vi.fn(() => Promise.resolve("v"));
    await flight("k", fn);
    await flight("k", fn);
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("clears the slot on rejection", async () => {
    const flight = createSingleFlight<string>();
    const failing = vi.fn(() => Promise.reject(new Error("x")));
    await expect(flight("k", failing)).rejects.toThrow("x");
    const ok = vi.fn(() => Promise.resolve("ok"));
    await expect(flight("k", ok)).resolves.toBe("ok");
    expect(failing).toHaveBeenCalledTimes(1);
    expect(ok).toHaveBeenCalledTimes(1);
  });

  it("never dedupes an empty key", () => {
    const flight = createSingleFlight<string>();
    const fn = vi.fn(() => Promise.resolve("x"));
    flight("", fn);
    flight("", fn);
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("isolates separate flight instances", async () => {
    const flightA = createSingleFlight<string>();
    const flightB = createSingleFlight<string>();
    const dA = deferred<string>();
    const dB = deferred<string>();
    const fnA = vi.fn(() => dA.promise);
    const fnB = vi.fn(() => dB.promise);
    flightA("k", fnA);
    flightB("k", fnB);
    expect(fnA).toHaveBeenCalledTimes(1);
    expect(fnB).toHaveBeenCalledTimes(1);
    dA.resolve("a");
    dB.resolve("b");
  });
});
