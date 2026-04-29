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
  // Paleta hex — mesma intenção do tema dark do app, porém fixa (email).
  const BG = "#0f100c";
  const CARD = "#17181a";
  const RULE = "#292a23";
  const INK_1 = "#e9e4d6";
  const INK_2 = "#b8b2a1";
  const INK_3 = "#7a7466";
  const INK_4 = "#55503f";
  const ACCENT = "#d6a35c";
  const ACCENT_ON = "#14140d";

  const MONO = `SFMono-Regular, Consolas, "Liberation Mono", Menlo, "Courier New", monospace`;

  // Preheader invisível: aparece no preview da caixa de entrada, some no corpo.
  const preheaderStyle =
    "display:none;overflow:hidden;line-height:1px;opacity:0;max-height:0;max-width:0;";

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="color-scheme" content="dark only" />
  <meta name="supported-color-schemes" content="dark" />
  <title>redefinir senha · manager-prompts</title>
  <style>
    body,table,td,a { -webkit-text-size-adjust:100%; -ms-text-size-adjust:100%; }
    table,td { mso-table-lspace:0pt; mso-table-rspace:0pt; }
    img { -ms-interpolation-mode:bicubic; border:0; outline:none; text-decoration:none; }
    body { margin:0 !important; padding:0 !important; width:100% !important; background:${BG}; }
    a { color:${ACCENT}; text-decoration:none; }
    .mono { font-family:${MONO}; }
    @media (max-width:600px) {
      .wrap { width:100% !important; }
      .pad { padding-left:24px !important; padding-right:24px !important; }
      .cta { display:block !important; width:100% !important; box-sizing:border-box; text-align:center !important; }
      .meta-row td { padding-bottom:10px !important; }
    }
  </style>
