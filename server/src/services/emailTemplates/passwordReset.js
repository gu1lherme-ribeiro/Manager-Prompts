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
  const greeting = name ? `oi, ${name.toLowerCase()}` : "oi";
  const preheader = `este link expira em ${ttlMinutes} min. se não foi você, ignore.`;
  const subject = "redefinir senha · manager-prompts";

  const html = buildHtml({
    greeting: escapeHtml(greeting),
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
  greeting,
  to,
  resetUrl,
  resetUrlDisplay,
  ttlMinutes,
  preheader,
  baseUrl,
  baseUrlDisplay,
}) {
  // Paleta calibrada pra contraste WCAG AAA em texto e AA em meta/decoração.
  // Gmail dark-mode tende a esmagar luminância — usamos margem generosa.
  const BG = "#0a0a07";       // page bg, deeper than card
  const CARD = "#1a1a13";     // ~6 lightness above BG, claramente distinto
  const RULE = "#33312a";     // border visível
  const INK_1 = "#f5efde";    // 16:1 — heading, dado-chave (use com restrição)
  const INK_2 = "#cdc7b3";    // 11:1 — body principal, AAA
  const INK_3 = "#8e8876";    // 5.5:1 — meta, footer (AA passa)
  const INK_4 = "#5c5746";    // 2.6:1 — APENAS ornamento (//, ·, [], $)
  const ACCENT = "#e6b066";   // âmbar levemente mais brilhante p/ visibilidade
  const ACCENT_ON = "#1a1605";// texto preto-quente sobre âmbar

  const MONO = `SFMono-Regular, Consolas, "Liberation Mono", Menlo, "Courier New", monospace`;

  const preheaderStyle =
    "display:none;overflow:hidden;line-height:1px;opacity:0;max-height:0;max-width:0;";

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="color-scheme" content="dark" />
  <meta name="supported-color-schemes" content="dark" />
  <title>redefinir senha · manager-prompts</title>
  <style>
    body,table,td,a { -webkit-text-size-adjust:100%; -ms-text-size-adjust:100%; }
    table,td { mso-table-lspace:0pt; mso-table-rspace:0pt; }
    img { -ms-interpolation-mode:bicubic; border:0; outline:none; text-decoration:none; }
    body { margin:0 !important; padding:0 !important; width:100% !important; background:${BG}; }
    a { text-decoration:none; }
    @media (max-width:600px) {
      .wrap { width:100% !important; }
      .pad-x { padding-left:24px !important; padding-right:24px !important; }
      .cta-cell { padding-left:24px !important; padding-right:24px !important; }
      .cta-btn { width:100% !important; }
      .cta-btn td { padding-left:0 !important; padding-right:0 !important; }
    }
  </style>
</head>
<body style="margin:0;padding:0;background:${BG};color:${INK_1};font-family:${MONO};">
  <div style="${preheaderStyle}">${preheader}</div>

  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${BG}" style="background:${BG};">
    <tr>
      <td align="center" style="padding:48px 16px;">

        <!-- ════════════════════════════════════════════════════════════
             Card principal
             ════════════════════════════════════════════════════════════ -->
        <table role="presentation" class="wrap" width="560" cellpadding="0" cellspacing="0" border="0" bgcolor="${CARD}" style="width:560px;max-width:560px;background:${CARD};border:1px solid ${RULE};border-radius:6px;">

          <!-- Header bar — chrome compacto -->
          <tr>
            <td class="pad-x" style="padding:20px 36px;border-bottom:1px solid ${RULE};">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td align="left" style="font-family:${MONO};font-size:14px;font-weight:700;color:${INK_1};line-height:1;">
                    manager<span style="color:${ACCENT};">-</span>prompts
                  </td>
                  <td align="right" style="font-family:${MONO};font-size:11px;font-weight:500;color:${INK_3};line-height:1;">
                    reset · v2
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Hero block — eyebrow + heading grande + body 1 frase -->
          <tr>
            <td class="pad-x" style="padding:44px 36px 28px 36px;">
              <p style="margin:0 0 14px 0;font-family:${MONO};font-size:12px;font-weight:500;color:${INK_3};line-height:1;">
                <span style="color:${INK_4};">$</span> auth.reset
              </p>
              <h1 style="margin:0 0 18px 0;font-family:${MONO};font-size:28px;line-height:1.15;font-weight:700;color:${INK_1};letter-spacing:-0.015em;">
                redefinir senha
              </h1>
              <p style="margin:0;font-family:${MONO};font-size:15px;font-weight:500;line-height:1.65;color:${INK_2};">
                ${greeting} — você pediu um reset desta conta. clique no botão abaixo pra escolher uma senha nova.
              </p>
            </td>
          </tr>

          <!-- CTA bulletproof — table-based, peso visual máximo -->
          <tr>
            <td class="cta-cell" align="left" style="padding:0 36px 18px 36px;">
              <!--[if mso]>
              <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${resetUrl}" style="height:48px;v-text-anchor:middle;width:280px;" arcsize="8%" stroke="f" fillcolor="${ACCENT}">
                <w:anchorlock/>
                <center style="color:${ACCENT_ON};font-family:Consolas,monospace;font-size:15px;font-weight:700;letter-spacing:0.02em;">❯ definir nova senha</center>
              </v:roundrect>
              <![endif]-->
              <!--[if !mso]><!-- -->
              <table role="presentation" class="cta-btn" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate;">
                <tr>
                  <td align="center" bgcolor="${ACCENT}" style="background:${ACCENT};border-radius:5px;">
                    <a href="${resetUrl}"
                      style="display:inline-block;padding:15px 30px;font-family:${MONO};font-size:15px;font-weight:700;line-height:1;letter-spacing:0.01em;color:${ACCENT_ON};text-decoration:none;border-radius:5px;">
                      <span style="color:${ACCENT_ON};">❯</span>&nbsp;definir nova senha
                    </a>
                  </td>
                </tr>
              </table>
              <!--<![endif]-->
            </td>
          </tr>

          <!-- Meta line — info crítica em uma linha, contraste forte nos valores -->
          <tr>
            <td class="pad-x" style="padding:0 36px 32px 36px;">
              <p style="margin:0;font-family:${MONO};font-size:13px;font-weight:500;color:${INK_3};line-height:1.5;">
                expira em <span style="color:${INK_1};font-weight:700;">${ttlMinutes} min</span>
                &nbsp;<span style="color:${INK_4};">·</span>&nbsp; uso <span style="color:${INK_1};font-weight:700;">único</span>
                &nbsp;<span style="color:${INK_4};">·</span>&nbsp; sessões serão encerradas
              </p>
            </td>
          </tr>

          <!-- Rule -->
          <tr>
            <td style="padding:0 36px;">
              <div style="border-top:1px solid ${RULE};line-height:0;font-size:0;">&nbsp;</div>
            </td>
          </tr>

          <!-- Fallback link — recessivo mas legível (INK_2 em vez de INK_3) -->
          <tr>
            <td class="pad-x" style="padding:26px 36px 10px 36px;">
              <p style="margin:0 0 10px 0;font-family:${MONO};font-size:12px;font-weight:500;color:${INK_3};line-height:1.4;">
                <span style="color:${INK_4};">//</span> ou copie no navegador:
              </p>
              <p style="margin:0;font-family:${MONO};font-size:12px;line-height:1.5;color:${INK_2};word-break:break-all;">
                <a href="${resetUrl}" style="color:${INK_2};text-decoration:underline;text-decoration-color:${INK_4};word-break:break-all;">${resetUrlDisplay}</a>
              </p>
            </td>
          </tr>

          <!-- Ignore note — comentário dev-style, AAA contrast -->
          <tr>
            <td class="pad-x" style="padding:22px 36px 30px 36px;">
              <p style="margin:0;font-family:${MONO};font-size:13px;font-weight:500;line-height:1.55;color:${INK_3};">
                <span style="color:${INK_4};">//</span> se não foi você, ignore. nada muda até alguém abrir o link.
              </p>
            </td>
          </tr>

        </table>

        <!-- ════════════════════════════════════════════════════════════
             Footer (fora do card, mais discreto mas ainda legível)
             ════════════════════════════════════════════════════════════ -->
        <table role="presentation" class="wrap" width="560" cellpadding="0" cellspacing="0" border="0" style="width:560px;max-width:560px;">
          <tr>
            <td class="pad-x" align="center" style="padding:28px 36px 0 36px;font-family:${MONO};font-size:11px;font-weight:500;color:${INK_3};line-height:1.7;">
              manager-prompts${baseUrl ? `&nbsp;<span style="color:${INK_4};">·</span>&nbsp;<a href="${baseUrl}" style="color:${INK_3};text-decoration:none;">${baseUrlDisplay}</a>` : ""}
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
