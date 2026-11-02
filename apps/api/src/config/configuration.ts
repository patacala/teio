function normalizePublicApiUrl(url: string): string {
  return url.replace(/\/+$/, '').replace(/\/api$/, '');
}

export default () => ({
  api: {
    port: parseInt(process.env.API_PORT ?? '3001', 10),
    prefix: process.env.API_PREFIX ?? 'api',
  },
  jwt: {
    secret: process.env.JWT_SECRET ?? 'change-me',
    expiration: process.env.JWT_EXPIRATION ?? '7d',
  },
  supabase: {
    url: process.env.SUPABASE_URL ?? '',
    anonKey: process.env.SUPABASE_ANON_KEY ?? '',
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? '',
    jwtSecret: process.env.SUPABASE_JWT_SECRET ?? '',
  },
  database: {
    url: process.env.DATABASE_URL ?? '',
    host: process.env.DATABASE_HOST ?? 'localhost',
    port: parseInt(process.env.DATABASE_PORT ?? '5432', 10),
    name: process.env.DATABASE_NAME ?? 'crm_dev',
    user: process.env.DATABASE_USER ?? 'postgres',
    password: process.env.DATABASE_PASSWORD ?? 'postgres',
    poolUrl: process.env.DATABASE_POOL_URL ?? '',
  },
  redis: {
    host: process.env.REDIS_HOST ?? 'localhost',
    port: parseInt(process.env.REDIS_PORT ?? '6379', 10),
    password: process.env.REDIS_PASSWORD ?? '',
    db: parseInt(process.env.REDIS_DB ?? '0', 10),
    url: process.env.REDIS_URL ?? 'redis://localhost:6379',
  },
  rabbitmq: {
    url: process.env.RABBITMQ_URL ?? 'amqp://guest:guest@localhost:5672',
    user: process.env.RABBITMQ_USER ?? 'guest',
    password: process.env.RABBITMQ_PASSWORD ?? 'guest',
    host: process.env.RABBITMQ_HOST ?? 'localhost',
    port: parseInt(process.env.RABBITMQ_PORT ?? '5672', 10),
    vhost: process.env.RABBITMQ_VHOST ?? '/',
  },
  ai: {
    openaiKey: process.env.OPENAI_API_KEY ?? '',
    anthropicKey: process.env.ANTHROPIC_API_KEY ?? '',
    googleKey: process.env.GOOGLE_AI_API_KEY ?? '',
  },
  webhooks: {
    secret: process.env.WEBHOOK_SECRET ?? '',
    baseUrl: normalizePublicApiUrl(process.env.BASE_URL ?? 'http://localhost:3001'),
  },
  demo: {
    orgId:         process.env.DEMO_ORG_ID ?? '',
    webhookUrl:    process.env.N8N_DEMO_WEBHOOK_URL ?? '',
    webhookSecret: process.env.DEMO_WEBHOOK_SECRET ?? '',
    landingUrl:    process.env.NEXT_PUBLIC_LANDING_URL ?? '',
  },
  prosales: {
    // ProSales (pro-cognitive-ai) — the conversational pipeline. baseUrl is
    // where /crm/inbound and /api/v1/provisioning/* live; provisioningSecret
    // is server-side only, used once per org by the "create agent" flow
    // (see ai-agents/prosales-client.service.ts#provisionAgent) — never
    // exposed to the frontend.
    baseUrl:            process.env.PROSALES_BASE_URL ?? '',
    provisioningSecret: process.env.PROSALES_PROVISIONING_SECRET ?? '',
    // Shared secret ProSales presents (x-internal-token) when it asks the CRM to
    // resolve which org owns an inbound call's dialed number. Same value as
    // ProSales' INTERNAL_API_TOKEN.
    internalToken:      process.env.PROSALES_INTERNAL_TOKEN ?? '',
  },
  mail: {
    provider:        process.env.MAIL_PROVIDER ?? 'ses',
    from:            process.env.MAIL_FROM ?? '',
    resendApiKey:    process.env.RESEND_API_KEY ?? '',
    sendgridApiKey:  process.env.SENDGRID_API_KEY ?? '',
    demoTemplateId:  process.env.MAIL_DEMO_TEMPLATE_ID ?? '',
  },
  sms: {
    provider:             process.env.SMS_PROVIDER ?? 'telnyx',
    telnyxApiKey:         process.env.TELNYX_API_KEY ?? '',
    from:                 process.env.TELNYX_FROM_NUMBER ?? '',
    messagingProfileId:   process.env.TELNYX_MESSAGING_PROFILE_ID ?? '',
  },
  waha: {
    baseUrl: (process.env.WAHA_BASE_URL ?? 'http://localhost:3000').replace(/\/+$/, ''),
    apiKey:  process.env.WAHA_API_KEY ?? '',
    // Where WAHA delivers webhooks back to us. Separate from BASE_URL because
    // that one is also handed to external services (n8n demo callback) and must
    // stay publicly reachable — this one can be a container-internal address
    // when WAHA runs on the same host. Falls back to BASE_URL when unset.
    webhookBaseUrl: (process.env.WAHA_WEBHOOK_BASE_URL ?? '').replace(/\/+$/, ''),
  },
  aws: {
    accessKeyId:     process.env.AWS_ACCESS_KEY_ID ?? '',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY ?? '',
    sesRegion:       process.env.AWS_SES_REGION ?? 'us-east-1',
  },
});
