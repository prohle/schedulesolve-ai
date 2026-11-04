# Root tests

One file lives here on purpose.

`test_smoke.py` is the **repo-root entry point**. `pytest.ini` sets
`pythonpath = backend`, so this test imports the app exactly as a fresh
checkout would and proves the seed solves to a full, optimal timetable on
**both** engines — CP-SAT and the native C++ core.

It answers one question in about fifteen seconds: *does this checkout work?*
The other 182 tests live in [`backend/tests/`](../backend/tests) and cover the
solver, ingestion, the agent loop, the API and the student planner.

Run everything from the repository root:

```bash
python -m pytest -q      # 183 passed
```
