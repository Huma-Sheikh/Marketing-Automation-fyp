const HTML_ENTITIES: Record<string, string> = {
  '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&#39;', '"': '&quot;',
};
const XML_ENTITIES: Record<string, string> = {
  '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;',
};

/** Escape untrusted text for an HTML body (e.g. scraped lead data in an email). */
export const escapeHtml = (value: unknown): string =>
  String(value ?? '').replace(/[<>&'"]/g, c => HTML_ENTITIES[c]);

/** Escape untrusted text for an XML attribute (e.g. TwiML parameters). */
export const escapeXml = (value: unknown): string =>
  String(value ?? '').replace(/[<>&'"]/g, c => XML_ENTITIES[c]);
