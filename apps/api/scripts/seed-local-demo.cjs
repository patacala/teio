/**
 * Fills one local organization with demo CRM data (companies, contacts,
 * conversations, messages, appointments). Replaces only rows tagged
 * metadata.seed = 'local-demo'. Other tenant data is left alone.
 *
 *   node apps/api/scripts/seed-local-demo.cjs
 *   node apps/api/scripts/seed-local-demo.cjs <organization_id>
 */
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const SEED = 'local-demo';

function bogotaDate(dayOffset, minutesFromMidnight) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Bogota',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    })
      .formatToParts(new Date())
      .map((part) => [part.type, part.value]),
  );
  return new Date(Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day) + dayOffset,
    Math.floor(minutesFromMidnight / 60) + 5,
    minutesFromMidnight % 60,
  ));
}

function loadDatabaseUrl() {
  const envPath = path.join(__dirname, '..', '.env');
  const line = fs
    .readFileSync(envPath, 'utf8')
    .split('\n')
    .find((l) => l.startsWith('DATABASE_URL='));
  if (!line) throw new Error(`DATABASE_URL not found in ${envPath}`);
  return line.slice('DATABASE_URL='.length).trim();
}

const COMPANIES = [
  { key: 'clinica', name: 'Clínica del Norte', domain: 'clinicadelnorte.co', industry: 'Salud', size: '51-200', website: 'https://clinicadelnorte.co', phone: '+573001110001' },
  { key: 'andes', name: 'Andes Logística', domain: 'andeslogistica.co', industry: 'Logística', size: '11-50', website: 'https://andeslogistica.co', phone: '+573001110002' },
  { key: 'lumina', name: 'Café Lumina', domain: 'cafelumina.co', industry: 'Alimentos', size: '1-10', website: 'https://cafelumina.co', phone: '+573001110003' },
  { key: 'taller', name: 'Taller Sol', domain: 'tallersol.co', industry: 'Automotriz', size: '11-50', website: 'https://tallersol.co', phone: '+573001110004' },
  { key: 'estudio', name: 'Estudio Mar', domain: 'estudiomar.co', industry: 'Arquitectura', size: '1-10', website: 'https://estudiomar.co', phone: '+573001110005' },
  { key: 'pixel', name: 'Pixel Andino', domain: 'pixelandino.co', industry: 'Software', size: '11-50', website: 'https://pixelandino.co', phone: '+573001110006' },
  { key: 'horizonte', name: 'Horizonte Seguros', domain: 'horizonteseguros.co', industry: 'Seguros', size: '51-200', website: 'https://horizonteseguros.co', phone: '+573001110007' },
];

