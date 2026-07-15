// ============================================================
// send-email.js — v2026-07-12
// Canonical shared version — deploy to ALL FOUR repos:
// sb-orderform, brl-orderform, brl-back-office, brl-catalogo
// This version: bilingual EN/ES + card/Klarna support + payment_link email
// ============================================================

// /netlify/functions/send-email.js
//
// Single endpoint for all BRL + SB transactional email.
// Template style: dark branded header/footer, white body card, light gray info boxes.
//
// Requires env var RESEND_API_KEY set in Netlify: Project configuration > Environment variables.

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const ALERT_EMAIL = "boldresearchlabs.orders@gmail.com";

const BRANDS = {
  BRL: {
    name: "Bold Research Labs",
    accent: "#d4af37",   // gold — used on dark bg (wordmark dot, CTA text)
    rgbAccent: "212,175,55",
    tintBg: "#fdf6e3",   // pale gold — highlight box background
    tintText: "#5c4813", // readable dark gold — highlight box text
    orderFormUrl: "https://brl-orderform.netlify.app/",
    fromAddress: "orders@brlpeptides.com",
    lang: "en",
  },
  SB: {
    name: "SB Peptides",
    accent: "#c8f000",   // lime — used on dark bg
    rgbAccent: "200,240,0",
    tintBg: "#f0ffe0",   // pale lime
    tintText: "#3a5200", // readable dark green
    orderFormUrl: "https://sb-orderform.netlify.app/",
    fromAddress: "sb.orders@brlpeptides.com",
    lang: "en",
  },
  BRL_ES: {
    name: "Bold Research Labs",
    accent: "#d4af37",   // same gold as BRL — same brand, different language
    rgbAccent: "212,175,55",
    tintBg: "#fdf6e3",
    tintText: "#5c4813",
    orderFormUrl: "https://brl-catalogo.netlify.app/",
    fromAddress: "es.orders@brlpeptides.com",
    lang: "es",
  },
};

function brandOf(key) {
  return BRANDS[key] === undefined ? BRANDS.BRL : BRANDS[key];
}

