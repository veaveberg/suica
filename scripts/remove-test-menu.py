"""Remove only the legacy Google/test Telegram menu button; safe to rerun."""
import json
import time
import subprocess
import sys
import urllib.request
import ssl
import certifi

try:
    result = subprocess.run(['npx', 'convex', 'env', 'get', 'TELEGRAM_BOT_TOKEN'], capture_output=True, text=True, timeout=25)
    token = result.stdout.strip()
    if result.returncode or not token or ':' not in token:
        raise RuntimeError('Cannot read TELEGRAM_BOT_TOKEN from the configured Convex deployment')

    def api(method, body):
        request = urllib.request.Request('https://api.telegram.org/bot' + token + '/' + method + '?request_id=' + str(time.time_ns()),
                                        data=json.dumps(body).encode(), headers={'Content-Type': 'application/json'})
        with urllib.request.urlopen(request, timeout=15, context=ssl.create_default_context(cafile=certifi.where())) as response:
            value = json.load(response)
        if not value.get('ok'):
            raise RuntimeError('Telegram API rejected ' + method + ': ' + value.get('description', 'unknown'))
        return value['result']

    bot = api('getMe', {})
    if bot.get('username') != 'suica_ekabot':
        raise RuntimeError('Configured token belongs to a different bot')
    menu = api('getChatMenuButton', {})
    print('Current menu:', json.dumps(menu, ensure_ascii=False))
    if menu.get('type') != 'web_app':
        print('No legacy web app menu button to remove.')
    else:
        from urllib.parse import urlparse
        host = urlparse(menu.get('web_app', {}).get('url', '')).hostname
        if menu.get('text', '').strip().lower() != 'test' or host not in ['google.com', 'www.google.com']:
            raise RuntimeError('Menu does not match the reported Test/Google button; leaving it unchanged')
        if '--apply' in sys.argv:
            api('setChatMenuButton', {'menu_button': json.dumps({'type': 'commands'})})
            updated = api('getChatMenuButton', {})
            print('Resulting menu:', json.dumps(updated))
            if updated.get('type') == 'web_app':
                raise RuntimeError('Menu removal could not be verified')
            print('Removed Test/Google button. Verified command menu:', json.dumps(updated))
        else:
            print('Run with --apply to replace the Test/Google button with the command menu.')
except subprocess.TimeoutExpired:
    print('Convex token lookup timed out.', file=sys.stderr)
    sys.exit(1)
except Exception as error:
    # Never print URL-bearing network exceptions, which can contain the bot token.
    print('Menu update failed:', str(error) if isinstance(error, RuntimeError) else type(error).__name__, file=sys.stderr)
    sys.exit(1)
