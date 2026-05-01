// Email transacional de reset de senha.
//
// Renderização de emails é território mais restrito que web: Outlook (Word
// engine) ignora muita coisa moderna, Gmail pode tirar <style>, webfonts
// são frágeis. Por isso este template usa:
//   - Tabelas para layout (bulletproof em Outlook)
//   - Cores em hex (sem oklch/color-mix/variáveis)
//   - Stack monospace nativa (sem webfonts)
//   - CSS crítico inline, media query apenas pra colapso mobile
//
// Identidade: dev-tool dark, acento âmbar disciplinado, vocabulário de log
// ("token", "single-use"). Mantido coerente com a UI de /reset.

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

/**
 * @param {object} args
 * @param {string} args.to           — email do destinatário (para preheader/footer)
 * @param {string} args.resetUrl     — URL completo com token
 * @param {number} args.ttlMinutes   — validade do link em minutos
 * @param {string} [args.firstName]  — primeiro nome (opcional, personaliza)
 * @param {string} [args.baseUrl]    — URL do produto (footer)
 * @returns {{ subject: string, html: string, text: string, preheader: string }}
 */
export function renderPasswordResetEmail({
  to,
  resetUrl,
  ttlMinutes,
  firstName,
  baseUrl,
}) {
  const name = firstWord(firstName);
  const nameDisplay = capitalizeFirst(name);
  const greeting = name ? `oi, ${name.toLowerCase()}` : "oi";
  const preheader = `Link válido por ${ttlMinutes} minutos. Se não foi você, pode ignorar com segurança.`;
  const subject = "redefinir senha · manager-prompts";

  const html = buildHtml({
    nameDisplay: escapeHtml(nameDisplay),
    to: escapeHtml(to),
    resetUrl, // já é URL nossa com token opaco — não escape (quebraria)
    resetUrlDisplay: escapeHtml(resetUrl),
    ttlMinutes,
    preheader: escapeHtml(preheader),
    baseUrl: baseUrl || "",
    baseUrlDisplay: escapeHtml(baseUrl || ""),
  });

  const text = buildText({ greeting, resetUrl, ttlMinutes, baseUrl });

  return { subject, html, text, preheader };
}

// ---------------------------------------------------------------------------

