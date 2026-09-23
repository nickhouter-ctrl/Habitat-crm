import { windowsMailButton, windowsMailLayout, windowsMailNote } from "./windows-mail-layout";

type Lang = "nl" | "en" | "es" | "de";
const pickLang = (locale: string | null): Lang => (locale === "nl" || locale === "es" || locale === "de" ? locale : "en");
const escape = (s: string) => s.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** Activatie voor het kozijnenportaal; link blijft op de Windows-site. */
export function windowsActivationMail(name: string, token: string, locale: string | null) {
  const language = pickLang(locale);
  const messages: Record<Lang, { subject: string; eyebrow: string; title: string; hello: string; body: string; next: string; button: string; expiry: string; broken: string }> = {
    nl: { subject: "Welkom als dealer van Habitat One Windows — stel je wachtwoord in", eyebrow: "Welkom als dealer", title: "Je dealeraccount is goedgekeurd", hello: "Beste", body: "Je aanvraag om dealer te worden van Habitat One Windows is goedgekeurd. Kies via de knop hieronder je wachtwoord; daarna log je in met je e-mailadres en dat wachtwoord.", next: "In het portaal configureer je aluminium kozijnen tot op de millimeter, meet je in met je telefoon en maak je offertes met je eigen marge en logo.", button: "Wachtwoord instellen", expiry: "Deze link is 7 dagen geldig.", broken: "Werkt de knop niet? Kopieer deze link:" },
    en: { subject: "Welcome as a Habitat One Windows dealer — set your password", eyebrow: "Welcome as a dealer", title: "Your dealer account has been approved", hello: "Dear", body: "Your application to become a Habitat One Windows dealer has been approved. Use the button below to choose your password; then sign in with your email address and that password.", next: "In the portal you configure aluminium windows to the millimetre, measure with your phone and create quotations with your own margin and logo.", button: "Set password", expiry: "This link is valid for 7 days.", broken: "Button not working? Copy this link:" },
    es: { subject: "Bienvenido como distribuidor de Habitat One Windows — crea tu contraseña", eyebrow: "Bienvenido como distribuidor", title: "Tu cuenta de distribuidor ha sido aprobada", hello: "Estimado/a", body: "Tu solicitud para ser distribuidor de Habitat One Windows ha sido aprobada. Elige tu contraseña con el botón; después inicia sesión con tu correo y esa contraseña.", next: "En el portal configuras ventanas de aluminio al milímetro, mides con tu teléfono y creas presupuestos con tu propio margen y logotipo.", button: "Crear contraseña", expiry: "Este enlace es válido durante 7 días.", broken: "¿No funciona el botón? Copia este enlace:" },
    de: { subject: "Willkommen als Habitat One Windows-Händler — Passwort festlegen", eyebrow: "Willkommen als Händler", title: "Dein Händlerkonto wurde freigegeben", hello: "Hallo", body: "Dein Antrag, Händler von Habitat One Windows zu werden, wurde genehmigt. Lege über die Schaltfläche dein Passwort fest; danach meldest du dich mit deiner E-Mail-Adresse und diesem Passwort an.", next: "Im Portal konfigurierst du Aluminiumfenster millimetergenau, misst mit dem Telefon auf und erstellst Angebote mit eigener Marge und eigenem Logo.", button: "Passwort festlegen", expiry: "Dieser Link ist 7 Tage gültig.", broken: "Funktioniert die Schaltfläche nicht? Kopiere diesen Link:" },
  };
  const m = messages[language];
  const link = `https://windows.habitat-one.com/activate?token=${encodeURIComponent(token)}&lang=${language === "de" ? "en" : language}`;
  const html = windowsMailLayout(m.title, `<p>${m.hello} ${escape(name)},</p><p>${m.body}</p><p>${m.next}</p>${windowsMailButton(link, m.button)}${windowsMailNote(`${m.expiry} ${m.broken} <a href="${link}" style="color:#8a8177">${link}</a>`)}`, { eyebrow: m.eyebrow });
  return { subject: m.subject, html, text: `${m.hello} ${name},\n\n${m.body}\n\n${m.next}\n\n${link}\n\n${m.expiry}` };
}

export function windowsAccessReadyMail(locale: string | null) {
  const language = pickLang(locale);
  const m: Record<Lang, { subject: string; eyebrow: string; title: string; body: string; button: string }> = {
    nl: { subject: "Habitat One Windows — je toegang is goedgekeurd", eyebrow: "Welkom als dealer", title: "Je hebt nu toegang tot Habitat One Windows", body: "Log in met het e-mailadres en wachtwoord van je bestaande Habitat One-account.", button: "Inloggen" },
    en: { subject: "Habitat One Windows — your access has been approved", eyebrow: "Welcome as a dealer", title: "You now have access to Habitat One Windows", body: "Sign in with the email address and password of your existing Habitat One account.", button: "Sign in" },
    es: { subject: "Habitat One Windows — tu acceso ha sido aprobado", eyebrow: "Bienvenido como distribuidor", title: "Ya tienes acceso a Habitat One Windows", body: "Inicia sesión con el correo y la contraseña de tu cuenta Habitat One existente.", button: "Iniciar sesión" },
    de: { subject: "Habitat One Windows — dein Zugang wurde freigegeben", eyebrow: "Willkommen als Händler", title: "Du hast jetzt Zugang zu Habitat One Windows", body: "Melde dich mit der E-Mail-Adresse und dem Passwort deines bestehenden Habitat One-Kontos an.", button: "Anmelden" },
  }[language];
  const link = "https://windows.habitat-one.com/login";
  return { subject: m.subject, text: `${m.body}\n\n${link}`, html: windowsMailLayout(m.title, `<p>${m.body}</p>${windowsMailButton(link, m.button)}`, { eyebrow: m.eyebrow }) };
}
