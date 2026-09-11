export type ActorType = 'user' | 'api_key' | 'internal';

export type RequestContextValue = {
  requestId: string;
  userId: string;
  organizationId: string;
  role: 'OWNER' | 'ADMIN' | 'MEMBER';
  actorType: ActorType;
};
