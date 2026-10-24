import assert from 'node:assert/strict';
import { test } from 'node:test';
import { botLanguages, botCopy, defaultBotLanguage, attendanceMessage, languageKeyboard, parseLanguageUpdate } from '../convex/botLanguage.ts';
const from = { id: 1234, is_bot: false, language_code: 'uk' };
const chat = { id: 1234, type: 'private' };
const command = text => ({ update_id: 10, message: { from, chat, text } });
const callback = data => ({ update_id: 11, callback_query: { id: 'callback-1', from, data, message: { message_id: 42, chat } } });
test('all five languages have translated notifications and self-named choices', () => {
    assert.deepEqual(botLanguages, ['en', 'ru', 'uk', 'be', 'ka']);
    const messages = botLanguages.map(language => attendanceMessage(language, { groupName: 'Bachata' }));
    assert.equal(new Set(messages.map(message => message.text)).size, 5);
    assert.equal(new Set(messages.map(message => message.button)).size, 5);
    for (const language of botLanguages) {
        const keyboard = languageKeyboard(language).inline_keyboard.flat();
        assert.equal(keyboard.length, 5);
        assert.deepEqual(keyboard.filter(button => button.text.startsWith('✓ ')).map(button => button.callback_data), [`language:${language}`]);
        assert.equal(keyboard.find(button => button.callback_data === 'language:be').text.replace('✓ ', ''), 'Беларуская');
        assert.ok(botCopy[language].saved);
    }
});
test('Telegram language defaults handle regional and unsupported codes', () => {
    assert.equal(defaultBotLanguage('ru-RU'), 'ru');
    assert.equal(defaultBotLanguage('ka'), 'ka');
    assert.equal(defaultBotLanguage('be'), 'be');
    assert.equal(defaultBotLanguage('de'), 'en');
    assert.equal(defaultBotLanguage(undefined), 'en');
});
test('start and language commands open settings; normal chat is ignored', () => {
    for (const text of ['/start', '/start referral', '/language', '/language@suica_ekabot', '/settings', '/help']) {
        assert.deepEqual(parseLanguageUpdate(command(text)), { kind: 'choose', updateId: 10, telegramId: '1234', defaultLanguage: 'uk' });
    }
    for (const text of ['hello', '/languages', '/unknown']) assert.equal(parseLanguageUpdate(command(text)), null);
});
test('language callbacks cannot change another chat user or accept unsupported values', () => {
    assert.deepEqual(parseLanguageUpdate(callback('language:be')), { kind: 'save', updateId: 11, telegramId: '1234', language: 'be', callbackId: 'callback-1', messageId: 42 });
    assert.equal(parseLanguageUpdate(callback('language:de')), null);
    const foreign = callback('language:ru');
    foreign.callback_query.from.id = 9999;
    assert.equal(parseLanguageUpdate(foreign), null);
    foreign.callback_query.from.id = 1234;
    const group = command('/language');
    group.message.chat = { id: -1234, type: 'group' };
    assert.equal(parseLanguageUpdate(group), null);
    for (const value of [null, [], 'bad', { update_id: '10' }]) assert.equal(parseLanguageUpdate(value), null);
});
test('test notification command is restricted to the developer private chat', () => {
    const update = command('/test_notification');
    assert.equal(parseLanguageUpdate(update), null);
    update.message.from = { id: 129516266, is_bot: false };
    update.message.chat = { id: 129516266, type: 'private' };
    assert.deepEqual(parseLanguageUpdate(update), { kind: 'test', updateId: 10, telegramId: '129516266' });
    update.message.chat.id = 1234;
    assert.equal(parseLanguageUpdate(update), null);
});
