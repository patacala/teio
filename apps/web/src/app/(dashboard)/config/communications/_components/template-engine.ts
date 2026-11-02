export interface TemplateVars {
  organization_name: string;
  logo_url: string;
  primary_color: string;
  accent_color: string;
  from_name: string;
  support_email: string;
  website_url: string;
  contact_name: string;
  title: string;
  date: string;
  time: string;
  end_time: string;
  timezone: string;
  location: string;
  meeting_url: string;
}

export function renderTemplate(template: string, vars: TemplateVars): string {
  let html = template;

  // Handle {{#if var}}...{{else}}...{{/if}} and {{#if var}}...{{/if}}
  html = html.replace(
    /\{\{#if (\w+)\}\}([\s\S]*?)\{\{else\}\}([\s\S]*?)\{\{\/if\}\}/g,
    (_, key, ifBlock, elseBlock) => {
      const val = vars[key as keyof TemplateVars];
      return val ? ifBlock : elseBlock;
    },
  );
  html = html.replace(
    /\{\{#if (\w+)\}\}([\s\S]*?)\{\{\/if\}\}/g,
    (_, key, block) => {
      const val = vars[key as keyof TemplateVars];
      return val ? block : '';
    },
  );

  // Simple variable replacement
  for (const [key, value] of Object.entries(vars)) {
    html = html.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value ?? '');
  }

  return html;
}

export const APPOINTMENT_REMINDER_TEMPLATE = `<!DOCTYPE html>
<html lang="es" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <meta name="x-apple-disable-message-reformatting">
  <meta name="color-scheme" content="light">
  <meta name="supported-color-schemes" content="light">
  <title>Recordatorio: {{title}}</title>
  <!--[if mso]>
  <noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript>
  <![endif]-->
  <style>
    html,body{margin:0!important;padding:0!important;height:100%!important;width:100%!important;}
    *{-ms-text-size-adjust:100%;-webkit-text-size-adjust:100%;}
    table,td{mso-table-lspace:0pt!important;mso-table-rspace:0pt!important;border-collapse:collapse!important;}
    img{-ms-interpolation-mode:bicubic;border:0;height:auto;line-height:100%;outline:none;text-decoration:none;}
    a{text-decoration:none;}
    .es-btn a{color:#ffffff!important;}
    @media only screen and (max-width:620px){
      .es-wrap{width:100%!important;}
      .es-px{padding-left:24px!important;padding-right:24px!important;}
      .es-date{font-size:38px!important;line-height:1.08!important;}
      .es-time{font-size:20px!important;}
    }
  </style>
</head>
<body style="margin:0;padding:0;background-color:#FFFFFF;">
  <div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;line-height:1px;color:#FFFFFF;opacity:0;">
    Recordatorio: tu cita \u00AB{{title}}\u00BB es el {{date}} a las {{time}}. Te esperamos.
  </div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#FFFFFF;">
    <tr>
      <td align="center" style="padding:40px 0 60px 0;">
        <table role="presentation" class="es-wrap" width="600" cellpadding="0" cellspacing="0" style="width:600px;max-width:600px;background-color:#FFFFFF;">
          <!-- Header -->
          <tr>
            <td class="es-px" align="left" style="padding:0 48px 0 48px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
              {{#if logo_url}}<img src="{{logo_url}}" alt="{{organization_name}}" height="26" style="display:block;height:26px;max-height:26px;width:auto;border:0;">{{else}}<span style="font-size:17px;font-weight:700;color:#101828;letter-spacing:-0.02em;">{{organization_name}}</span>{{/if}}
            </td>
          </tr>
          <!-- Intro -->
          <tr>
            <td class="es-px" align="left" style="padding:46px 48px 0 48px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
              <p style="margin:0 0 16px 0;font-family:ui-monospace,'SF Mono',Menlo,Consolas,'Liberation Mono',monospace;font-size:12px;font-weight:700;letter-spacing:0.13em;text-transform:uppercase;color:{{accent_color}};">Recordatorio</p>
              <p style="margin:0 0 6px 0;font-size:16px;line-height:1.6;color:#475467;">Hola {{contact_name}},</p>
              <p style="margin:0;font-size:16px;line-height:1.6;color:#475467;">Te esperamos pronto para <strong style="color:#101828;font-weight:600;">{{title}}</strong>.</p>
            </td>
          </tr>
          <!-- Date hero -->
          <tr>
            <td class="es-px" align="left" style="padding:34px 48px 0 48px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
              <p style="margin:0 0 10px 0;font-family:ui-monospace,'SF Mono',Menlo,Consolas,'Liberation Mono',monospace;font-size:12px;font-weight:700;letter-spacing:0.13em;text-transform:uppercase;color:#98A2B3;">Cu\u00E1ndo</p>
              <p class="es-date" style="margin:0;font-size:44px;line-height:1.05;font-weight:600;color:#101828;letter-spacing:-0.04em;">{{date}}</p>
              <p class="es-time" style="margin:12px 0 0 0;font-size:22px;line-height:1.3;font-weight:600;color:{{primary_color}};letter-spacing:-0.01em;">{{time}}{{#if end_time}} \u2013 {{end_time}}{{/if}}{{#if timezone}} <span style="font-size:15px;font-weight:500;color:#98A2B3;">{{timezone}}</span>{{/if}}</p>
            </td>
          </tr>
          <!-- Location -->
          {{#if location}}<tr>
            <td class="es-px" align="left" style="padding:30px 48px 0 48px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
              <div style="height:1px;background-color:#ECEEF1;line-height:1px;font-size:1px;">&nbsp;</div>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
                <td align="left" valign="top" style="padding:15px 0 0 0;font-size:14px;line-height:1.4;color:#667085;width:90px;">Lugar</td>
                <td align="right" valign="top" style="padding:15px 0 0 0;font-size:15px;line-height:1.45;font-weight:600;color:#101828;">{{location}}</td>
              </tr></table>
            </td>
          </tr>{{/if}}
          <!-- CTA -->
          {{#if meeting_url}}<tr>
            <td class="es-px" align="left" style="padding:34px 48px 0 48px;">
              <table role="presentation" cellpadding="0" cellspacing="0" class="es-btn"><tr>
                <td align="left" bgcolor="{{primary_color}}" style="border-radius:10px;background-color:{{primary_color}};">
                  <a href="{{meeting_url}}" target="_blank" style="display:inline-block;padding:14px 28px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:15px;font-weight:600;line-height:20px;color:#ffffff;text-decoration:none;border-radius:10px;">Unirse a la reuni\u00F3n</a>
                </td>
              </tr></table>
            </td>
          </tr>{{/if}}
          {{#if support_email}}<tr>
            <td class="es-px" align="left" style="padding:20px 48px 0 48px;">
              <p style="margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:14px;line-height:1.55;color:#667085;">\u00BFNecesitas reprogramar? Escr\u00EDbenos a <a href="mailto:{{support_email}}" style="color:{{primary_color}};text-decoration:none;font-weight:600;">{{support_email}}</a>.</p>
            </td>
          </tr>{{/if}}
          <!-- Footer -->
          <tr><td class="es-px" style="padding:48px 48px 0 48px;"><div style="height:1px;background-color:#ECEEF1;line-height:1px;font-size:1px;">&nbsp;</div></td></tr>
          <tr>
            <td class="es-px" align="left" style="padding:22px 48px 0 48px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
              <p style="margin:0 0 3px 0;font-size:14px;font-weight:700;color:#101828;letter-spacing:-0.01em;">{{organization_name}}</p>
              <p style="margin:0 0 10px 0;font-size:13px;line-height:1.55;color:#98A2B3;">Enviado por {{from_name}}.</p>
              <p style="margin:0;font-size:13px;line-height:1.55;color:#98A2B3;">
                {{#if support_email}}<a href="mailto:{{support_email}}" style="color:#667085;text-decoration:none;">{{support_email}}</a>{{/if}}{{#if website_url}}{{#if support_email}} &nbsp;\u00B7&nbsp; {{/if}}<a href="{{website_url}}" target="_blank" style="color:#667085;text-decoration:none;">{{website_url}}</a>{{/if}}
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