const CONTACTS = [
  { key: 'laura', company: 'clinica', first: 'Laura', last: 'Méndez', email: 'laura.mendez@clinicadelnorte.co', phone: '+573101000001', stage: 'qualified', score: 72, handled: 'human', tags: ['demo', 'salud'], fields: { city: 'Bogotá', servicio: 'Agenda de pacientes', presupuesto: '8-12M COP' } },
  { key: 'andres', company: 'clinica', first: 'Andrés', last: 'Rojas', email: 'andres.rojas@clinicadelnorte.co', phone: '+573101000002', stage: 'contacted', score: 41, handled: 'ai', tags: ['demo', 'salud'], fields: { city: 'Bogotá', servicio: 'Recordatorios' } },
  { key: 'camila', company: 'andes', first: 'Camila', last: 'Herrera', email: 'camila.herrera@andeslogistica.co', phone: '+573101000003', stage: 'appointment_scheduled', score: 80, handled: 'human', tags: ['demo', 'prioridad'], fields: { city: 'Medellín', servicio: 'Seguimiento de envíos', presupuesto: '15M COP' } },
  { key: 'diego', company: 'andes', first: 'Diego', last: 'Pardo', email: 'diego.pardo@andeslogistica.co', phone: '+573101000004', stage: 'new', score: 18, handled: 'ai', tags: ['demo'], fields: { city: 'Medellín' } },
  { key: 'valentina', company: 'lumina', first: 'Valentina', last: 'Cruz', email: 'valentina@cafelumina.co', phone: '+573101000005', stage: 'appointment_confirmed', score: 88, handled: 'human', tags: ['demo', 'prioridad'], fields: { city: 'Cali', servicio: 'Pedidos por WhatsApp', presupuesto: '4M COP' } },
  { key: 'mateo', company: 'lumina', first: 'Mateo', last: 'Gil', email: 'mateo.gil@cafelumina.co', phone: '+573101000006', stage: 'new', score: 12, handled: 'ai', tags: ['demo'], fields: { city: 'Cali' } },
  { key: 'sofia', company: 'taller', first: 'Sofía', last: 'Navarro', email: 'sofia.navarro@tallersol.co', phone: '+573101000007', stage: 'won', score: 96, handled: 'human', tags: ['demo', 'cliente'], fields: { city: 'Barranquilla', servicio: 'Citas de taller', presupuesto: '6M COP' } },
  { key: 'julian', company: 'taller', first: 'Julián', last: 'Ortega', email: 'julian.ortega@tallersol.co', phone: '+573101000008', stage: 'contacted', score: 35, handled: 'ai', tags: ['demo'], fields: { city: 'Barranquilla', servicio: 'Recordatorio de mantenimiento' } },
  { key: 'mariana', company: 'estudio', first: 'Mariana', last: 'López', email: 'mariana.lopez@estudiomar.co', phone: '+573101000009', stage: 'qualified', score: 67, handled: 'human', tags: ['demo'], fields: { city: 'Bogotá', servicio: 'Seguimiento de propuestas', presupuesto: '5M COP' } },
  { key: 'pedro', company: 'estudio', first: 'Pedro', last: 'Salas', email: 'pedro.salas@estudiomar.co', phone: '+573101000010', stage: 'lost', score: 22, handled: 'human', tags: ['demo'], fields: { city: 'Bogotá', servicio: 'CRM de obras' } },
  { key: 'elena', company: 'pixel', first: 'Elena', last: 'Vargas', email: 'elena.vargas@pixelandino.co', phone: '+573101000011', stage: 'appointment_scheduled', score: 74, handled: 'human', tags: ['demo', 'software'], fields: { city: 'Bogotá', servicio: 'Onboarding de clientes', presupuesto: '10M COP' } },
  { key: 'nicolas', company: 'pixel', first: 'Nicolás', last: 'Rey', email: 'nicolas.rey@pixelandino.co', phone: '+573101000012', stage: 'new', score: 15, handled: 'ai', tags: ['demo'], fields: { city: 'Bogotá' } },
  { key: 'lucia', company: null, first: 'Lucía', last: 'Fernández', email: 'lucia.fernandez@gmail.com', phone: '+573101000013', stage: 'contacted', score: 48, handled: 'ai', tags: ['demo', 'inbound'], fields: { city: 'Bucaramanga', servicio: 'WhatsApp para ventas' } },
  { key: 'santiago', company: null, first: 'Santiago', last: 'Mora', email: 'santiago.mora@outlook.com', phone: '+573101000014', stage: 'new', score: 9, handled: 'ai', tags: ['demo', 'web'], fields: { city: 'Pereira' } },
  { key: 'paula', company: 'horizonte', first: 'Paula', last: 'Ibáñez', email: 'paula.ibanez@horizonteseguros.co', phone: '+573101000015', stage: 'won', score: 91, handled: 'human', tags: ['demo', 'cliente'], fields: { city: 'Bogotá', servicio: 'Renovaciones', presupuesto: '20M COP' } },
  { key: 'ricardo', company: 'horizonte', first: 'Ricardo', last: 'Peña', email: 'ricardo.pena@horizonteseguros.co', phone: '+573101000016', stage: 'appointment_confirmed', score: 84, handled: 'human', tags: ['demo'], fields: { city: 'Medellín', servicio: 'Cotizaciones por chat', presupuesto: '12M COP' } },
];

