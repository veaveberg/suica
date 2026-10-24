"""Configure the deployed Suica bot without printing credentials."""
import json
import secrets
import ssl
import subprocess
import sys
import urllib.parse
import urllib.request
import certifi

DEPLOYMENT = 'flexible-leopard-684'
APP_URL = 'https://suica.samshabrg.org/'
WEBHOOK_URL = 'https://' + DEPLOYMENT + '.convex.site/telegram/webhook'

def convex(*args):
    return subprocess.run(['npx', 'convex', 'env', *args, '--deployment', DEPLOYMENT], capture_output=True, text=True, timeout=40)

def get(name):
    result = convex('get', name)
    return result.stdout.strip() if result.returncode == 0 else None

def put(name, value):
    if convex('set', name, value).returncode:
        raise RuntimeError('Could not configure ' + name)
    print('Configured', name)

try:
    token = get('TELEGRAM_BOT_TOKEN')
    if not token or ':' not in token:
        raise RuntimeError('Bot token unavailable')
    def api(method, body):
        fields = {key: json.dumps(value) if isinstance(value, (dict, list)) else value for key, value in body.items()}
        req = urllib.request.Request('https://api.telegram.org/bot' + token + '/' + method,
                                     data=urllib.parse.urlencode(fields).encode(), headers={'Content-Type': 'application/x-www-form-urlencoded'})
        with urllib.request.urlopen(req, timeout=20, context=ssl.create_default_context(cafile=certifi.where())) as response:
            result = json.load(response)
        if not result.get('ok'):
            raise RuntimeError('Telegram rejected ' + method)
        return result['result']
    if api('getMe', {}).get('username') != 'suica_ekabot':
        raise RuntimeError('Wrong bot')
    current = api('getWebhookInfo', {})
    if current.get('url') not in ['', WEBHOOK_URL]:
        raise RuntimeError('Existing webhook belongs to another service')
    secret = get('TELEGRAM_WEBHOOK_SECRET')
    if not secret or secret == 'undefined':
        secret = secrets.token_urlsafe(32)
        put('TELEGRAM_WEBHOOK_SECRET', secret)
    put('SUICA_APP_URL', APP_URL)
    api('setWebhook', {'url': WEBHOOK_URL, 'secret_token': secret, 'allowed_updates': ['message', 'callback_query']})
    api('setMyCommands', {'commands': [{'command': 'language', 'description': 'Choose bot language / Выбрать язык'}]})
    api('setMyCommands', {'scope': {'type': 'chat', 'chat_id': 129516266}, 'commands': [{'command': 'language', 'description': 'Choose bot language / Выбрать язык'}, {'command': 'test_notification', 'description': 'Test attendance reminder for your last class'}]})
    print('Verified developer commands:', json.dumps(api('getMyCommands', {'scope': {'type': 'chat', 'chat_id': 129516266}}), ensure_ascii=False))
    api('setChatMenuButton', {'menu_button': {'type': 'commands'}})
    info = api('getWebhookInfo', {})
    if info.get('url') != WEBHOOK_URL:
        raise RuntimeError('Webhook verification failed')
    print('Verified webhook:', info['url'])
    print('Verified commands:', json.dumps(api('getMyCommands', {}), ensure_ascii=False))
    print('Verified menu:', json.dumps(api('getChatMenuButton', {}), ensure_ascii=False))
    # Check that the deployed route rejects unsigned traffic.
    try:
        urllib.request.urlopen(urllib.request.Request(WEBHOOK_URL, data=b'{}', headers={'Content-Type': 'application/json'}),
                               timeout=20, context=ssl.create_default_context(cafile=certifi.where()))
        raise RuntimeError('Webhook allowed unsigned traffic')
    except urllib.error.HTTPError as error:
        if error.code != 401:
            raise RuntimeError('Unexpected webhook status')
        print('Verified unsigned webhook rejection: 401')
    # Authenticated irrelevant update exercises the real route without messaging anyone.
    request = urllib.request.Request(WEBHOOK_URL, data=b'{"update_id":0}', headers={'Content-Type': 'application/json', 'X-Telegram-Bot-Api-Secret-Token': secret})
    with urllib.request.urlopen(request, timeout=20, context=ssl.create_default_context(cafile=certifi.where())) as response:
        if response.status != 200:
            raise RuntimeError('Authenticated webhook verification failed')
        print('Verified authenticated webhook: 200')
    put('TEACHER_NOTIFICATIONS_ENABLED', 'true')
except Exception as error:
    print('Bot configuration failed:', str(error) if isinstance(error, RuntimeError) else type(error).__name__, file=sys.stderr)
    sys.exit(1)
