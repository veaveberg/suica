"""Backfill and audit per-lesson jobs; repeat safely to verify idempotence."""
import json
import subprocess

def pages(function, keys):
    cursor = None
    totals = {key: 0 for key in keys}
    while True:
        result = subprocess.run(['npx', 'convex', 'run', 'notifications:' + function, json.dumps({'cursor': cursor}), '--deployment', 'flexible-leopard-684'], capture_output=True, text=True, timeout=60)
        if result.returncode:
            raise RuntimeError('Reminder ' + function + ' failed: ' + result.stderr)
        value = json.loads(result.stdout)
        for key in keys:
            totals[key] += value[key]
        if value['done']:
            return totals
        cursor = value['cursor']

print('Initial scheduling:', pages('backfillReminders', ['changed', 'scanned']), flush=True)
print('Repeat scheduling:', pages('backfillReminders', ['changed', 'scanned']), flush=True)
audit = pages('auditReminderJobs', ['pending', 'mismatched'])
print('Live scheduled job audit:', audit, flush=True)
if audit['mismatched']:
    raise RuntimeError('Reminder jobs do not match lesson times')