function buildHtml({
  nameDisplay,
  to,
  resetUrl,
  resetUrlDisplay,
  ttlMinutes,
  preheader,
  baseUrl,
  baseUrlDisplay,
}) {
  // Paleta DARK MODE — calibrada pelo template fornecido.
  // Typography híbrida: mono no chrome (wordmark, eyebrow, heading, URL),
  // sans no body (parágrafos longos, security box, footer) — mais legível.
  const BG = "#0a0a07";
  const CARD = "#141410";
  const SECURITY_BG = "#0f0f0c";  // levemente mais escuro que CARD pra "afundar"
  const RULE = "#2a2820";
  const INK_1 = "#f5efde";   // 16:1 — heading, valores chave
  const INK_2 = "#cdc7b3";   // 11:1 — body principal
  const INK_3 = "#8e8876";   // 5.5:1 — meta, footer
  const INK_4 = "#5c5746";   // 2.6:1 — ornamentos (//, ·, [])
  const INK_DIM = "#a8a290"; // intermediário para security box body
  const ACCENT = "#e6b066";
  const ACCENT_ON = "#1a1605";

  const MONO = `'SF Mono', SFMono-Regular, Consolas, Menlo, "Liberation Mono", "Courier New", monospace`;
  const SANS = `-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif`;

  const preheaderStyle =
    "display:none;overflow:hidden;line-height:1px;opacity:0;max-height:0;max-width:0;mso-hide:all;";

  // Greeting com fallback se não houver nome.
  const greetingLine = nameDisplay
    ? `Oi, <strong style="color:${INK_1};font-weight:600;">${nameDisplay}</strong> &mdash; recebemos um pedido para redefinir a senha da conta vinculada a <strong style="color:${INK_1};font-weight:600;word-break:break-word;">${to}</strong>. Toque no botão abaixo para escolher uma senha nova.`
    : `Recebemos um pedido para redefinir a senha da conta vinculada a <strong style="color:${INK_1};font-weight:600;word-break:break-word;">${to}</strong>. Toque no botão abaixo para escolher uma senha nova.`;

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="x-apple-disable-message-reformatting" />
  <meta name="color-scheme" content="light dark" />
  <meta name="supported-color-schemes" content="light dark" />
  <title>redefinir senha · manager-prompts</title>
  <style>
    body,table,td,a { -webkit-text-size-adjust:100%; -ms-text-size-adjust:100%; }
    table,td { mso-table-lspace:0pt; mso-table-rspace:0pt; }
    img { -ms-interpolation-mode:bicubic; border:0; outline:none; text-decoration:none; display:block; }
    body { margin:0 !important; padding:0 !important; width:100% !important; background:${BG}; }
    a { text-decoration:none; }

    @media (max-width:600px) {
      .wrap { width:100% !important; max-width:100% !important; }
      .pad-x { padding-left:22px !important; padding-right:22px !important; }
      .h1-mobile { font-size:24px !important; line-height:1.2 !important; }
      .cta-btn { width:100% !important; }
      .cta-btn a { display:block !important; box-sizing:border-box !important; }
    }
  </style>
</head>
<body style="margin:0;padding:0;background:${BG};color:${INK_1};">
  <div style="${preheaderStyle}">${preheader}</div>

  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${BG}" style="background:${BG};">
    <tr>
      <td align="center" style="padding:40px 16px;">

        <!-- ════════════════════════════════════════════════════════════
             Card principal
             ════════════════════════════════════════════════════════════ -->
        <table role="presentation" class="wrap" width="560" cellpadding="0" cellspacing="0" border="0" bgcolor="${CARD}" style="width:560px;max-width:560px;background:${CARD};border:1px solid ${RULE};border-radius:8px;">

          <!-- Header — wordmark limpo, sem versionamento -->
          <tr>
            <td class="pad-x" style="padding:22px 36px;border-bottom:1px solid ${RULE};font-family:${MONO};font-size:14px;font-weight:700;color:${INK_1};line-height:1;">
              manager<span style="color:${ACCENT};">-</span>prompts
            </td>
          </tr>

          <!-- Hero -->
          <tr>
            <td class="pad-x" style="padding:40px 36px 24px 36px;">

              <!-- Eyebrow — terminal vibe -->
              <p style="margin:0 0 14px 0;font-family:${MONO};font-size:12px;font-weight:600;color:${INK_3};line-height:1;letter-spacing:0.04em;">
                <span style="color:${ACCENT};">$</span> auth.reset
              </p>

              <!-- Heading — peso visual máximo -->
              <h1 class="h1-mobile" style="margin:0 0 18px 0;font-family:${MONO};font-size:28px;line-height:1.18;font-weight:700;color:${INK_1};letter-spacing:-0.015em;">
                redefinir senha
              </h1>

              <!-- Body em sans-serif: mais legível para parágrafos -->
              <p style="margin:0;font-family:${SANS};font-size:15px;line-height:1.6;color:${INK_2};">
                ${greetingLine}
              </p>
            </td>
          </tr>

          <!-- CTA bulletproof — width 100% pra dominar a hierarquia -->
          <tr>
            <td class="pad-x" align="center" style="padding:4px 36px 28px 36px;">
              <!--[if mso]>
              <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${resetUrl}" style="height:56px;v-text-anchor:middle;width:488px;" arcsize="11%" stroke="f" fillcolor="${ACCENT}">
                <w:anchorlock/>
                <center style="color:${ACCENT_ON};font-family:Consolas,monospace;font-size:16px;font-weight:700;letter-spacing:0.02em;">redefinir senha</center>
              </v:roundrect>
              <![endif]-->
              <!--[if !mso]><!-- -->
              <table role="presentation" class="cta-btn" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:separate;">
                <tr>
                  <td align="center" bgcolor="${ACCENT}" style="background:${ACCENT};border-radius:6px;">
                    <a href="${resetUrl}"
                      style="display:block;padding:18px 24px;font-family:${MONO};font-size:16px;font-weight:700;line-height:1;letter-spacing:0.02em;color:${ACCENT_ON};text-decoration:none;border-radius:6px;text-align:center;">
                      redefinir senha
                    </a>
                  </td>
                </tr>
              </table>
              <!--<![endif]-->
            </td>
          </tr>

          <!-- Caixa de segurança — info crítica com peso visual próprio -->
          <tr>
            <td class="pad-x" style="padding:0 36px 28px 36px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${SECURITY_BG}" style="background:${SECURITY_BG};border:1px solid ${RULE};border-radius:6px;">
                <tr>
                  <td style="padding:18px 22px;font-family:${SANS};font-size:13px;line-height:1.85;color:${INK_DIM};">
                    <span style="color:${ACCENT};font-weight:700;">❯</span>&nbsp; válido por <strong style="color:${INK_1};font-weight:600;">${ttlMinutes} minutos</strong><br />
                    <span style="color:${ACCENT};font-weight:700;">❯</span>&nbsp; pode ser usado <strong style="color:${INK_1};font-weight:600;">uma única vez</strong><br />
                    <span style="color:${ACCENT};font-weight:700;">❯</span>&nbsp; todas as sessões ativas serão encerradas após a troca
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Fallback link -->
          <tr>
            <td class="pad-x" style="padding:0 36px 8px 36px;">
              <p style="margin:0 0 8px 0;font-family:${SANS};font-size:12px;font-weight:500;color:${INK_3};line-height:1.5;">
                <span style="color:${INK_4};">//</span> botão não funciona? cole no navegador:
              </p>
              <p style="margin:0;font-family:${MONO};font-size:12px;line-height:1.5;color:${INK_2};word-break:break-all;">
                <a href="${resetUrl}" style="color:${INK_2};text-decoration:underline;text-decoration-color:${INK_4};text-underline-offset:2px;word-break:break-all;">${resetUrlDisplay}</a>
              </p>
            </td>
          </tr>

          <!-- Divisor -->
          <tr>
            <td style="padding:24px 36px 0 36px;">
              <div style="border-top:1px solid ${RULE};line-height:0;font-size:0;">&nbsp;</div>
            </td>
          </tr>

          <!-- Nota de segurança — fechamento tranquilizador -->
          <tr>
            <td class="pad-x" style="padding:18px 36px 28px 36px;">
              <p style="margin:0;font-family:${SANS};font-size:13px;line-height:1.6;color:${INK_3};">
                <strong style="color:${INK_2};font-weight:600;">Não foi você?</strong> Pode ignorar este e-mail com segurança &mdash; sua senha atual continua a mesma até alguém abrir o link acima.
              </p>
            </td>
          </tr>

        </table>

        <!-- ════════════════════════════════════════════════════════════
             Footer — fora do card, mais discreto
             ════════════════════════════════════════════════════════════ -->
        <table role="presentation" class="wrap" width="560" cellpadding="0" cellspacing="0" border="0" style="width:560px;max-width:560px;">
          <tr>
            <td class="pad-x" align="center" style="padding:24px 36px 8px 36px;font-family:${SANS};font-size:11px;font-weight:500;color:${INK_3};line-height:1.7;">
              ${baseUrl ? `<a href="${baseUrl}" style="color:${INK_DIM};text-decoration:none;">${baseUrlDisplay}</a>` : `manager-prompts.site`}
            </td>
          </tr>
          <tr>
            <td class="pad-x" align="center" style="padding:0 36px 12px 36px;font-family:${SANS};font-size:11px;color:${INK_4};line-height:1.6;">
              Você recebeu este e-mail porque alguém solicitou uma redefinição de senha nesta conta.
            </td>
          </tr>
        </table>

      </td>
    </tr>
  </table>
</body>
</html>`;
}

function buildText({ greeting, resetUrl, ttlMinutes, baseUrl }) {
  const lines = [
    `${greeting}.`,
    "",
    "alguém pediu pra redefinir a senha desta conta no manager-prompts.",
    `o link abaixo é válido por ${ttlMinutes} minutos e só pode ser usado uma vez.`,
    "",
    "definir nova senha:",
    resetUrl,
    "",
    `— expira em ${ttlMinutes} min`,
    "— uso único",
    "— todas as sessões ativas serão encerradas após a troca",
    "",
    "se não foi você, ignore este email — nada muda até alguém abrir o link.",
    "",
    "--",
    `manager-prompts${baseUrl ? `  ·  ${baseUrl}` : ""}`,
  ];
  return lines.join("\n");
}