</head>
<body style="margin:0;padding:0;background:${BG};color:${INK_1};font-family:${MONO};">
  <div style="${preheaderStyle}">${preheader}</div>

  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${BG}" style="background:${BG};">
    <tr>
      <td align="center" style="padding:40px 16px;">
        <table role="presentation" class="wrap" width="560" cellpadding="0" cellspacing="0" border="0" style="width:560px;max-width:560px;background:${CARD};border:1px solid ${RULE};border-radius:4px;">

          <!-- Cabeçalho: wordmark + status ............................ -->
          <tr>
            <td class="pad" style="padding:28px 36px 20px 36px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td align="left" style="font-family:${MONO};font-size:15px;font-weight:600;color:${INK_1};letter-spacing:-0.01em;">
                    manager<span style="color:${ACCENT};">-</span>prompts
                  </td>
                  <td align="right" style="font-family:${MONO};font-size:11px;color:${INK_3};letter-spacing:0.04em;">
                    v2.0 · reset
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Rule -->
          <tr><td style="padding:0 36px;"><div style="border-top:1px solid ${RULE};line-height:0;font-size:0;">&nbsp;</div></td></tr>

          <!-- Saudação + chamada ................................... -->
          <tr>
            <td class="pad" style="padding:28px 36px 4px 36px;">
              <p style="margin:0 0 6px 0;font-family:${MONO};font-size:12px;color:${INK_3};letter-spacing:0.04em;">
                <span style="color:${INK_4};">[</span>auth<span style="color:${INK_4};">]</span> &nbsp;fluxo de reset
              </p>
              <h1 style="margin:0 0 12px 0;font-family:${MONO};font-size:22px;line-height:1.2;font-weight:600;color:${INK_1};letter-spacing:-0.01em;">
                ${greeting}.
              </h1>
              <p style="margin:0;font-family:${MONO};font-size:14px;line-height:1.6;color:${INK_2};">
                alguém pediu pra redefinir a senha da conta
                <span style="color:${INK_1};">${to}</span>.
                o link abaixo é <strong style="color:${INK_1};font-weight:600;">válido por ${ttlMinutes} minutos</strong>
                e só pode ser usado <strong style="color:${INK_1};font-weight:600;">uma vez</strong>.
              </p>
            </td>
          </tr>

          <!-- CTA .................................................... -->
          <tr>
            <td class="pad" style="padding:24px 36px 12px 36px;">
              <!--[if mso]>
              <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${resetUrl}" style="height:44px;v-text-anchor:middle;width:260px;" arcsize="7%" stroke="f" fillcolor="${ACCENT}">
                <w:anchorlock/>
                <center style="color:${ACCENT_ON};font-family:Consolas,monospace;font-size:14px;font-weight:600;letter-spacing:0.02em;">❯ definir nova senha</center>
              </v:roundrect>
              <![endif]-->
              <!--[if !mso]><!-- -->
              <a class="cta mono" href="${resetUrl}"
                style="display:inline-block;background:${ACCENT};color:${ACCENT_ON};font-family:${MONO};font-size:14px;font-weight:600;line-height:1;letter-spacing:0.02em;padding:14px 26px;border-radius:3px;text-decoration:none;">
                <span style="color:${ACCENT_ON};">❯&nbsp;</span>definir nova senha
              </a>
              <!--<![endif]-->
            </td>
          </tr>

          <!-- Link fallback em texto ............................... -->
          <tr>
            <td class="pad" style="padding:8px 36px 24px 36px;">
              <p style="margin:0 0 6px 0;font-family:${MONO};font-size:11px;color:${INK_4};letter-spacing:0.02em;">
                ou cole isto no navegador:
              </p>
              <p style="margin:0;font-family:${MONO};font-size:11px;line-height:1.5;color:${INK_3};word-break:break-all;">
                <a href="${resetUrl}" style="color:${ACCENT};text-decoration:none;word-break:break-all;">${resetUrlDisplay}</a>
              </p>
            </td>
          </tr>

          <!-- Rule -->
          <tr><td style="padding:0 36px;"><div style="border-top:1px solid ${RULE};line-height:0;font-size:0;">&nbsp;</div></td></tr>

          <!-- Meta grid ............................................ -->
          <tr>
            <td class="pad" style="padding:20px 36px 4px 36px;">
              <table role="presentation" class="meta-row" width="100%" cellpadding="0" cellspacing="0" border="0" style="font-family:${MONO};font-size:11px;color:${INK_3};letter-spacing:0.02em;line-height:1.5;">
                <tr>
                  <td valign="top" width="30%" style="padding:0 12px 6px 0;">
                    <span style="color:${INK_4};">expira</span><br />
                    <span style="color:${INK_2};">${ttlMinutes} min</span>
                  </td>
                  <td valign="top" width="30%" style="padding:0 12px 6px 0;">
                    <span style="color:${INK_4};">uso</span><br />
                    <span style="color:${INK_2};">único</span>
                  </td>
                  <td valign="top" width="40%" style="padding:0 0 6px 0;">
                    <span style="color:${INK_4};">sessões</span><br />
                    <span style="color:${INK_2};">todas serão encerradas</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Ignore note .......................................... -->
          <tr>
            <td class="pad" style="padding:16px 36px 28px 36px;">
              <p style="margin:0;font-family:${MONO};font-size:12px;line-height:1.55;color:${INK_3};">
                <span style="color:${INK_4};">//</span>
                se não foi você, ignore este email — nada muda até alguém abrir o link.
              </p>
            </td>
          </tr>

        </table>

        <!-- Footer fora do card ................................... -->
        <table role="presentation" class="wrap" width="560" cellpadding="0" cellspacing="0" border="0" style="width:560px;max-width:560px;">
          <tr>
            <td class="pad" align="center" style="padding:16px 36px 0 36px;font-family:${MONO};font-size:10px;color:${INK_4};letter-spacing:0.04em;line-height:1.6;">
              manager-prompts
              ${baseUrl ? `&nbsp;·&nbsp; <a href="${baseUrl}" style="color:${INK_3};text-decoration:none;">${baseUrlDisplay}</a>` : ""}
            </td>
          </tr>
          <tr>
            <td class="pad" align="center" style="padding:4px 36px 0 36px;font-family:${MONO};font-size:10px;color:${INK_4};letter-spacing:0.04em;line-height:1.6;">
              você está recebendo porque alguém pediu um reset usando ${to}.
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
