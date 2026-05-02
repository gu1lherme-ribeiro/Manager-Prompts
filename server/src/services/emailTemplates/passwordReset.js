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
// ("token", "single-use", "ttl"). Mantido coerente com a UI de /reset.

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

// Extrai os primeiros chars do token pra mostrar como "request id" no email.
// Defensivo: qualquer falha retorna null e a feature simplesmente não aparece.
function extractTokenPreview(resetUrl) {
  try {
    const url = new URL(resetUrl);
    const token = url.searchParams.get("token");
    if (!token || token.length < 10) return null;
    return token.slice(0, 7);
  } catch {
    return null;
  }
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
  const tokenPreview = extractTokenPreview(resetUrl);

  const html = buildHtml({
    nameDisplay: escapeHtml(nameDisplay),
    to: escapeHtml(to),
    resetUrl, // já é URL nossa com token opaco — não escape (quebraria)
    resetUrlDisplay: escapeHtml(resetUrl),
    ttlMinutes,
    preheader: escapeHtml(preheader),
    baseUrl: baseUrl || "",
    baseUrlDisplay: escapeHtml(baseUrl || ""),
    tokenPreview: tokenPreview ? escapeHtml(tokenPreview) : null,
  });

  const text = buildText({ greeting, resetUrl, ttlMinutes, baseUrl, tokenPreview });

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
  tokenPreview,
}) {
  // Paleta DARK MODE — calibrada pelo template fornecido.
  // Typography híbrida: mono no chrome (wordmark, eyebrow, heading, security
  // box, URL), sans no body (parágrafos longos, footer) — mais legível.
  const BG = "#0a0a07";
  const CARD = "#141410";
  const SUNKEN_BG = "#0d0d09";  // levemente mais escuro que CARD pra "afundar"
  const RULE = "#2a2820";
  const RULE_SOFT = "#1f1d17";  // divisor sutil para tabela interna
  const INK_1 = "#f5efde";   // 16:1 — heading, valores chave
  const INK_2 = "#cdc7b3";   // 11:1 — body principal
  const INK_3 = "#8e8876";   // 5.5:1 — meta, footer
  const INK_4 = "#5c5746";   // 2.6:1 — ornamentos (//, ·, [])
  const INK_DIM = "#a8a290"; // intermediário
  const ACCENT = "#e6b066";
  const ACCENT_SHADOW = "#b8843d";  // borda inferior do CTA, dá profundidade
  const ACCENT_ON = "#1a1605";

  // Webfonts: Apple Mail, iOS Mail, Gmail (web/Android) e Outlook.com renderizam.
  // Outlook desktop (Windows) ignora <link>/@font-face silenciosamente e cai
  // nos fallbacks da stack — comportamento esperado, não bug.
  const MONO = `'Red Hat Mono', ui-monospace, 'SF Mono', Menlo, Consolas, monospace`;
  const SANS = `'Hanken Grotesk', system-ui, -apple-system, 'Segoe UI', sans-serif`;

  const preheaderStyle =
    "display:none;overflow:hidden;line-height:1px;opacity:0;max-height:0;max-width:0;mso-hide:all;";

  // Greeting com fallback se não houver nome.
  const greetingLine = nameDisplay
    ? `Oi, <strong style="color:${INK_1};font-weight:600;">${nameDisplay}</strong> &mdash; recebemos um pedido para redefinir a senha da conta vinculada a <strong style="color:${INK_1};font-weight:600;word-break:break-word;">${to}</strong>. Toque no botão abaixo para escolher uma senha nova.`
    : `Recebemos um pedido para redefinir a senha da conta vinculada a <strong style="color:${INK_1};font-weight:600;word-break:break-word;">${to}</strong>. Toque no botão abaixo para escolher uma senha nova.`;

  // Linha de "request id" só renderiza se conseguimos extrair preview do token.
  const tokenLine = tokenPreview
    ? `<tr>
                        <td style="padding:8px 0 0 0;font-family:${MONO};font-size:12px;line-height:1.5;color:${INK_4};border-top:1px solid ${RULE_SOFT};white-space:nowrap;">
                          <span style="color:${INK_4};">req</span>
                        </td>
                        <td style="padding:8px 0 0 0;font-family:${MONO};font-size:12px;line-height:1.5;color:${INK_3};border-top:1px solid ${RULE_SOFT};">
                          ${tokenPreview}<span style="color:${INK_4};">…</span>
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
  <title>redefinir senha · manager-prompts</title>
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
      .cta-btn { width:100% !important; }
      .cta-btn a { display:block !important; box-sizing:border-box !important; padding-left:24px !important; padding-right:24px !important; }
      .meta-key { width:64px !important; }
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

          <!-- Header — wordmark com indicador âmbar à esquerda -->
          <tr>
            <td class="pad-x" style="padding:22px 36px;border-bottom:1px solid ${RULE};font-family:${MONO};font-size:14px;font-weight:700;color:${INK_1};line-height:1;">
              <span style="display:inline-block;width:3px;height:14px;background:${ACCENT};vertical-align:-2px;margin-right:10px;"></span>manager<span style="color:${ACCENT};">-</span>prompts
            </td>
          </tr>

          <!-- Hero -->
          <tr>
            <td class="pad-x" style="padding:44px 36px 24px 36px;">

              <!-- Eyebrow — terminal vibe -->
              <p style="margin:0 0 16px 0;font-family:${MONO};font-size:12px;font-weight:600;color:${INK_3};line-height:1;letter-spacing:0.04em;">
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

          <!-- CTA bulletproof — maior, com seta, com border-bottom dando profundidade
               sem depender de box-shadow (muitos clients descartam shadows). -->
          <tr>
            <td class="pad-x" align="center" style="padding:8px 36px 32px 36px;">
              <!--[if mso]>
              <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${resetUrl}" style="height:54px;v-text-anchor:middle;width:300px;" arcsize="6%" stroke="f" fillcolor="${ACCENT}">
                <w:anchorlock/>
                <center style="color:${ACCENT_ON};font-family:Consolas,monospace;font-size:15px;font-weight:700;letter-spacing:0.02em;">redefinir senha &rarr;</center>
              </v:roundrect>
              <![endif]-->
              <!--[if !mso]><!-- -->
              <table role="presentation" class="cta-btn" cellpadding="0" cellspacing="0" border="0" align="center" style="border-collapse:separate;margin:0 auto;">
                <tr>
                  <td align="center" bgcolor="${ACCENT}" style="background:${ACCENT};border-radius:3px;border-bottom:2px solid ${ACCENT_SHADOW};">
                    <a href="${resetUrl}"
                      style="display:inline-block;padding:18px 56px;font-family:${MONO};font-size:15px;font-weight:700;line-height:1;letter-spacing:0.02em;color:${ACCENT_ON};text-decoration:none;border-radius:3px;text-align:center;">
                      redefinir senha&nbsp;&rarr;
                    </a>
                  </td>
                </tr>
              </table>
              <!--<![endif]-->
            </td>
          </tr>

          <!-- Caixa de segurança — reformulada como tabela key-value estilo log.
               Identidade dev-tool reforçada: keys em mono+âmbar, values em mono+ink_1.
               Inclui token preview ("req: S8Q62Au…") quando disponível, dando
               sensação de autenticidade real (vs. phishing genérico). -->
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
                        <td class="meta-key" style="width:80px;padding:6px 0 ${tokenPreview ? "6px" : "0"} 0;font-family:${MONO};font-size:13px;line-height:1.5;color:${ACCENT};vertical-align:top;white-space:nowrap;border-top:1px solid ${RULE_SOFT};">
                          scope
                        </td>
                        <td style="padding:6px 0 ${tokenPreview ? "6px" : "0"} 0;font-family:${MONO};font-size:13px;line-height:1.5;color:${INK_1};vertical-align:top;border-top:1px solid ${RULE_SOFT};">
                          encerra todas as sessões ativas
                        </td>
                      </tr>
                      ${tokenLine}
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Fallback link — agora em "code block" com background próprio
               em vez de texto solto sublinhado. -->
          <tr>
            <td class="pad-x" style="padding:0 36px 8px 36px;">
              <p style="margin:0 0 10px 0;font-family:${SANS};font-size:12px;font-weight:500;color:${INK_3};line-height:1.5;">
                <span style="color:${INK_4};">//</span> botão não funciona? cole no navegador:
              </p>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${SUNKEN_BG}" style="background:${SUNKEN_BG};border:1px solid ${RULE_SOFT};border-radius:4px;">
                <tr>
                  <td style="padding:12px 14px;font-family:${MONO};font-size:12px;line-height:1.55;color:${INK_2};word-break:break-all;">
                    <a href="${resetUrl}" style="color:${INK_2};text-decoration:none;word-break:break-all;">${resetUrlDisplay}</a>
                  </td>
                </tr>
              </table>
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
            <td class="pad-x" align="center" style="padding:24px 36px 6px 36px;font-family:${MONO};font-size:11px;font-weight:600;color:${INK_3};line-height:1.7;letter-spacing:0.02em;">
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

function buildText({ greeting, resetUrl, ttlMinutes, baseUrl, tokenPreview }) {
  const lines = [
    `${greeting}.`,
    "",
    "alguém pediu pra redefinir a senha desta conta no manager-prompts.",
    `o link abaixo é válido por ${ttlMinutes} minutos e só pode ser usado uma vez.`,
    "",
    "definir nova senha:",
    resetUrl,
    "",
    `ttl     ${ttlMinutes} minutos`,
    "uses    single-use",
    "scope   encerra todas as sessões ativas",
  ];

  if (tokenPreview) {
    lines.push(`req     ${tokenPreview}…`);
  }

  lines.push(
    "",
    "se não foi você, ignore este email — nada muda até alguém abrir o link.",
    "",
    "--",
    `manager-prompts${baseUrl ? `  ·  ${baseUrl}` : ""}`,
  );

  return lines.join("\n");
}