function esc(v) {
  if (v === undefined || v === null) return "";
  return String(v).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function fmtMoney(v) {
  if (v === undefined || v === null) return "0.00";
  const s = String(v).replace(/[^0-9.\-]/g, "");
  return s || "0.00";
}

// ── LAYOUT ──
function wrapEmail(brand, subtitle, bodyHtml) {
  return `<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#f4f3ef;">
  <div style="max-width:560px;margin:0 auto;padding:32px 16px;font-family:Arial,Helvetica,sans-serif;">
    <div style="background:#0f0f0f;border-radius:12px 12px 0 0;padding:28px 32px;">
      <div style="font-size:20px;font-weight:800;color:#ffffff;letter-spacing:-0.3px;">${esc(brand.name)}<span style="color:${brand.accent};">.</span></div>
      <div style="font-size:10px;color:rgba(255,255,255,0.35);margin-top:4px;font-family:monospace;text-transform:uppercase;letter-spacing:.1em;">${esc(subtitle)}</div>
    </div>
    <div style="background:#ffffff;padding:28px 32px;border:1px solid #e2e0d8;border-top:none;">
      ${bodyHtml}
    </div>
    <div style="background:#0f0f0f;border-radius:0 0 12px 12px;padding:16px 32px;text-align:center;">
      <div style="font-size:10px;color:rgba(255,255,255,0.25);font-family:monospace;">${esc(brand.name)} &middot; boldresearchlabs.orders@gmail.com</div>
    </div>
  </div>
</body>
</html>`;
}

function card(innerHtml, marginBottom) {
  const mb = marginBottom === undefined ? 20 : marginBottom;
  return `<div style="background:#f7f6f2;border-radius:10px;padding:16px 18px;margin-bottom:${mb}px;">${innerHtml}</div>`;
}

function fieldLabel(text) {
  return `<div style="font-size:9px;font-weight:bold;text-transform:uppercase;letter-spacing:.1em;color:#888;margin-bottom:6px;font-family:monospace;">${esc(text)}</div>`;
}

function orderNumberCard(orderNumber, subtext) {
  return card(`
    ${fieldLabel("Order Number")}
    <div style="font-size:20px;font-weight:800;color:#0f0f0f;font-family:monospace;">${esc(orderNumber)}</div>
    ${subtext ? `<div style="font-size:12px;color:#888;margin-top:4px;">${esc(subtext)}</div>` : ""}
  `);
}

function lineRow(label, value) {
  if (value === undefined || value === null || value === "") return "";
  return `<div style="display:flex;justify-content:space-between;padding:4px 0;">
    <span style="font-size:12px;color:#888;">${esc(label)}</span>
    <span style="font-size:13px;color:#0f0f0f;text-align:right;">${esc(value)}</span>
  </div>`;
}

function amberBox(html, marginBottom) {
  const mb = marginBottom === undefined ? 20 : marginBottom;
  return `<div style="background:#fffbeb;border:1px solid #fde68a;border-radius:10px;padding:14px 16px;margin-bottom:${mb}px;font-size:13px;color:#b45309;line-height:1.6;">${html}</div>`;
}

function highlightBox(brand, title, bodyHtml, ctaLabel, ctaUrl) {
  return `<div style="background:${brand.tintBg};border:1px solid ${brand.accent};border-radius:10px;padding:16px 18px;margin-bottom:20px;">
    <div style="font-size:13px;font-weight:bold;color:${brand.tintText};margin-bottom:8px;">${esc(title)}</div>
    <div style="font-size:13px;color:${brand.tintText};line-height:1.6;${ctaLabel ? "margin-bottom:14px;" : ""}">${bodyHtml}</div>
    ${ctaLabel ? `<div style="text-align:center;"><a style="display:inline-block;padding:12px 28px;background:#0f0f0f;color:${brand.accent};font-family:monospace;font-size:13px;font-weight:bold;text-decoration:none;border-radius:8px;letter-spacing:.05em;" href="${esc(ctaUrl)}" target="_blank" rel="noopener">&nbsp;${esc(ctaLabel)}&nbsp;</a></div>` : ""}
  </div>`;
}

// ── EMAIL BUILDERS ──

function buildConfirmation(brand, d) {
  const es = brand.lang === "es";
  const greeting = es
    ? `<div style="font-size:15px;color:#0f0f0f;margin-bottom:20px;line-height:1.6;">Hola <strong>${esc(d.customer_name || "cliente")}</strong>,<br>¡Recibimos tu pedido! Aquí tienes todos los detalles.</div>`
    : `<div style="font-size:15px;color:#0f0f0f;margin-bottom:20px;line-height:1.6;">Hi <strong>${esc(d.customer_name || "there")}</strong>,<br>Your order has been received! Here's everything you need.</div>`;

  const orderCard = card(`
    ${fieldLabel(es ? "Número de Pedido" : "Order Number")}
    <div style="font-size:22px;font-weight:800;color:#0f0f0f;font-family:monospace;">${esc(d.order_number)}</div>
  `, 14);

  const itemsCard = card(`
    ${fieldLabel(es ? "Artículos Pedidos" : "Items Ordered")}
    <div style="font-size:13px;color:#0f0f0f;line-height:1.8;margin-bottom:12px;">${esc(d.items_summary)}</div>
    ${d.subtotal ? `<div style="display:flex;justify-content:space-between;padding:5px 0;border-bottom:1px solid #e8e6de;font-size:13px;"><span style="color:#888;">${es ? "Subtotal" : "Subtotal"}</span><span style="font-weight:500;">${esc(d.subtotal)}</span></div>` : ""}
    ${d.discount ? `<div style="display:flex;justify-content:space-between;padding:5px 0;border-bottom:1px solid #e8e6de;font-size:13px;"><span style="color:#888;">${es ? "Descuento" : "Discount"}</span><span style="font-weight:500;">${esc(d.discount)}</span></div>` : ""}
    ${d.shipping ? `<div style="display:flex;justify-content:space-between;padding:5px 0;border-bottom:1px solid #e8e6de;font-size:13px;"><span style="color:#888;">${es ? "Envío" : "Shipping"}</span><span style="font-weight:500;">${esc(d.shipping)}</span></div>` : ""}
    ${d.processing_fee && d.processing_fee !== "None" ? `<div style="display:flex;justify-content:space-between;padding:5px 0;border-bottom:1px solid #e8e6de;font-size:13px;"><span style="color:#888;">${es ? "Tarifa de Procesamiento" : "Card Processing Fee"}</span><span style="font-weight:500;">${esc(d.processing_fee)}</span></div>` : ""}
    <div style="display:flex;justify-content:space-between;padding:10px 0 0;font-size:15px;font-weight:bold;border-top:2px solid #0f0f0f;margin-top:4px;"><span>${es ? "Total" : "Total"}</span><span>${esc(d.total)}</span></div>
  `, 14);

  const shipCard = card(`
    ${fieldLabel(es ? "Enviar A" : "Shipping To")}
    <div style="font-size:13px;color:#0f0f0f;line-height:1.6;">${esc(d.shipping_address)}</div>
  `, 14);

  const isCard = d.card_payment === true || d.card_payment === "true";

  const paymentBox = isCard
    ? `<div style="background:#0f0f0f;border-radius:10px;padding:20px 22px;margin-bottom:14px;">
    <div style="font-size:9px;font-weight:bold;text-transform:uppercase;letter-spacing:.1em;color:rgba(255,255,255,0.35);margin-bottom:6px;font-family:monospace;">${es ? "Método de Pago" : "Payment Method"}</div>
    <div style="font-size:13px;color:rgba(255,255,255,0.5);margin-bottom:8px;">${es ? "vía" : "via"} ${esc(d.payment_method)}</div>
    <div style="font-size:22px;font-weight:800;color:${brand.accent};font-family:monospace;">${es ? "💳 Enlace de Pago en Camino" : "💳 Payment Link Coming"}</div>
    <div style="font-size:11px;color:rgba(255,255,255,0.35);margin-top:8px;line-height:1.6;">${esc(d.payment_instructions)}</div>
    <div style="margin-top:14px;padding:12px 16px;background:rgba(${brand.rgbAccent},0.08);border:1px solid rgba(${brand.rgbAccent},0.25);border-radius:8px;">
      <div style="font-size:10px;color:rgba(255,255,255,0.4);margin-bottom:5px;font-family:monospace;text-transform:uppercase;letter-spacing:.06em;">${es ? "📬 Revisa tu bandeja de entrada" : "📬 Watch your inbox"}</div>
      <div style="font-size:13px;font-weight:800;color:${brand.accent};line-height:1.5;">${es ? "Un segundo correo con tu enlace de pago seguro llegará en unos minutos." : "A second email with your secure payment link will arrive within a few minutes."}</div>
      <div style="font-size:10px;color:rgba(255,255,255,0.3);margin-top:5px;line-height:1.5;">${es ? "Paga con tarjeta de crédito, débito o Klarna. Si no lo ves, revisa tu carpeta de spam o responde a este correo y lo reenviaremos." : "Pay by credit card, debit card, or Klarna. If you don't see it, check your spam folder or reply to this email and we'll resend it."}</div>
    </div>
  </div>`
    : `<div style="background:#0f0f0f;border-radius:10px;padding:20px 22px;margin-bottom:14px;">
    <div style="font-size:9px;font-weight:bold;text-transform:uppercase;letter-spacing:.1em;color:rgba(255,255,255,0.35);margin-bottom:6px;font-family:monospace;">${es ? "Enviar Pago A" : "Send Payment To"}</div>
    <div style="font-size:13px;color:rgba(255,255,255,0.5);margin-bottom:8px;">${es ? "vía" : "via"} ${esc(d.payment_method)}</div>
    <div style="font-size:26px;font-weight:800;color:${brand.accent};font-family:monospace;">${esc(d.payment_handle)}</div>
    <div style="font-size:11px;color:rgba(255,255,255,0.35);margin-top:8px;line-height:1.6;">${esc(d.payment_instructions)}</div>
    <div style="margin-top:14px;padding:12px 16px;background:rgba(${brand.rgbAccent},0.08);border:1px solid rgba(${brand.rgbAccent},0.25);border-radius:8px;">
      <div style="font-size:10px;color:rgba(255,255,255,0.4);margin-bottom:5px;font-family:monospace;text-transform:uppercase;letter-spacing:.06em;">${es ? "⚠ Incluye en tu nota de pago:" : "⚠ Include in your payment note:"}</div>
      <div style="font-size:20px;font-weight:800;color:${brand.accent};font-family:monospace;">${esc(d.order_number)}</div>
      <div style="font-size:10px;color:rgba(255,255,255,0.3);margin-top:5px;line-height:1.5;">${es ? "Agregar tu número de pedido nos ayuda a procesar tu pago más rápido." : "Adding your order number helps us match your payment instantly and process your order faster."}</div>
    </div>
  </div>`;

  const nextBox = `<div style="background:#fff8e1;border:1px solid #ffe082;border-radius:10px;padding:13px 16px;margin-bottom:14px;">
    <div style="font-size:12px;color:#7b5800;line-height:1.7;">${isCard
      ? (es
        ? `⏱ <strong>¿Qué sigue?</strong> 1) Tu enlace de pago seguro llegará por correo en unos minutos. 2) Completa el pago a través de nuestro procesador de pagos de confianza. 3) Procesamos tu pedido y te enviamos el rastreo. ¿Preguntas? Responde a este correo.`
        : `⏱ <strong>What happens next?</strong> 1) Your secure payment link arrives by email in a few minutes. 2) Complete payment through our trusted payment processor. 3) We process your order and send tracking. Questions? Just reply to this email.`)
      : (es
        ? `⏱ <strong>¿Qué sigue?</strong> Una vez confirmemos tu pago, procesaremos tu pedido y te enviaremos un correo con tu número de rastreo. Si tienes preguntas, responde a este correo.`
        : `⏱ <strong>What happens next?</strong> Once we confirm your payment we'll process your order and send you a separate email with your tracking number. If you have any questions just reply to this email.`)}</div>
  </div>`;

  const whitelistBox = `<div style="text-align:center;padding:10px 16px;background:#f7f6f2;border-radius:8px;margin-bottom:8px;">
    <div style="font-size:11px;color:#999;font-family:monospace;line-height:1.7;">${es
      ? `Para asegurarte de que nuestros correos lleguen a tu bandeja de entrada,<br>agrega&nbsp;<strong style="color:#555;">${esc(brand.fromAddress)}</strong> a tus contactos.`
      : `To make sure our emails reach your inbox,<br>please add&nbsp;<strong style="color:#555;">${esc(brand.fromAddress)}</strong> to your contacts.`}</div>
  </div>`;

  const subject = es ? `Pedido Confirmado — ${d.order_number}` : `Order Confirmed — ${d.order_number}`;
  return { subject, html: wrapEmail(brand, es ? "Confirmación de Pedido" : "Order Confirmation", greeting + orderCard + itemsCard + shipCard + paymentBox + nextBox + whitelistBox) };
}

function buildAlert(brand, d) {
  // Internal notification to Bruno — always English regardless of order language
  const isCard = d.card_payment === true || d.card_payment === "true";

  const cardBanner = isCard
    ? `<div style="background:#7f1d1d;border:3px solid #ef4444;border-radius:10px;padding:20px 22px;margin-bottom:20px;text-align:center;">
    <div style="font-size:22px;font-weight:800;color:#ffffff;letter-spacing:.02em;line-height:1.4;">🚨 CARD / KLARNA ORDER 🚨</div>
    <div style="font-size:16px;font-weight:800;color:#fecaca;margin-top:6px;">ACTION REQUIRED — SEND PAYMENT LINK</div>
    <div style="font-size:12px;color:#fca5a5;margin-top:10px;line-height:1.7;">The customer was told a secure payment link will arrive by email <strong style="color:#ffffff;">within a few minutes</strong>. Generate the payment link for <strong style="color:#ffffff;">$${esc(fmtMoney(d.total))}</strong> and email it to <strong style="color:#ffffff;">${esc(d.customer_email_actual || d.customer_email)}</strong> now.</div>
    ${d.processing_fee && d.processing_fee !== "None" ? `<div style="font-size:11px;color:#fca5a5;margin-top:8px;font-family:monospace;">6% fee included in total: ${esc(d.processing_fee)}</div>` : ""}
  </div>`
    : "";

  const greeting = isCard
    ? `<div style="font-size:15px;color:#0f0f0f;margin-bottom:20px;line-height:1.6;">💳 New <strong>card/Klarna</strong> order &mdash; payment link must be sent manually.</div>`
    : `<div style="font-size:15px;color:#0f0f0f;margin-bottom:20px;line-height:1.6;">🔔 New order placed &mdash; check the back office.</div>`;
  const orderCard = orderNumberCard(d.order_number, "Customer: " + (d.customer_name || ""));
  const detailsCard = card(`
    ${fieldLabel("Order Details")}
    ${lineRow("Customer email", d.customer_email_actual || d.customer_email)}
    ${lineRow("Items", d.items_summary)}
    ${lineRow("Payment method", d.payment_method)}
    ${isCard && d.processing_fee && d.processing_fee !== "None" ? lineRow("Processing fee", d.processing_fee) : ""}
    ${lineRow("Notes", d.notes)}
    <div style="display:flex;justify-content:space-between;padding-top:10px;margin-top:6px;border-top:1px solid #e2e0d8;">
      <span style="font-size:13px;font-weight:bold;color:#0f0f0f;">TOTAL</span>
      <span style="font-size:15px;font-weight:800;color:#0f0f0f;font-family:monospace;">$${esc(fmtMoney(d.total))}</span>
    </div>
  `);
  const subject = isCard
    ? `🚨💳 ACTION REQUIRED: Send Payment Link — ${d.order_number}`
    : `🔔 New Order — ${d.order_number}`;
  return { subject, html: wrapEmail(brand, isCard ? "Card Order — Send Payment Link" : "New Order Alert", cardBanner + greeting + orderCard + detailsCard) };
}

function buildTracking(brand, d) {
  const es = brand.lang === "es";
  const greeting = es
    ? `<div style="font-size:15px;color:#0f0f0f;margin-bottom:20px;line-height:1.6;">Hola <strong>${esc(d.customer_name || "cliente")}</strong>,<br>¡Buenas noticias &mdash; tu pedido va en camino! 📦</div>`
    : `<div style="font-size:15px;color:#0f0f0f;margin-bottom:20px;line-height:1.6;">Hi <strong>${esc(d.customer_name || "there")}</strong>,<br>Great news &mdash; your order is on its way!</div>`;

  const orderCard = card(`
    <div style="font-size:10px;font-weight:bold;text-transform:uppercase;letter-spacing:.08em;color:#888;margin-bottom:4px;">${es ? "Número de Pedido" : "Order Number"}</div>
    <div style="font-size:18px;font-weight:800;color:#0f0f0f;font-family:monospace;">${esc(d.order_number)}</div>
  `, 16);

  const carrierLabel = d.carrier ? esc(d.carrier) + " " : "";
  const trackingBox = `<div style="background:#0f0f0f;border-radius:10px;padding:20px 22px;margin-bottom:16px;text-align:center;">
    <div style="font-size:10px;font-weight:bold;text-transform:uppercase;letter-spacing:.08em;color:rgba(255,255,255,0.4);margin-bottom:8px;">${carrierLabel}${es ? "Número de Rastreo" : "Tracking Number"}</div>
    <div style="font-size:26px;font-weight:800;color:${brand.accent};font-family:monospace;letter-spacing:.04em;">${esc(d.tracking_number)}</div>
    <div style="font-size:12px;color:rgba(255,255,255,0.35);margin-top:8px;">${es ? "Toca el botón para rastrear tu paquete" : "Tap the button below to track your package"}</div>
  </div>`;

  const trackButton = `<div style="text-align:center;margin-bottom:20px;">
    <a style="display:inline-block;padding:14px 36px;background:${brand.accent};color:#0f0f0f;font-weight:800;font-size:15px;border-radius:10px;text-decoration:none;font-family:'Segoe UI',sans-serif;letter-spacing:.04em;" href="${esc(d.tracking_url)}" target="_blank" rel="noopener">${es ? "📦 Rastrear Tu Paquete →" : "📦 Track Your Package →"}</a>
    <div style="font-size:11px;color:#999;margin-top:10px;font-family:monospace;">${es ? "Si el botón no funciona, toca este enlace:" : "If the button doesn't work, tap this link:"}</div>
    <div style="margin-top:6px;"><a style="font-size:12px;color:#1a73e8;font-family:monospace;word-break:break-all;" href="${esc(d.tracking_url)}" target="_blank" rel="noopener">${esc(d.tracking_url)}</a></div>
  </div>`;

  const shipCard = card(`
    <div style="font-size:10px;font-weight:bold;text-transform:uppercase;letter-spacing:.08em;color:#888;margin-bottom:10px;">${es ? "Enviar A" : "Shipping To"}</div>
    <div style="font-size:13px;color:#0f0f0f;line-height:1.6;">${esc(d.shipping_address)}</div>
  `, 16);

  const itemsCard = card(`
    <div style="font-size:10px;font-weight:bold;text-transform:uppercase;letter-spacing:.08em;color:#888;margin-bottom:10px;">${es ? "Artículos" : "Items"}</div>
    <div style="font-size:13px;color:#0f0f0f;line-height:1.8;">${esc(d.items_summary)}</div>
  `, 24);

  const noteBox = `<div style="background:#e8f5e9;border:1px solid #a5d6a7;border-radius:10px;padding:14px 16px;margin-bottom:16px;">
    <div style="font-size:12px;color:#1b5e20;line-height:1.6;">${es
      ? `📬 <strong>El rastreo puede tardar 24&ndash;48 horas</strong> en mostrar actividad después de esta notificación. Si tienes preguntas, responde a este correo.`
      : `📬 <strong>Tracking may take 24&ndash;48 hours</strong> to show activity after this notification. If you have any questions reply to this email.`}</div>
  </div>`;

  const whitelistBox = `<div style="text-align:center;padding:10px 16px;background:#f7f6f2;border-radius:8px;margin-bottom:8px;">
    <div style="font-size:11px;color:#999;font-family:monospace;line-height:1.7;">${es
      ? `Para asegurarte de que nuestros correos lleguen a tu bandeja de entrada,<br>agrega&nbsp;<strong style="color:#555;">${esc(brand.fromAddress)}</strong> a tus contactos.`
      : `To make sure our emails reach your inbox,<br>please add&nbsp;<strong style="color:#555;">${esc(brand.fromAddress)}</strong> to your contacts.`}</div>
  </div>`;

  const subject = es ? `Enviado — Pedido ${d.order_number}` : `Shipped — Order ${d.order_number}`;
  return { subject, html: wrapEmail(brand, es ? "Tu Pedido Ha Sido Enviado" : "Your Order Has Shipped", greeting + orderCard + trackingBox + trackButton + shipCard + itemsCard + noteBox + whitelistBox) };
}

function buildReminder(brand, d) {
  const es = brand.lang === "es";
  const greeting = es
    ? `<div style="font-size:15px;color:#0f0f0f;margin-bottom:20px;line-height:1.6;">Hola <strong>${esc(d.customer_name || "cliente")}</strong>,<br>Solo un recordatorio amistoso de que tu pedido está reservado y esperando el pago.</div>`
    : `<div style="font-size:15px;color:#0f0f0f;margin-bottom:20px;line-height:1.6;">Hi <strong>${esc(d.customer_name || "there")}</strong>,<br>Just a friendly reminder that your order below is reserved and waiting for payment.</div>`;
  const orderCard = orderNumberCard(d.order_number);
  const warn = amberBox(es
    ? "⏰ Ten en cuenta: los pedidos que permanecen sin pagar después de 48 horas se liberan automáticamente para que los artículos vuelvan al inventario."
    : "⏰ Please note: orders that remain unpaid after 48 hours are automatically released so the items can return to stock.");
  const totalBox = card(`${fieldLabel(es ? "Total del Pedido" : "Order Total")}<div style="font-size:20px;font-weight:800;color:#0f0f0f;font-family:monospace;">$${esc(fmtMoney(d.total))}</div>`);
  const isCard = d.card_payment === true || d.card_payment === "true";
  const hasLink = isCard && d.payment_link && /^https:\/\//.test(d.payment_link);
  const payments = isCard
    ? card(`
    ${fieldLabel(es ? "Cómo Pagar" : "How To Pay")}
    ${hasLink
      ? `<div style="text-align:center;padding:6px 0 2px;">
      <a style="display:inline-block;padding:14px 38px;background:${brand.accent};color:#0f0f0f;font-weight:800;font-size:15px;border-radius:10px;text-decoration:none;font-family:'Segoe UI',sans-serif;letter-spacing:.04em;" href="${esc(d.payment_link)}" target="_blank" rel="noopener">${es ? "💳 Pagar Ahora →" : "💳 Pay Now →"}</a>
      <div style="margin-top:8px;"><a style="font-size:11px;color:#1a73e8;font-family:monospace;word-break:break-all;" href="${esc(d.payment_link)}" target="_blank" rel="noopener">${esc(d.payment_link)}</a></div>
    </div>`
      : `<div style="font-size:13px;color:#0f0f0f;line-height:1.7;">${es
        ? `💳 Elegiste <strong>Tarjeta de Crédito/Débito / Klarna</strong>. Revisa tu bandeja de entrada (y la carpeta de spam) para encontrar el correo con tu <strong>enlace de pago seguro</strong> y completa tu pago ahí.`
        : `💳 You chose <strong>Credit/Debit Card / Klarna</strong>. Check your inbox (and spam folder) for the email with your <strong>secure payment link</strong> and complete your payment there.`}</div>`}
    <div style="font-size:12px;color:#888;line-height:1.7;margin-top:8px;">${es
      ? "¿Problemas con el pago? Solo responde a este mensaje y te ayudaremos de inmediato."
      : "Any trouble paying? Just reply to this message and we'll help right away."}</div>
  `)
    : card(`
    ${fieldLabel(es ? "Opciones de Pago" : "Payment Options")}
    <div style="margin-bottom:10px;"><div style="font-size:11px;font-weight:bold;color:#888;">CASHAPP</div><div style="font-size:14px;color:#0f0f0f;">$BoldResearch</div></div>
    <div style="margin-bottom:10px;"><div style="font-size:11px;font-weight:bold;color:#888;">VENMO</div><div style="font-size:14px;color:#0f0f0f;">@Bold-Research-14</div></div>
    <div><div style="font-size:11px;font-weight:bold;color:#888;">PAYPAL</div><div style="font-size:14px;color:#0f0f0f;">@BrunoM64</div></div>
  `);
  const closing = `<div style="font-size:13px;color:#555;line-height:1.75;">${isCard
    ? (es
      ? "Una vez que tu pago se procese, enviaremos tu pedido de inmediato. ¿Ya pagaste? Ignora este mensaje."
      : "Once your payment goes through we'll ship right away. Already paid? Just disregard this message.")
    : (es
      ? "Una vez enviado el pago, responde a este correo con tu confirmación y lo enviaremos de inmediato. ¿Ya pagaste? Ignora este mensaje."
      : "Once payment is sent, just reply to this email with your confirmation and we'll ship right away. Already paid? Just disregard this message.")}</div>`;
  const subject = es ? `Recordatorio de Pago — Pedido ${d.order_number}` : `Payment Reminder — Order ${d.order_number}`;
  return { subject, html: wrapEmail(brand, es ? "Recordatorio de Pago" : "Payment Reminder", greeting + orderCard + warn + totalBox + payments + closing) };
}

function buildPaymentLink(brand, d) {
  const es = brand.lang === "es";
  const greeting = es
    ? `<div style="font-size:15px;color:#0f0f0f;margin-bottom:20px;line-height:1.6;">Hola <strong>${esc(d.customer_name || "cliente")}</strong>,<br>¡Tu enlace de pago seguro está listo! Completa tu pago abajo para que podamos procesar tu pedido.</div>`
    : `<div style="font-size:15px;color:#0f0f0f;margin-bottom:20px;line-height:1.6;">Hi <strong>${esc(d.customer_name || "there")}</strong>,<br>Your secure payment link is ready! Complete your payment below and we'll get your order moving.</div>`;
  const orderCard = orderNumberCard(d.order_number);
  const totalBox = card(`${fieldLabel(es ? "Total a Pagar" : "Amount Due")}<div style="font-size:24px;font-weight:800;color:#0f0f0f;font-family:monospace;">$${esc(fmtMoney(d.total))}</div><div style="font-size:11px;color:#888;margin-top:4px;">${es ? "Incluye la tarifa de procesamiento del 6%" : "Includes the 6% card processing fee"}</div>`);
  const payButton = `<div style="text-align:center;margin-bottom:20px;">
    <a style="display:inline-block;padding:16px 44px;background:${brand.accent};color:#0f0f0f;font-weight:800;font-size:16px;border-radius:10px;text-decoration:none;font-family:'Segoe UI',sans-serif;letter-spacing:.04em;" href="${esc(d.payment_link)}" target="_blank" rel="noopener">${es ? "💳 Pagar Ahora →" : "💳 Pay Now →"}</a>
    <div style="font-size:11px;color:#999;margin-top:10px;font-family:monospace;">${es ? "Si el botón no funciona, toca este enlace:" : "If the button doesn't work, tap this link:"}</div>
    <div style="margin-top:6px;"><a style="font-size:12px;color:#1a73e8;font-family:monospace;word-break:break-all;" href="${esc(d.payment_link)}" target="_blank" rel="noopener">${esc(d.payment_link)}</a></div>
  </div>`;
  const noteBox = `<div style="background:#e8f5e9;border:1px solid #a5d6a7;border-radius:10px;padding:14px 16px;margin-bottom:16px;">
    <div style="font-size:12px;color:#1b5e20;line-height:1.6;">🔒 ${es
      ? "El pago se procesa a través de nuestro procesador de pagos de confianza. Puedes pagar con tarjeta de crédito, débito o Klarna."
      : "Payment is handled through our trusted payment processor. You can pay by credit card, debit card, or Klarna."}</div>
  </div>`;
  const closing = `<div style="font-size:13px;color:#555;line-height:1.75;">${es
    ? "Una vez que tu pago se procese, prepararemos tu pedido y te enviaremos el número de rastreo. ¿Preguntas? Responde a este correo."
    : "Once your payment goes through we'll get your order prepared and send you tracking. Questions? Just reply to this email."}</div>`;
  const subject = es ? `💳 Tu Enlace de Pago — Pedido ${d.order_number}` : `💳 Your Payment Link — Order ${d.order_number}`;
  return { subject, html: wrapEmail(brand, es ? "Completa Tu Pago" : "Complete Your Payment", greeting + orderCard + totalBox + payButton + noteBox + closing) };
}

