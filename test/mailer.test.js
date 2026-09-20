import assert from 'node:assert/strict';
import test from 'node:test';
import { createMailer, resetEmail } from '../server/mailer.js';

const message = { to: 'ada@example.com', subject: 'Hi', text: 'plain', html: '<p>html</p>' };

test('brevo: posts the documented request shape and keeps the key in a header only', async () => {
  const calls = [];
  const fakeFetch = async (url, init) => {
    calls.push({ url, init });
    return new Response(JSON.stringify({ messageId: 'x' }), { status: 201 });
  };
  const mailer = createMailer({ BREVO_API_KEY: 'secret-key-123', EMAIL_FROM: 'me@example.com', EMAIL_FROM_NAME: 'DevLog Team' }, fakeFetch);
  assert.equal(mailer.enabled, true);
  assert.equal(mailer.kind, 'brevo');

  await mailer.send(message);
  const { url, init } = calls[0];
  assert.equal(url, 'https://api.brevo.com/v3/smtp/email');
  assert.equal(init.method, 'POST');
  assert.equal(init.headers['api-key'], 'secret-key-123');
  const body = JSON.parse(init.body);
  assert.deepEqual(body.sender, { email: 'me@example.com', name: 'DevLog Team' });
  assert.deepEqual(body.to, [{ email: 'ada@example.com' }]);
  assert.equal(body.subject, 'Hi');
  assert.equal(body.textContent, 'plain');
  assert.equal(body.htmlContent, '<p>html</p>');
  assert.ok(!init.body.includes('secret-key-123'), 'the key never goes in the body');
});

test('brevo: a rejected send throws, reporting the status but never the key', async () => {
  const fakeFetch = async () => new Response('{"message":"Sender not verified"}', { status: 400 });
  const mailer = createMailer({ BREVO_API_KEY: 'secret-key-123', EMAIL_FROM: 'me@example.com' }, fakeFetch);
  await assert.rejects(mailer.send(message), (err) => {
    assert.match(err.message, /400/);
    assert.match(err.message, /Sender not verified/);
    assert.ok(!err.message.includes('secret-key-123'));
    return true;
  });
});

test('without a provider: console in development, disabled in production', async () => {
  const dev = createMailer({});
  assert.equal(dev.enabled, true);
  assert.equal(dev.kind, 'console');

  for (const env of [{ NODE_ENV: 'production' }, { VERCEL: '1' }]) {
    const prod = createMailer(env);
    assert.equal(prod.enabled, false, JSON.stringify(env));
    await assert.rejects(prod.send(message), /not configured/);
  }
  // a key without a sender address is not a working setup
  assert.equal(createMailer({ NODE_ENV: 'production', BREVO_API_KEY: 'k' }).enabled, false);
});

test('reset email: link in both parts, html-escaped, expiry stated', () => {
  const { subject, text, html } = resetEmail({ link: 'https://app.example/#/reset?token=abc&x="1"', minutes: 30 });
  assert.match(subject, /Reset your DevLog password/);
  assert.ok(text.includes('https://app.example/#/reset?token=abc&x="1"'));
  assert.ok(html.includes('href="https://app.example/#/reset?token=abc&amp;x=&quot;1&quot;"'), 'escaped in the attribute');
  assert.match(text, /30 minutes/);
});
