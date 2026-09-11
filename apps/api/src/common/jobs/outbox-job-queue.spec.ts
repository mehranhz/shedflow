import { Outbox } from '../../domain-events/outbox';
import { OutboxJobQueue } from './outbox-job-queue';

describe('OutboxJobQueue', () => {
  it('writes through the outbox and never talks to pg-boss', async () => {
    const outbox = {
      emit: jest.fn().mockResolvedValue({ id: 'evt-1' }),
    };
    const queue = new OutboxJobQueue(outbox as unknown as Outbox);

    await queue.enqueue(
      'organization.created',
      { organizationId: 'org-1' },
      'org-1',
    );

    expect(outbox.emit).toHaveBeenCalledWith(
      'organization.created',
      { organizationId: 'org-1' },
      'org-1',
    );
  });
});