function buildCancelled(brand, d) {
  const es = brand.lang === "es";
  const greeting = es
    ? `<div style="font-size:15px;color:#0f0f0f;margin-bottom:20px;line-height:1.6;">Hola <strong>${esc(d.customer_name || "cliente")}</strong>,<br>Queríamos darte una actualización rápida sobre tu pedido reciente.</div>`
    : `<div style="font-size:15px;color:#0f0f0f;margin-bottom:20px;line-height:1.6;">Hi <strong>${esc(d.customer_name || "there")}</strong>,<br>We wanted to give you a quick update on your recent order.</div>`;
  const orderCard = orderNumberCard(d.order_number, (es ? "Realizado el " : "Placed on ") + (d.order_date || ""));
  const explain = `<div style="font-size:14px;color:#0f0f0f;line-height:1.75;margin-bottom:20px;">${es
    ? "Notamos que este pedido aún no ha sido pagado &mdash; ¡no te preocupes, eso pasa! Como han pasado 48 horas, hemos liberado esos artículos de vuelta a nuestro inventario para que otros clientes puedan acceder a ellos."
    : "We noticed this order hasn't been paid yet &mdash; no worries at all, these things happen! Since 48 hours have passed we've gone ahead and released those items back to our inventory so other customers can access them."}</div>`;
  const highlight = highlightBox(
    brand,
    es ? "¿Aún interesado? 👋" : "Still interested? 👋",
    es
      ? "¡Tus favoritos podrían seguir disponibles! Regresa a nuestro formulario de pedido y haz un nuevo pedido &mdash; solo toma un minuto. Si tuviste algún problema con el pago o tienes preguntas, responde a este correo y te atenderemos personalmente."
      : "Your favorites may still be available! Head back to our order form and place a new order &mdash; it only takes a minute. If you ran into any issues with payment or have questions, just reply to this email and we'll take care of you personally.",
    es ? "Ver Formulario de Pedido →" : "View Order Form →",
    brand.orderFormUrl
  );
  const closing = `<div style="font-size:13px;color:#555;line-height:1.75;">${es
    ? "Gracias por ser parte de nuestra comunidad &mdash; ¡esperamos ver tu pedido pronto! 🙏"
    : "Thanks for being part of our community &mdash; we hope to see your order soon! 🙏"}</div>`;
  const subject = es ? `Pedido Cancelado — ${d.order_number}` : `Order Cancelled — ${d.order_number}`;
  return { subject, html: wrapEmail(brand, es ? "Actualización de Pedido" : "Order Update", greeting + orderCard + explain + highlight + closing) };
}

