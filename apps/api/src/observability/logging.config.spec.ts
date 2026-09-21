import { buildPinoParams } from './logging.config';

describe('buildPinoParams', () => {
  it('includes requestId in customProps', () => {
    const params = buildPinoParams('api');
    const pinoHttp = params.pinoHttp as {
      customProps: (req: { id?: string }) => Record<string, unknown>;
    };
    expect(pinoHttp.customProps({ id: 'req-abc' })).toEqual({
      service: 'api',
      requestId: 'req-abc',
    });
  });
});