const THREADS = {
  laura: {
    channel: 'whatsapp', status: 'open', subject: 'Agenda de pacientes', pinned: true,
    lines: [
      ['in', 'Hola, queremos dejar de confirmar citas a mano. ¿El CRM puede escribirles por WhatsApp?'],
      ['out', 'Sí. Armamos la agenda, el recordatorio y el mensaje de confirmación desde el mismo contacto.'],
      ['in', 'Perfecto. Somos dos sedes y unas 40 citas al día.'],
    ],
  },
  andres: {
    channel: 'whatsapp', status: 'pending', subject: 'Recordatorios de control',
    lines: [
      ['in', 'Vi el anuncio. ¿También sirve para recordar controles de los 6 meses?'],
      ['ai', 'Sí. Se puede disparar un recordatorio según la fecha del último control.'],
    ],
  },
  camila: {
    channel: 'whatsapp', status: 'open', subject: 'Demo de seguimiento de envíos', pinned: true,
    lines: [
      ['in', 'Necesitamos que el cliente sepa cuándo sale el camión sin llamar a operaciones.'],
      ['out', 'Te dejé un espacio mañana para ver el flujo con un envío de ejemplo.'],
      ['in', 'Listo, ahí estoy.'],
    ],
  },
  diego: {
    channel: 'email', status: 'open', subject: 'Consulta desde la web',
    lines: [['in', 'Hola, me pasaron su contacto. ¿Tienen algo para transportadoras pequeñas?']],
  },
  valentina: {
    channel: 'whatsapp', status: 'open', subject: 'Pedidos de café por WhatsApp',
    lines: [
      ['in', 'Mis clientes piden por WhatsApp y se me pierden entre los chats.'],
      ['out', 'La cita quedó confirmada. Vamos a armar el menú y el estado del pedido.'],
      ['in', 'Genial, llevo el menú de la semana.'],
    ],
  },
  mateo: {
    channel: 'webchat', status: 'open', subject: 'Chat del sitio',
    lines: [['in', '¿Cuánto cuesta para un café con un solo punto de venta?']],
  },
  sofia: {
    channel: 'whatsapp', status: 'resolved', subject: 'Citas de taller',
    lines: [
      ['in', 'Quiero que el cliente elija el hueco del cambio de aceite.'],
      ['out', 'Quedó activo el calendario de Taller Sol. Esta semana ya entraron 11 reservas.'],
      ['in', 'Excelente, lo dejamos así.'],
    ],
  },
  julian: {
    channel: 'sms', status: 'pending', subject: 'Mantenimiento',
    lines: [
      ['in', '¿Pueden avisar cuando al carro le toca la revisión de los 10.000 km?'],
      ['ai', 'Sí. Con la fecha del último servicio se programa el siguiente aviso.'],
    ],
  },
  mariana: {
    channel: 'email', status: 'open', subject: 'Seguimiento de propuestas',
    lines: [
      ['in', 'Mandamos propuestas y nadie hace el seguimiento. Se nos enfrían.'],
      ['out', 'Podemos mover el contacto a calificado cuando responde y agendar la llamada de cierre.'],
    ],
  },
  pedro: {
    channel: 'email', status: 'resolved', subject: 'CRM de obras',
    lines: [
      ['in', 'Lo vimos, pero este trimestre no tenemos presupuesto.'],
      ['out', 'Queda anotado. Te escribo el próximo trimestre.'],
    ],
  },
  elena: {
    channel: 'whatsapp', status: 'open', subject: 'Onboarding de clientes',
    lines: [
      ['in', 'Cada cliente nuevo nos pide el mismo onboarding por chat.'],
      ['out', 'En la demo te muestro la secuencia de tres mensajes y la cita de kickoff.'],
    ],
  },
  nicolas: {
    channel: 'webchat', status: 'open', subject: 'Pregunta rápida',
    lines: [['in', '¿Se integra con el WhatsApp que ya usamos?']],
  },
  lucia: {
    channel: 'whatsapp', status: 'open', subject: 'Ventas por WhatsApp',
    lines: [
      ['in', 'Vendo consultoría y todo me llega al WhatsApp personal.'],
      ['ai', 'Puedes pasar esos chats a un inbox con etapa y responsable.'],
      ['in', '¿Y puedo contestar yo cuando el bot no sepa?'],
    ],
  },
  santiago: {
    channel: 'webchat', status: 'snoozed', subject: 'Visitante del sitio',
    lines: [['in', 'Hola, solo estoy mirando. Vuelvo la otra semana.']],
  },
  paula: {
    channel: 'email', status: 'resolved', subject: 'Renovaciones',
    lines: [
      ['in', 'Necesitamos avisar la renovación 30 días antes, no el mismo día.'],
      ['out', 'La secuencia de renovación ya está corriendo para la cartera piloto.'],
      ['in', 'Recibimos el primer aviso. Funciona.'],
    ],
  },
  ricardo: {
    channel: 'whatsapp', status: 'open', subject: 'Cotizaciones por chat',
    lines: [
      ['in', 'Los asesores cotizan por WhatsApp y luego no queda registro.'],
      ['out', 'La cita de la sucursal Medellín quedó confirmada. Llevamos un caso real.'],
    ],
  },
};

