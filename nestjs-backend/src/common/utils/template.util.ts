/**
 * Replace `{{name}}` placeholders with values. Unknown placeholders are left as
 * they are, so a typo in a campaign template is visible rather than silently
 * blank. `transform` lets a caller escape values (e.g. HTML for email).
 */
export function renderTemplate(
  template: string,
  variables: Record<string, string>,
  transform: (value: string) => string = v => v,
): string {
  return Object.entries(variables).reduce(
    (text, [key, value]) => text.split(`{{${key}}}`).join(transform(value ?? '')),
    template ?? '',
  );
}