function buildQuote(brand, d) {
  const es = brand.lang === "es";
  const greeting = es
    ? `<div style="font-size:15px;color:#0f0f0f;margin-bottom:20px;line-height:1.6;">Hola <strong>${esc(d.customer_name || "cliente")}</strong>,<br>Aquí tienes tu cotización de pedido.</div>`
    : `<div style="font-size:15px;color:#0f0f0f;margin-bottom:20px;line-height:1.6;">Hi <strong>${esc(d.customer_name || "there")}</strong>,<br>Here's your order quote.</div>`;
  const orderCard = orderNumberCard(d.order_number);
  const itemsHtml = (d.items_table || "").split("\n").filter(Boolean).map(line =>
    `<div style="font-size:13px;color:#0f0f0f;padding:3px 0;">${esc(line)}</div>`
  ).join("");
  const itemsCard = card(`
    ${fieldLabel(es ? "Artículos" : "Items")}
    ${itemsHtml}
    <div style="display:flex;justify-content:space-between;padding-top:10px;margin-top:10px;border-top:1px solid #e2e0d8;font-size:15px;font-weight:bold;">
      <span>${es ? "Total" : "Total"}</span><span style="font-family:monospace;">$${esc(fmtMoney(d.total))}</span>
    </div>
  `);
  const payments = card(`
    ${fieldLabel(es ? "Opciones de Pago" : "Payment Options")}
    <div style="margin-bottom:10px;"><div style="font-size:11px;font-weight:bold;color:#888;">CASHAPP</div><div style="font-size:14px;color:#0f0f0f;">$BoldResearch</div></div>
    <div style="margin-bottom:10px;"><div style="font-size:11px;font-weight:bold;color:#888;">VENMO</div><div style="font-size:14px;color:#0f0f0f;">@Bold-Research-14</div></div>
    <div><div style="font-size:11px;font-weight:bold;color:#888;">PAYPAL</div><div style="font-size:14px;color:#0f0f0f;">@BrunoM64</div></div>
  `);
  const closing = `<div style="font-size:13px;color:#555;line-height:1.75;">${es
    ? "Una vez enviado el pago, por favor responde a este correo con tu confirmación de pago y dirección de envío y pondremos tu pedido en camino."
    : "Once payment is sent, please reply to this email with your payment confirmation and shipping address and we'll get your order on its way."}</div>`;
  const subject = es ? `Cotización de Pedido — ${d.order_number}` : `Order Quote — ${d.order_number}`;
  return { subject, html: wrapEmail(brand, es ? "Cotización de Pedido" : "Order Quote", greeting + orderCard + itemsCard + payments + closing) };
}

