// server/src/services/emailTemplates/mfaChallenge.js
// Email transacional de verificação MFA. Espelha passwordReset.js (mesma
// palette, mesma estrutura), com diff principal: o CTA bulletproof do
// reset vira um bloco mono com o código de 6 dígitos (sem <a>, texto
// puro selecionável).

const ESC_MAP = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

function escapeHtml(input) {
  return String(input ?? "").replace(/[&<>"']/g, (c) => ESC_MAP[c]);
}

function firstWord(name) {
  if (!name) return "";
  const trimmed = String(name).trim();
  if (!trimmed) return "";
  return trimmed.split(/\s+/)[0];
}

function capitalizeFirst(s) {
  if (!s) return "";
  const t = String(s);
  return t.charAt(0).toUpperCase() + t.slice(1).toLowerCase();
}

// Formato "XXX XXX" — espaço entre grupos de 3 reduz erro de cópia.
function formatCode(code) {
  const s = String(code ?? "").replace(/\D/g, "");
  if (s.length !== 6) return s;
  return `${s.slice(0, 3)} ${s.slice(3)}`;
}

/**
 * @param {object} args
 * @param {string} args.to                 — email destinatário
 * @param {string} args.code               — código raw "482917" (formatação interna)
 * @param {number} args.ttlMinutes         — TTL pro log block
 * @param {string} [args.firstName]        — primeiro nome (opcional)
 * @param {string} [args.baseUrl]          — URL do produto (footer)
 * @param {string} [args.challengePreview] — primeiros chars do challengeId pro req: log
 * @returns {{ subject, html, text, preheader }}
 */
export function renderMfaChallengeEmail({
  to,
  code,
  ttlMinutes,
  firstName,
  baseUrl,
  challengePreview,
}) {
  const ttl = Number.isFinite(ttlMinutes) ? Math.max(0, Math.floor(ttlMinutes)) : 0;
  const name = firstWord(firstName);
  const nameDisplay = capitalizeFirst(name);
  const greeting = name ? `oi, ${name.toLowerCase()}` : "oi";
  const codeFormatted = formatCode(code);
  const preheader = `Código válido por ${ttl} minutos. Se não foi você, pode ignorar com segurança.`;
  const subject = "código de acesso · manager-prompts";

  const html = buildHtml({
    nameDisplay: escapeHtml(nameDisplay),
    to: escapeHtml(to),
    codeFormatted: escapeHtml(codeFormatted),
    ttlMinutes: ttl,
    preheader: escapeHtml(preheader),
    baseUrl: baseUrl || "",
    baseUrlHrefEscaped: escapeHtml(baseUrl || ""),
    baseUrlDisplay: escapeHtml(baseUrl || ""),
    challengePreview: challengePreview ? escapeHtml(challengePreview) : null,
  });

  const text = buildText({ greeting, codeFormatted, ttlMinutes: ttl, baseUrl, challengePreview });

  return { subject, html, text, preheader };
}

// ---------------------------------------------------------------------------

function buildHtml({
  nameDisplay,
  to,
  codeFormatted,
  ttlMinutes,
  preheader,
  baseUrl,
  baseUrlHrefEscaped,
  baseUrlDisplay,
  challengePreview,
}) {
  // Palette idêntica a passwordReset.js
  const BG = "#0a0a07";
  const CARD = "#141410";
  const SUNKEN_BG = "#0d0d09";
  const RULE = "#2a2820";
  const RULE_SOFT = "#1f1d17";
  const INK_1 = "#f5efde";
  const INK_2 = "#cdc7b3";
  const INK_3 = "#8e8876";
  const INK_4 = "#5c5746";
  const INK_DIM = "#a8a290";
  const ACCENT = "#e6b066";
  const ACCENT_SHADOW = "#b8843d";
  const ACCENT_ON = "#1a1605";

  const MONO = `'Red Hat Mono', ui-monospace, 'SF Mono', Menlo, Consolas, monospace`;
  const SANS = `'Hanken Grotesk', system-ui, -apple-system, 'Segoe UI', sans-serif`;

  const preheaderStyle =
    "display:none;overflow:hidden;line-height:1px;opacity:0;max-height:0;max-width:0;mso-hide:all;";

  const greetingLine = nameDisplay
    ? `Oi, <strong style="color:${INK_1};font-weight:600;">${nameDisplay}</strong> &mdash; alguém pediu acesso à conta vinculada a <strong style="color:${INK_1};font-weight:600;word-break:break-word;">${to}</strong>. Use o código abaixo na tela de login pra confirmar.`
    : `Alguém pediu acesso à conta vinculada a <strong style="color:${INK_1};font-weight:600;word-break:break-word;">${to}</strong>. Use o código abaixo na tela de login pra confirmar.`;

  const challengeLine = challengePreview
    ? `<tr>
                        <td style="padding:8px 0 0 0;font-family:${MONO};font-size:12px;line-height:1.5;color:${INK_4};border-top:1px solid ${RULE_SOFT};white-space:nowrap;">
                          <span style="color:${INK_4};">req</span>
                        </td>
                        <td style="padding:8px 0 0 0;font-family:${MONO};font-size:12px;line-height:1.5;color:${INK_3};border-top:1px solid ${RULE_SOFT};">
                          ${challengePreview}<span style="color:${INK_4};">…</span>
                        </td>
                      </tr>`
    : "";

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="x-apple-disable-message-reformatting" />
  <meta name="color-scheme" content="light dark" />
  <meta name="supported-color-schemes" content="light dark" />
  <title>código de acesso · manager-prompts</title>
  <!--[if !mso]><!-->
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Hanken+Grotesk:wght@400;500;600;700&family=Red+Hat+Mono:wght@400;500;600;700&display=swap" rel="stylesheet" />
  <!--<![endif]-->
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Hanken+Grotesk:wght@400;500;600;700&family=Red+Hat+Mono:wght@400;500;600;700&display=swap');
    body,table,td,a { -webkit-text-size-adjust:100%; -ms-text-size-adjust:100%; }
    table,td { mso-table-lspace:0pt; mso-table-rspace:0pt; }
    img { -ms-interpolation-mode:bicubic; border:0; outline:none; text-decoration:none; display:block; }
    body { margin:0 !important; padding:0 !important; width:100% !important; background:${BG}; }
    a { text-decoration:none; }

    @media (max-width:600px) {
      .wrap { width:100% !important; max-width:100% !important; }
      .pad-x { padding-left:22px !important; padding-right:22px !important; }
      .h1-mobile { font-size:24px !important; line-height:1.2 !important; }
      .code-mobile { font-size:30px !important; padding-left:24px !important; padding-right:24px !important; }
      .meta-key { width:64px !important; }
    }
  </style>
</head>
<body style="margin:0;padding:0;background:${BG};color:${INK_1};">
  <div style="${preheaderStyle}">${preheader}</div>

  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${BG}" style="background:${BG};">
    <tr>
      <td align="center" style="padding:40px 16px;">

        <table role="presentation" class="wrap" width="560" cellpadding="0" cellspacing="0" border="0" bgcolor="${CARD}" style="width:560px;max-width:560px;background:${CARD};border:1px solid ${RULE};border-radius:8px;">

          <!-- Header — wordmark -->
          <tr>
            <td class="pad-x" style="padding:22px 36px;border-bottom:1px solid ${RULE};font-family:${MONO};font-size:14px;font-weight:700;color:${INK_1};line-height:1;">
              <span style="display:inline-block;width:3px;height:14px;background:${ACCENT};vertical-align:-2px;margin-right:10px;"></span>manager<span style="color:${ACCENT};">-</span>prompts
            </td>
          </tr>

          <!-- Hero -->
          <tr>
            <td class="pad-x" style="padding:44px 36px 24px 36px;">
              <p style="margin:0 0 16px 0;font-family:${MONO};font-size:12px;font-weight:600;color:${INK_3};line-height:1;letter-spacing:0.04em;">
                <span style="color:${ACCENT};">$</span> auth.mfa
              </p>
              <h1 class="h1-mobile" style="margin:0 0 18px 0;font-family:${MONO};font-size:28px;line-height:1.18;font-weight:700;color:${INK_1};letter-spacing:-0.015em;">
                verificação em dois passos
              </h1>
              <p style="margin:0;font-family:${SANS};font-size:15px;line-height:1.6;color:${INK_2};">
                ${greetingLine}
              </p>
            </td>
          </tr>

          <!-- Bloco do código (substitui o CTA bulletproof) -->
          <tr>
            <td class="pad-x" align="center" style="padding:8px 36px 32px 36px;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="border-collapse:separate;margin:0 auto;">
                <tr>
                  <td class="code-mobile" align="center" bgcolor="${ACCENT}" style="background:${ACCENT};border-radius:3px;border-bottom:2px solid ${ACCENT_SHADOW};padding:18px 56px;font-family:${MONO};font-size:36px;font-weight:700;line-height:1;letter-spacing:0.15em;color:${ACCENT_ON};text-align:center;">
                    ${codeFormatted}
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Sunken meta box — log key/value -->
          <tr>
            <td class="pad-x" style="padding:0 36px 28px 36px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${SUNKEN_BG}" style="background:${SUNKEN_BG};border:1px solid ${RULE};border-radius:6px;">
                <tr>
                  <td style="padding:18px 22px;">
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td class="meta-key" style="width:80px;padding:0 0 6px 0;font-family:${MONO};font-size:13px;line-height:1.5;color:${ACCENT};vertical-align:top;white-space:nowrap;">
                          ttl
                        </td>
                        <td style="padding:0 0 6px 0;font-family:${MONO};font-size:13px;line-height:1.5;color:${INK_1};vertical-align:top;">
                          ${ttlMinutes} minutos
                        </td>
                      </tr>
                      <tr>
                        <td class="meta-key" style="width:80px;padding:6px 0;font-family:${MONO};font-size:13px;line-height:1.5;color:${ACCENT};vertical-align:top;white-space:nowrap;border-top:1px solid ${RULE_SOFT};">
                          uses
                        </td>
                        <td style="padding:6px 0;font-family:${MONO};font-size:13px;line-height:1.5;color:${INK_1};vertical-align:top;border-top:1px solid ${RULE_SOFT};">
                          single-use
                        </td>
                      </tr>
                      <tr>
                        <td class="meta-key" style="width:80px;padding:6px 0 ${challengePreview ? "6px" : "0"} 0;font-family:${MONO};font-size:13px;line-height:1.5;color:${ACCENT};vertical-align:top;white-space:nowrap;border-top:1px solid ${RULE_SOFT};">
                          scope
                        </td>
                        <td style="padding:6px 0 ${challengePreview ? "6px" : "0"} 0;font-family:${MONO};font-size:13px;line-height:1.5;color:${INK_1};vertical-align:top;border-top:1px solid ${RULE_SOFT};">
                          login
                        </td>
                      </tr>
                      ${challengeLine}
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Divisor -->
          <tr>
            <td style="padding:0 36px;">
              <div style="border-top:1px solid ${RULE};line-height:0;font-size:0;">&nbsp;</div>
            </td>
          </tr>

          <!-- Nota de segurança -->
          <tr>
            <td class="pad-x" style="padding:18px 36px 28px 36px;">
              <p style="margin:0;font-family:${SANS};font-size:13px;line-height:1.6;color:${INK_3};">
                <strong style="color:${INK_2};font-weight:600;">Não foi você?</strong> Pode ignorar este e-mail com segurança &mdash; sem o código ninguém entra na conta.
              </p>
            </td>
          </tr>

        </table>

        <!-- Footer -->
        <table role="presentation" class="wrap" width="560" cellpadding="0" cellspacing="0" border="0" style="width:560px;max-width:560px;">
          <tr>
            <td class="pad-x" align="center" style="padding:24px 36px 6px 36px;font-family:${MONO};font-size:11px;font-weight:600;color:${INK_3};line-height:1.7;letter-spacing:0.02em;">
              ${baseUrl ? `<a href="${baseUrlHrefEscaped}" style="color:${INK_DIM};text-decoration:none;">${baseUrlDisplay}</a>` : `manager-prompts.site`}
            </td>
          </tr>
          <tr>
            <td class="pad-x" align="center" style="padding:0 36px 12px 36px;font-family:${SANS};font-size:11px;color:${INK_4};line-height:1.6;">
              Você recebeu este e-mail porque alguém tentou entrar nesta conta.
            </td>
          </tr>
        </table>

      </td>
    </tr>
  </table>
</body>
</html>`;
}

function buildText({ greeting, codeFormatted, ttlMinutes, baseUrl, challengePreview }) {
  const lines = [
    `${greeting}.`,
    "",
    "alguém pediu acesso à sua conta no manager-prompts.",
    "use o código abaixo na tela de login:",
    "",
    `    ${codeFormatted}`,
    "",
    `ttl     ${ttlMinutes} minutos`,
    "uses    single-use",
    "scope   login",
  ];

  if (challengePreview) {
    lines.push(`req     ${challengePreview}…`);
  }

  lines.push(
    "",
    "se não foi você, ignore este email — sem o código ninguém entra.",
    "",
    "--",
    `manager-prompts${baseUrl ? `  ·  ${baseUrl}` : ""}`,
  );

  return lines.join("\n");
}
