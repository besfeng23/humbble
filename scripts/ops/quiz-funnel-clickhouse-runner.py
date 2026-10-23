#!/usr/bin/env python3
"""Runs ClickHouse SQL on a local, in-process engine (chdb) for scripts/ops/__tests__/quiz-funnel-clickhouse-queries.test.js.

stdin : JSON {"batches": [{"setup": ["CREATE TABLE ...", "INSERT ..."], "queries": ["SELECT ...", ...]}, ...]}
        (one engine session for all batches; each batch should DROP/CREATE its own tables)
stdout: JSON list with, per batch, one list of row objects per query (JSONEachRow, 64-bit integers as numbers).
exit  : 0 ok, 77 chdb is not installed (the jest test then skips the engine tests), 1 any SQL error (message on stderr).

Local only: no network, no project, no credential. Install for local runs with `pip install chdb` (in a virtualenv).
"""
import json
import sys

try:
    from chdb import session
except ImportError:
    sys.stderr.write('chdb is not installed\n')
    sys.exit(77)


def main():
    req = json.load(sys.stdin)
    s = session.Session()
    try:
        result = []
        for batch in req.get('batches', []):
            for stmt in batch.get('setup', []):
                s.query(stmt)
            out = []
            for q in batch.get('queries', []):
                text = str(s.query(q.rstrip().rstrip(';'), 'JSONEachRow'))
                out.append([json.loads(line) for line in text.splitlines() if line.strip()])
            result.append(out)
        json.dump(result, sys.stdout)
    finally:
        s.cleanup()


if __name__ == '__main__':
    try:
        main()
    except Exception as e:  # noqa: BLE001 - surface any engine error to the caller
        sys.stderr.write(f'{type(e).__name__}: {e}\n')
        sys.exit(1)
