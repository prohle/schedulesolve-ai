#!/usr/bin/env python3
"""Smoke load test for a running deployment.

Not a capacity benchmark — a check that the public demo stays responsive under
concurrent clicks, which is the only load it will see. Hits the cheap endpoints
that every judge touches first (`/status`, `/engines`) and reports latency
percentiles plus the error rate.

    python backend/scripts/loadtest.py --url https://<host> --concurrency 10 --requests 100

Exits non-zero if any request fails, so it can gate a release.
"""

from __future__ import annotations

import argparse
import asyncio
import statistics
import time

import httpx

PATHS = ["/status", "/engines"]


async def one(client: httpx.AsyncClient, url: str, path: str) -> tuple[float, int]:
    started = time.perf_counter()
    try:
        response = await client.get(f"{url}{path}")
        return time.perf_counter() - started, response.status_code
    except httpx.HTTPError:
        return time.perf_counter() - started, 0


async def run(url: str, concurrency: int, requests: int) -> int:
    limits = httpx.Limits(max_connections=concurrency, max_keepalive_connections=concurrency)
    async with httpx.AsyncClient(timeout=120.0, limits=limits) as client:
        # warm the container so cold-start does not pollute the percentiles
        await one(client, url, "/status")

        semaphore = asyncio.Semaphore(concurrency)
        latencies: list[float] = []
        failures: list[int] = []

        async def worker(index: int) -> None:
            path = PATHS[index % len(PATHS)]
            async with semaphore:
                elapsed, status = await one(client, url, path)
                latencies.append(elapsed)
                if status != 200:
                    failures.append(status)

        started = time.perf_counter()
        await asyncio.gather(*(worker(i) for i in range(requests)))
        wall = time.perf_counter() - started

    ordered = sorted(latencies)

    def pct(p: float) -> float:
        return ordered[min(len(ordered) - 1, int(len(ordered) * p))] * 1000

    print(f"requests   {len(latencies)}  ({len(failures)} failed)")
    print(f"wall       {wall:.2f}s  ({len(latencies) / wall:.1f} req/s)")
    print(f"median     {statistics.median(ordered) * 1000:.0f} ms")
    print(f"p95        {pct(0.95):.0f} ms")
    print(f"p99        {pct(0.99):.0f} ms")
    print(f"max        {ordered[-1] * 1000:.0f} ms")

    if failures:
        print(f"FAILED statuses: {sorted(set(failures))}")
        return 1
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--url", required=True, help="base URL, e.g. https://host")
    parser.add_argument("--concurrency", type=int, default=10)
    parser.add_argument("--requests", type=int, default=100)
    args = parser.parse_args()
    return asyncio.run(run(args.url.rstrip("/"), args.concurrency, args.requests))


if __name__ == "__main__":
    raise SystemExit(main())