const BUILDERS = {
  confirmation: buildConfirmation,
  alert: buildAlert,
  tracking: buildTracking,
  reminder: buildReminder,
  payment_link: buildPaymentLink,
  cancelled: buildCancelled,
  quote: buildQuote,
};

exports.handler = async function (event) {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }
  if (!RESEND_API_KEY) {
    return { statusCode: 500, body: JSON.stringify({ error: "RESEND_API_KEY not configured" }) };
  }

  let payload;
  try {
    payload = JSON.parse(event.body || "{}");
  } catch (e) {
    return { statusCode: 400, body: JSON.stringify({ error: "Invalid JSON" }) };
  }

  const { type, brand: brandKey, data } = payload;
  const builder = BUILDERS[type];
  if (!builder) {
    return { statusCode: 400, body: JSON.stringify({ error: "Unknown type: " + type }) };
  }

  const brand = brandOf(brandKey);
  const d = data || {};
  const { subject, html } = builder(brand, d);

  const isAlert = type === "alert";
  const to = isAlert ? ALERT_EMAIL : d.customer_email;
  if (!to) {
    return { statusCode: 400, body: JSON.stringify({ error: "Missing recipient email" }) };
  }

  const replyTo = isAlert ? (d.customer_email || undefined) : ALERT_EMAIL;

  const message = {
    from: `${brand.name} <${brand.fromAddress}>`,
    to: [to],
    reply_to: replyTo,
    subject: subject,
    html: html,
    tags: [{ name: "category", value: `${brandKey || "BRL"}-${type}` }],
  };

  try {
    console.log("Sending via Resend:", JSON.stringify({ from: message.from, to: message.to, subject: message.subject }));
    const resp = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(message),
    });
    const result = await resp.json();
    console.log("Resend response:", resp.status, JSON.stringify(result));
    if (!resp.ok) {
      return { statusCode: resp.status, body: JSON.stringify({ error: result.message || "Resend error", details: result }) };
    }
    return { statusCode: 200, body: JSON.stringify({ ok: true, messageId: result.id }) };
  } catch (e) {
    console.error("Send failed:", e.message);
    return { statusCode: 500, body: JSON.stringify({ error: e.message }) };
  }
};