const APPOINTMENTS = [
  { contact: 'camila', title: 'Demo · seguimiento de envíos', status: 'scheduled', day: 1, minutes: 10 * 60, location: 'Google Meet' },
  { contact: 'elena', title: 'Demo · onboarding de clientes', status: 'scheduled', day: 3, minutes: 15 * 60 + 30, location: 'Google Meet' },
  { contact: 'valentina', title: 'Demo confirmada · pedidos por WhatsApp', status: 'confirmed', day: 2, minutes: 11 * 60, location: 'Café Lumina, Cali' },
  { contact: 'ricardo', title: 'Demo confirmada · cotizaciones', status: 'confirmed', day: 5, minutes: 9 * 60 + 30, location: 'Google Meet' },
  { contact: 'sofia', title: 'Kickoff · citas de taller', status: 'completed', day: -6, minutes: 16 * 60, location: 'Taller Sol' },
  { contact: 'paula', title: 'Kickoff · renovaciones', status: 'completed', day: -2, minutes: 9 * 60, location: 'Google Meet' },
  { contact: 'pedro', title: 'Llamada de cierre', status: 'cancelled', day: -4, minutes: 14 * 60, location: 'Google Meet' },
];

async function main() {
  const orgArg = process.argv.slice(2).find((a) => !a.startsWith('--'));
  const client = new Client({ connectionString: loadDatabaseUrl() });
  await client.connect();

  try {
    await client.query('BEGIN');

    const org = orgArg
      ? (await client.query('SELECT id, name FROM core.organizations WHERE id = $1', [orgArg])).rows[0]
      : (await client.query('SELECT id, name FROM core.organizations ORDER BY created_at LIMIT 1')).rows[0];
    if (!org) throw new Error('No organization found');

    const user = (
      await client.query(
        'SELECT id FROM core.users WHERE organization_id = $1 ORDER BY created_at LIMIT 1',
        [org.id],
      )
    ).rows[0];
    if (!user) throw new Error(`No user in organization ${org.name}`);

    const stages = (
      await client.query(
        `SELECT id, stage_type FROM clients.funnel_stages WHERE organization_id = $1`,
        [org.id],
      )
    ).rows;
    const stageByType = Object.fromEntries(stages.map((s) => [s.stage_type, s.id]));
    for (const contact of CONTACTS) {
      if (!stageByType[contact.stage]) {
        throw new Error(`Missing funnel stage "${contact.stage}" in ${org.name}`);
      }
    }

    const calendar = (
      await client.query(
        `SELECT id FROM scheduling.work_schedules
         WHERE organization_id = $1 AND type = 'appointments'
         ORDER BY created_at LIMIT 1`,
        [org.id],
      )
    ).rows[0];

    const removed = await client.query(
      `DELETE FROM clients.contacts
       WHERE organization_id = $1 AND metadata->>'seed' = $2`,
      [org.id, SEED],
    );
    await client.query(
      `DELETE FROM clients.companies
       WHERE organization_id = $1 AND metadata->>'seed' = $2`,
      [org.id, SEED],
    );

    const companyIds = {};
    for (const company of COMPANIES) {
      const { rows } = await client.query(
        `INSERT INTO clients.companies
           (organization_id, name, domain, industry, size, website, phone, tags, metadata)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
         RETURNING id`,
        [
          org.id,
          company.name,
          company.domain,
          company.industry,
          company.size,
          company.website,
          company.phone,
          ['demo'],
          { seed: SEED },
        ],
      );
      companyIds[company.key] = rows[0].id;
    }

    const contactIds = {};
    for (const contact of CONTACTS) {
      const stageId = stageByType[contact.stage];
      const { rows } = await client.query(
        `INSERT INTO clients.contacts (
           organization_id, company_id, first_name, last_name, email, phone,
           status, channel_ids, custom_fields, tags, assigned_to, last_contacted_at,
           metadata, lead_stage, lead_score, handled_by
         ) VALUES (
           $1,$2,$3,$4,$5,$6,
           'active', $7,$8,$9,$10, NOW() - interval '2 hours',
           $11,$12,$13,$14
         ) RETURNING id`,
        [
          org.id,
          contact.company ? companyIds[contact.company] : null,
          contact.first,
          contact.last,
          contact.email,
          contact.phone,
          JSON.stringify({ whatsapp: contact.phone, email: contact.email }),
          JSON.stringify(contact.fields),
          contact.tags,
          contact.handled === 'human' ? user.id : null,
          { seed: SEED },
          stageId,
          contact.score,
          contact.handled,
        ],
      );
      contactIds[contact.key] = rows[0].id;
      await client.query(
        `INSERT INTO clients.contact_funnel_history
           (contact_id, to_stage_id, changed_by, source, reason)
         VALUES ($1,$2,$3,'manual','local demo seed')`,
        [rows[0].id, stageId, user.id],
      );
    }

    let conversations = 0;
    let messages = 0;
    const conversationIds = {};
    for (const [key, thread] of Object.entries(THREADS)) {
      const { rows } = await client.query(
        `INSERT INTO conversations.conversations (
           organization_id, contact_id, channel, status, assigned_agent_id,
           subject, last_message_at, tags, metadata, bot_active, is_pinned
         ) VALUES (
           $1,$2,$3,$4,$5,$6, NOW() - interval '30 minutes',
           $7,$8,$9,$10
         ) RETURNING id`,
        [
          org.id,
          contactIds[key],
          thread.channel,
          thread.status,
          CONTACTS.find((c) => c.key === key).handled === 'human' ? user.id : null,
          thread.subject,
          ['demo'],
          { seed: SEED },
          CONTACTS.find((c) => c.key === key).handled === 'ai',
          Boolean(thread.pinned),
        ],
      );
      // The CASE above compared channel ($3) to 'resolved'. Fix status via a follow-up if needed.
      conversationIds[key] = rows[0].id;
      conversations += 1;

      if (thread.status === 'resolved') {
        await client.query(
          `UPDATE conversations.conversations SET resolved_at = NOW() - interval '1 hour' WHERE id = $1`,
          [rows[0].id],
        );
      }

      for (let i = 0; i < thread.lines.length; i += 1) {
        const [who, text] = thread.lines[i];
        const inbound = who === 'in';
        const senderType = who === 'in' ? 'user' : who === 'ai' ? 'ai' : 'agent';
        const minutesAgo = (thread.lines.length - i) * 25;
        await client.query(
          `INSERT INTO conversations.messages (
             organization_id, conversation_id, content, type, direction, status,
             sender_id, metadata, sent_at, channel, sender_type
           ) VALUES (
             $1,$2,$3,'text',$4,'read',$5,$6,
             NOW() - ($7 || ' minutes')::interval,
             $8,$9
           )`,
          [
            org.id,
            rows[0].id,
            text,
            inbound ? 'inbound' : 'outbound',
            senderType === 'agent' ? user.id : null,
            { seed: SEED },
            String(minutesAgo),
            thread.channel,
            senderType,
          ],
        );
        messages += 1;
      }

      await client.query(
        `UPDATE conversations.conversations
         SET last_message_at = (
           SELECT MAX(sent_at) FROM conversations.messages WHERE conversation_id = $1
         )
         WHERE id = $1`,
        [rows[0].id],
      );
    }

    let appointments = 0;
    if (!calendar) {
      console.log('No appointments calendar found; skipped appointments.');
    } else {
      for (const appt of APPOINTMENTS) {
        const startsAt = bogotaDate(appt.day, appt.minutes);
        const endsAt = new Date(startsAt.getTime() + 45 * 60 * 1000);
        await client.query(
          `INSERT INTO scheduling.appointments (
             organization_id, calendar_id, contact_id, conversation_id, assigned_to,
             title, status, starts_at, ends_at, timezone, location, notes, metadata,
             origin, created_by, source, confirmed_at, confirmed_via, confirmed_by,
             completed_at, cancelled_at, cancel_reason
           ) VALUES (
             $1,$2,$3,$4,$5,
             $6,$7,$8,$9,
             'America/Bogota',$10,$11,$12,
             'human',$5,'manual',
             $13,$14,$15,$16,$17,$18
           )`,
          [
            org.id,
            calendar.id,
            contactIds[appt.contact],
            conversationIds[appt.contact] ?? null,
            user.id,
            appt.title,
            appt.status,
            startsAt,
            endsAt,
            appt.location,
            'Dato de prueba local',
            { seed: SEED },
            appt.status === 'confirmed' ? new Date(Date.now() - 24 * 60 * 60 * 1000) : null,
            appt.status === 'confirmed' ? 'staff' : null,
            appt.status === 'confirmed' ? user.id : null,
            appt.status === 'completed' ? endsAt : null,
            appt.status === 'cancelled' ? new Date(Date.now() - 3 * 24 * 60 * 60 * 1000) : null,
            appt.status === 'cancelled' ? 'contact' : null,
          ],
        );
        appointments += 1;
      }
    }

    await client.query('COMMIT');
    console.log(
      JSON.stringify(
        {
          organization: org.name,
          organization_id: org.id,
          replaced_contacts: removed.rowCount,
          companies: COMPANIES.length,
          contacts: CONTACTS.length,
          conversations,
          messages,
          appointments,
        },
        null,
        2,
      ),
    );
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
