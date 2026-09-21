import { assertSafeWebhookUrl, isPrivateIp } from '@shedflow/shared/ssrf';
import { signWebhookPayload, verifyWebhookSignature, webhookRetryDelayMs } from '@shedflow/shared/webhooks';


describe('shared ssrf + webhooks', () => {
  it('rejects non-HTTPS and private webhook URLs', () => {
    expect(() => assertSafeWebhookUrl('http://127.0.0.1:1/')).toThrow();
    expect(() => assertSafeWebhookUrl('https://127.0.0.1/hook')).toThrow(
      /private/i,
    );
    expect(assertSafeWebhookUrl('https://example.com/hooks').hostname).toBe(
      'example.com',
    );
    expect(isPrivateIp('10.0.0.1')).toBe(true);
  });

  it('signs webhooks and exposes retry delays', () => {
    const signature = signWebhookPayload('whsec_x', 100, '{}');
    expect(
      verifyWebhookSignature({
        secret: 'whsec_x',
        timestamp: 100,
        rawBody: '{}',
        signatureHeader: signature,
        nowSeconds: 100,
      }),
    ).toBe(true);
    expect(webhookRetryDelayMs(1)).toBe(60_000);
    expect(webhookRetryDelayMs(7)).toBeNull();
  });
});
